#!/usr/bin/env node
/**
 * Structural check on the built GitHub Action bundle.
 *
 * Two things have to be true before the bundle is worth tagging, and neither
 * shows up in the test suite because the suite imports TypeScript sources
 * rather than the bundle:
 *
 *   1. Every module the bundle leaves external is actually shipped next to it.
 *      libpg-query and @pgsql/types are excluded from the esbuild bundle and
 *      copied into dist/action/node_modules by scripts/build.js.
 *   2. Node loads the bundle as CommonJS. The root package is "type": "module",
 *      so a bare .js under it is ESM and `require` does not exist — the bundle
 *      dies on its first line. dist/action/package.json scopes it back.
 *
 * Running the bundle with no Action inputs is expected to fail; what matters is
 * which failure. "Input required and not supplied" means it loaded and reached
 * its own argument handling. A module or syntax error means it never would.
 *
 * Usage: node scripts/check-action-bundle.mjs [--dir <dist/action>]
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dirArg = process.argv.indexOf('--dir');
const DIR = resolve(dirArg === -1 ? join(root, 'dist/action') : process.argv[dirArg + 1]);

const problems = [];
const entry = join(DIR, 'index.js');

if (!existsSync(entry)) {
  problems.push(`${entry} does not exist — action.yml's \`main\` points at nothing`);
}

// action.yml is the contract with GitHub; the entry it names is the one to check.
const actionYml = readFileSync(join(root, 'action.yml'), 'utf-8');
const declaredMain = actionYml.match(/^\s*main:\s*['"]?([^'"\s]+)/m)?.[1];
if (declaredMain !== 'dist/action/index.js') {
  problems.push(`action.yml names \`${declaredMain}\` as its entry; this check expects dist/action/index.js`);
}

// GitHub has no node22 runtime — actions went from node20 straight to node24 —
// and action.yml claimed one, which the runner rejects before it loads a byte
// of the bundle. node20 leaves the runners in late 2026.
const RUNTIMES = ['node24'];
const declaredUsing = actionYml.match(/^\s*using:\s*['"]?([^'"\s]+)/m)?.[1];
if (!RUNTIMES.includes(declaredUsing)) {
  problems.push(
    `action.yml runs.using is \`${declaredUsing}\`; GitHub accepts ${RUNTIMES.join(', ')}`,
  );
}

const sentinel = join(DIR, 'package.json');
if (!existsSync(sentinel)) {
  problems.push(`${sentinel} is missing — Node will read the CommonJS bundle as ESM`);
} else if (JSON.parse(readFileSync(sentinel, 'utf-8')).type !== 'commonjs') {
  problems.push(`${sentinel} does not declare "type": "commonjs"`);
}

for (const pkg of ['libpg-query', '@pgsql/types']) {
  if (!existsSync(join(DIR, 'node_modules', pkg, 'package.json'))) {
    problems.push(`${pkg} is not shipped in ${DIR}/node_modules — the bundle leaves it external`);
  }
}

if (problems.length === 0) {
  const run = spawnSync(process.execPath, [entry], {
    cwd: root,
    encoding: 'utf-8',
    timeout: 60_000,
    env: { ...process.env, NO_COLOR: '1', MIGRATIONPILOT_NO_UPDATE_CHECK: '1' },
  });
  const out = `${run.stdout ?? ''}${run.stderr ?? ''}`;

  if (/Cannot find module|MODULE_NOT_FOUND|ERR_MODULE_NOT_FOUND/.test(out)) {
    problems.push(`the bundle cannot resolve a module it needs:\n${out.trim()}`);
  } else if (/require is not defined|Unexpected token|SyntaxError/.test(out)) {
    problems.push(`the bundle is being loaded in the wrong module system:\n${out.trim()}`);
  } else if (!out.includes('Input required and not supplied: migration-path')) {
    problems.push(
      `the bundle did not reach its own input handling (exit ${run.status}):\n${out.trim() || '<no output>'}`,
    );
  }
}

if (problems.length > 0) {
  console.error('check-action-bundle: the Action bundle is not shippable');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log('check-action-bundle: OK — entry loads as CommonJS with its externals present.');
