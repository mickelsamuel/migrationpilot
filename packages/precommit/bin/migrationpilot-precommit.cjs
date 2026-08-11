#!/usr/bin/env node
'use strict';

/**
 * migrationpilot-precommit — launcher for the MigrationPilot pre-commit hook.
 *
 * The pre-commit framework installs a `language: node` hook by running
 * `npm install -g git+file://<hook repo>` plus any `additional_dependencies`.
 * The MigrationPilot repo does not commit its build output, and npm runs a git
 * dependency's `prepare` script in a staging clone that has no node_modules,
 * so the CLI cannot be built at hook-install time. This package exists so the
 * hook has a real bin to call: it carries a different npm name than
 * `migrationpilot` (same trick as `migrationpilot-mcp`), so pre-commit can
 * install it alongside the hook repo and pull the prebuilt CLI from npm.
 *
 * pre-commit appends the staged files it matched, so argv is rewritten into
 * the CLI's `precommit` subcommand and the CLI is run in-process — its own
 * runtime dependencies (libpg-query, etc.) resolve from its own node_modules.
 */

let entry;
try {
  entry = require.resolve('migrationpilot/cli');
} catch (err) {
  process.stderr.write(
    'migrationpilot-precommit: could not find the MigrationPilot CLI.\n' +
      'This launcher needs a "migrationpilot" install that exposes the "./cli"\n' +
      'export and the `precommit` subcommand. Reinstall the hook to pick up a\n' +
      'current version: pre-commit clean && pre-commit install --install-hooks\n' +
      String((err && err.stack) || err) +
      '\n'
  );
  process.exit(1);
}

// commander parses process.argv, so present the CLI with the invocation it
// expects: `migrationpilot precommit <file>...`.
process.argv = [process.argv[0], entry, 'precommit', ...process.argv.slice(2)];
require(entry);
