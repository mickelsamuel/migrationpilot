const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const isWatch = process.argv.includes('--watch');

/** Copy WASM + node_modules needed at runtime */
function copyRuntimeDeps() {
  const parentNodeModules = path.join(__dirname, '..', 'node_modules');

  for (const pkg of ['libpg-query', '@pgsql/types']) {
    const src = fs.realpathSync(path.join(parentNodeModules, pkg));
    const dst = path.join(__dirname, 'dist', 'node_modules', pkg);
    // Remove existing to avoid symlink conflicts
    if (fs.existsSync(dst)) {
      fs.rmSync(dst, { recursive: true, force: true });
    }
    fs.mkdirSync(dst, { recursive: true });
    fs.cpSync(src, dst, { recursive: true, dereference: true });
  }
}

async function build() {
  const ctx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    outfile: 'dist/extension.js',
    external: ['vscode', 'libpg-query', '@pgsql/types', 'pg-native'],
    format: 'cjs',
    platform: 'node',
    target: 'node18',
    sourcemap: true,
    minify: !isWatch,
    treeShaking: true,
  });

  copyRuntimeDeps();

  if (isWatch) {
    await ctx.watch();
    console.log('Watching for changes...');
  } else {
    await ctx.rebuild();
    await ctx.dispose();
    const stat = fs.statSync('dist/extension.js');
    console.log(`Build complete (${(stat.size / 1024).toFixed(0)}KB)`);
  }
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
