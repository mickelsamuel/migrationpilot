#!/usr/bin/env node
/**
 * Build script for MigrationPilot.
 * Bundles CLI, GitHub Action, and programmatic API with esbuild.
 * Injects MIGRATIONPILOT_SIGNING_SECRET at build time for license validation.
 */
import { execSync } from 'node:child_process';
import { realpathSync, mkdirSync, cpSync } from 'node:fs';

const signingSecret = process.env.MIGRATIONPILOT_SIGNING_SECRET || 'mp-dev-signing-secret-do-not-use-in-production';

const define = `--define:__MP_SIGNING_SECRET__='"${signingSecret}"'`;

// CLI bundle (CJS for commander/require compatibility)
execSync(`esbuild src/cli.ts --bundle --platform=node --target=node20 --format=cjs --outfile=dist/cli.cjs --external:pg-native --external:libpg-query ${define}`, { stdio: 'inherit' });

// GitHub Action bundle (CJS)
execSync(`esbuild src/action/index.ts --bundle --platform=node --target=node20 --format=cjs --outfile=dist/action/index.js --external:pg-native --external:libpg-query ${define}`, { stdio: 'inherit' });

// Programmatic API bundle (ESM, external heavy deps)
execSync(`esbuild src/index.ts --bundle --platform=node --target=node20 --format=esm --outfile=dist/index.js --external:pg-native --external:libpg-query --external:pg --external:stripe --external:yaml ${define}`, { stdio: 'inherit' });

// Type declarations
execSync('tsc --emitDeclarationOnly --declaration --outDir dist', { stdio: 'inherit' });

// Copy WASM dependencies for action
for (const pkg of ['libpg-query', '@pgsql/types']) {
  const src = realpathSync(`node_modules/${pkg}`);
  const dst = `dist/action/node_modules/${pkg}`;
  mkdirSync(dst, { recursive: true });
  cpSync(src, dst, { recursive: true });
}

console.log('Build complete.');
