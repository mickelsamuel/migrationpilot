#!/usr/bin/env node
/**
 * Builds single-file MigrationPilot executables with `bun build --compile`.
 *
 * The hard part is libpg-query: it is the real PostgreSQL parser compiled to
 * WASM by Emscripten, and its loader finds the .wasm at runtime with
 * `fs.readFileSync(__dirname + '/libpg-query.wasm')`. Once the CLI is bundled
 * into one file that path no longer exists, and the loader ignores
 * `Module.wasmBinary` (this Emscripten build was not compiled with it wired
 * up), so the bytes cannot simply be handed over.
 *
 * It does honor `Module.instantiateWasm`, which is the supported hook for
 * taking over instantiation. So the build swaps the Emscripten factory for a
 * shim that carries the .wasm inline and instantiates it from memory. Nothing
 * is read from disk and nothing is unpacked to a temp directory — the parser
 * really does live inside the executable.
 *
 * Usage:
 *   node scripts/build-binary.js                 # host platform
 *   node scripts/build-binary.js --all           # every release target
 *   node scripts/build-binary.js --target=bun-linux-x64
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const require = createRequire(import.meta.url);

// Bun's cross-compilation targets. Bun ships a runtime per target, so all of
// these build from a single CI runner.
const RELEASE_TARGETS = [
  'bun-linux-x64',
  'bun-linux-arm64',
  'bun-darwin-x64',
  'bun-darwin-arm64',
  'bun-windows-x64',
];

const args = process.argv.slice(2);
const outDir = resolve(root, 'dist-binary');
const targets = args.includes('--all')
  ? RELEASE_TARGETS
  : args.filter(a => a.startsWith('--target=')).map(a => a.slice('--target='.length));

/** Resolve a file inside the installed libpg-query package. */
function libpgFile(name) {
  return resolve(dirname(require.resolve('libpg-query')), name);
}

/**
 * Write the shim that replaces libpg-query's Emscripten factory.
 *
 * `instantiateWasm` returning an empty object is Emscripten's documented way
 * to say "instantiation is async, I'll call the callback" — the loader wraps
 * this in a promise and waits for `successCallback`.
 */
function writeWasmShim(buildDir) {
  const wasm = readFileSync(libpgFile('libpg-query.wasm'));
  const shimPath = join(buildDir, 'libpg-query-embedded.cjs');

  writeFileSync(
    shimPath,
    `'use strict';
const factory = require(${JSON.stringify(libpgFile('libpg-query.js'))});
const wasmBytes = Buffer.from('${wasm.toString('base64')}', 'base64');

module.exports = function (moduleArg = {}) {
  return factory({
    ...moduleArg,
    instantiateWasm(imports, successCallback) {
      WebAssembly.instantiate(wasmBytes, imports).then(
        ({ instance, module }) => successCallback(instance, module),
      );
      return {};
    },
  });
};
`,
  );

  return { shimPath, wasmBytes: wasm.length };
}

/** esbuild plugin: point libpg-query's internal factory import at the shim. */
function embedWasmPlugin(shimPath) {
  return {
    name: 'embed-libpg-wasm',
    setup(build) {
      build.onResolve({ filter: /^\.\/libpg-query\.js$/ }, args => {
        if (args.importer.includes('libpg-query')) return { path: shimPath };
        return null;
      });
    },
  };
}

async function main() {
  const buildDir = resolve(root, 'dist-binary', '.build');
  rmSync(buildDir, { recursive: true, force: true });
  mkdirSync(buildDir, { recursive: true });

  const { shimPath, wasmBytes } = writeWasmShim(buildDir);
  console.log(`Embedding libpg-query.wasm (${(wasmBytes / 1024 / 1024).toFixed(2)} MB)`);

  // Bundle everything, including the parser. `pg-native` stays external: it is
  // an optional native driver that pg only requires when explicitly asked for.
  const { build } = await import('esbuild');
  const bundlePath = join(buildDir, 'cli.cjs');
  await build({
    entryPoints: [resolve(root, 'src/cli.ts')],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    outfile: bundlePath,
    external: ['pg-native'],
    plugins: [embedWasmPlugin(shimPath)],
    logLevel: 'info',
  });

  const built = [];
  for (const target of targets.length > 0 ? targets : [null]) {
    const suffix = target ? `-${target.replace(/^bun-/, '')}` : '';
    const isWindows = target ? target.includes('windows') : process.platform === 'win32';
    const outfile = join(outDir, `migrationpilot${suffix}${isWindows ? '.exe' : ''}`);

    const bunArgs = ['build', '--compile', bundlePath, '--outfile', outfile];
    if (target) bunArgs.push(`--target=${target}`);

    console.log(`\nCompiling ${target ?? 'host'} -> ${outfile}`);
    execFileSync(process.platform === 'win32' ? 'bun.exe' : 'bun', bunArgs, {
      stdio: 'inherit',
      cwd: root,
    });
    built.push(outfile);
  }

  console.log('\nBuilt:');
  for (const f of built) {
    console.log(`  ${f}  ${(statSync(f).size / 1024 / 1024).toFixed(1)} MB`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
