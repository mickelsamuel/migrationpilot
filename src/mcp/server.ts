#!/usr/bin/env node

/**
 * MigrationPilot MCP Server
 *
 * Exposes migration analysis tools via the Model Context Protocol,
 * enabling AI assistants to analyze PostgreSQL migrations inline.
 *
 * Tools:
 * - analyze_migration: Analyze SQL for safety issues
 * - suggest_fix: Get safe alternatives for a specific rule violation
 * - explain_lock: Explain what lock a DDL statement acquires
 * - list_rules: List all available safety rules
 * - check_before_apply: Pass/fail gate to call before executing DDL
 * - analyze_migration_dir: Analyze every migration file in a directory
 * - get_rule: Full documentation for one rule
 *
 * The tool definitions live in ./create-server.ts so they can be exercised
 * over an in-memory transport in tests.
 *
 * Run with: npx migrationpilot-mcp
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './create-server.js';

async function main() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
