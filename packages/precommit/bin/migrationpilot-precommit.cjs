#!/usr/bin/env node
'use strict';

/**
 * migrationpilot-precommit — launcher for the MigrationPilot pre-commit hook.
 *
 * The pre-commit framework installs a `language: node` hook by running one
 * `npm install -g git+file://<hook repo> <additional_dependencies>`. The
 * MigrationPilot repo does not commit its build output, and npm runs a git
 * dependency's `prepare` script in a staging clone that has no node_modules,
 * so the CLI cannot be built at hook-install time. This package exists so the
 * hook has a real bin to call, and pulls the prebuilt CLI from npm instead.
 *
 * That pull has to go under a different name than `migrationpilot`. Both
 * installs land in the same npm root, so the hook repo — package name
 * `migrationpilot`, version 1.6.0, no `dist/` — takes that slot first and
 * satisfies any dependency asking for `migrationpilot@^1.6.0`. The registry
 * tarball is then never fetched and this launcher resolves the empty checkout.
 * `migrationpilot-engine` is an npm dependency alias (`npm:migrationpilot@…`):
 * same package off the registry, installed under a name nothing else claims.
 *
 * The subpath is `./cli` because that is what the CLI package's `exports` map
 * declares. A deep specifier such as `migrationpilot-engine/dist/cli.cjs` is
 * undeclared and Node rejects it with ERR_PACKAGE_PATH_NOT_EXPORTED.
 *
 * pre-commit appends the staged files it matched, so argv is rewritten into
 * the CLI's `precommit` subcommand and the CLI is run in-process — its own
 * runtime dependencies (libpg-query, etc.) resolve from its own node_modules.
 */

let entry;
try {
  entry = require.resolve('migrationpilot-engine/cli');
} catch (err) {
  process.stderr.write(
    'migrationpilot-precommit: could not find the MigrationPilot CLI.\n' +
      'This launcher installs the CLI as "migrationpilot-engine" (an npm alias\n' +
      'for the "migrationpilot" package) and needs its "./cli" export and the\n' +
      '`precommit` subcommand. Reinstall the hook to pick up a current version:\n' +
      'pre-commit clean && pre-commit install --install-hooks\n' +
      String((err && err.stack) || err) +
      '\n'
  );
  process.exit(1);
}

// commander parses process.argv, so present the CLI with the invocation it
// expects: `migrationpilot precommit <file>...`.
process.argv = [process.argv[0], entry, 'precommit', ...process.argv.slice(2)];
require(entry);
