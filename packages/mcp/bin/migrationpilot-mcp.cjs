#!/usr/bin/env node
'use strict';

/**
 * migrationpilot-mcp — thin launcher for the MigrationPilot MCP server.
 *
 * The server implementation lives in the main `migrationpilot` package
 * (its `dist/mcp.cjs` entry point). This wrapper exists only so the
 * documented `npx migrationpilot-mcp` invocation resolves to a real npm
 * package. It locates the installed `migrationpilot` package's MCP entry
 * point and runs it in-process, so all of migrationpilot's own runtime
 * dependencies (libpg-query, etc.) resolve from its own node_modules.
 */

try {
  // Resolve the MCP server entry point shipped inside the migrationpilot package.
  // Prefer the "./mcp" subpath export; fall back to the raw dist path for older installs.
  let entry;
  try {
    entry = require.resolve('migrationpilot/mcp');
  } catch (_e) {
    entry = require.resolve('migrationpilot/dist/mcp.cjs');
  }
  require(entry);
} catch (err) {
  process.stderr.write(
    'migrationpilot-mcp: could not load the MigrationPilot MCP server.\n' +
      'Make sure the "migrationpilot" package is installed (it is a dependency of this package).\n' +
      String((err && err.stack) || err) +
      '\n'
  );
  process.exit(1);
}
