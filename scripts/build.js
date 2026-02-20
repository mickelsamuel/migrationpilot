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
import { realpathSync, mkdirSync, cpSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const esbuild = resolve(__dirname, '..', 'node_modules', '.bin', 'esbuild');
const tsc = resolve(__dirname, '..', 'node_modules', '.bin', 'tsc');

// CLI bundle (CJS for commander/require compatibility)
execSync(`"${esbuild}" src/cli.ts --bundle --platform=node --target=node20 --format=cjs --outfile=dist/cli.cjs --external:pg-native --external:libpg-query`, { stdio: 'inherit' });

// GitHub Action bundle (CJS)
execSync(`"${esbuild}" src/action/index.ts --bundle --platform=node --target=node20 --format=cjs --outfile=dist/action/index.js --external:pg-native --external:libpg-query`, { stdio: 'inherit' });

// Programmatic API bundle (ESM, external heavy deps)
execSync(`"${esbuild}" src/index.ts --bundle --platform=node --target=node20 --format=esm --outfile=dist/index.js --external:pg-native --external:libpg-query --external:pg --external:stripe --external:yaml`, { stdio: 'inherit' });

// MCP Server bundle (CJS)
execSync(`"${esbuild}" src/mcp/server.ts --bundle --platform=node --target=node20 --format=cjs --outfile=dist/mcp.cjs --external:pg-native --external:libpg-query --banner:js="#!/usr/bin/env node"`, { stdio: 'inherit' });

// Type declarations
execSync(`"${tsc}" --emitDeclarationOnly --declaration --outDir dist`, { stdio: 'inherit' });

// Copy WASM dependencies for action
for (const pkg of ['libpg-query', '@pgsql/types']) {
  const src = realpathSync(`node_modules/${pkg}`);
  const dst = `dist/action/node_modules/${pkg}`;
  mkdirSync(dst, { recursive: true });
  cpSync(src, dst, { recursive: true });
}

console.log('Build complete.');
