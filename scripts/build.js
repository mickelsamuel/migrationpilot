#!/usr/bin/env node
/**
 * Build script for MigrationPilot.
 * Bundles CLI, GitHub Action, and programmatic API with esbuild.
 *
 * License key signing uses Ed25519 asymmetric cryptography:
 * - Public key is hardcoded in src/license/validate.ts (safe to distribute)
 * - Private key is server-only (MIGRATIONPILOT_SIGNING_PRIVATE_KEY env var)
 * - No secrets are injected at build time
 */
import { execSync } from 'node:child_process';
import { realpathSync, mkdirSync, cpSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const esbuild = resolve(__dirname, '..', 'node_modules', '.bin', 'esbuild');
const tsc = resolve(__dirname, '..', 'node_modules', '.bin', 'tsc');

// PGlite ships a 16MB WASM engine plus its data image, loaded from disk at
// runtime relative to the package. Bundling it would inline the loader while
// leaving the binaries behind, so `simulate` keeps it external and imports it
// dynamically — no other command pays for it.
const external = '--external:pg-native --external:libpg-query --external:@electric-sql/pglite';

// CLI bundle (CJS for commander/require compatibility)
execSync(`"${esbuild}" src/cli.ts --bundle --platform=node --target=node20 --format=cjs --outfile=dist/cli.cjs ${external}`, { stdio: 'inherit' });

// GitHub Action bundle (CJS)
execSync(`"${esbuild}" src/action/index.ts --bundle --platform=node --target=node20 --format=cjs --outfile=dist/action/index.js ${external}`, { stdio: 'inherit' });

// Programmatic API bundle (ESM, external heavy deps)
execSync(`"${esbuild}" src/index.ts --bundle --platform=node --target=node20 --format=esm --outfile=dist/index.js ${external} --external:pg --external:stripe --external:yaml`, { stdio: 'inherit' });

// MCP Server bundle (CJS) — esbuild preserves the shebang from src/mcp/server.ts,
// so no banner is added here (a banner would duplicate the shebang and break the bin).
execSync(`"${esbuild}" src/mcp/server.ts --bundle --platform=node --target=node20 --format=cjs --outfile=dist/mcp.cjs ${external}`, { stdio: 'inherit' });

// Type declarations
execSync(`"${tsc}" --emitDeclarationOnly --declaration --outDir dist`, { stdio: 'inherit' });

// The action bundle is CommonJS, but the root package is "type": "module", so
// Node would read a bare .js there as ESM and die on the first `require`. The
// CLI and MCP bundles dodge this with a .cjs extension; the action cannot,
// because action.yml's `main` is the path GitHub already publishes. This
// sentinel scopes dist/action back to CommonJS instead.
writeFileSync('dist/action/package.json', JSON.stringify({ type: 'commonjs' }, null, 2) + '\n');

// Copy WASM dependencies for action
for (const pkg of ['libpg-query', '@pgsql/types']) {
  const src = realpathSync(`node_modules/${pkg}`);
  const dst = `dist/action/node_modules/${pkg}`;
  mkdirSync(dst, { recursive: true });
  cpSync(src, dst, { recursive: true });
}

console.log('Build complete.');
