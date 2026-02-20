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
 *
 * Run with: npx migrationpilot-mcp
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { analyzeSQL } from '../analysis/analyze.js';
import { freeRules } from '../rules/index.js';
import { classifyLock } from '../locks/classify.js';
import { parseMigration } from '../parser/parse.js';
import { extractTargets } from '../parser/extract.js';
import { isFixable, autoFix } from '../fixer/fix.js';

const server = new McpServer({
  name: 'migrationpilot',
  version: '1.4.0',
});

server.tool(
  'analyze_migration',
  'Analyze a PostgreSQL migration SQL for safety issues. Returns violations, risk level, and lock analysis.',
  {
    sql: z.string().describe('The SQL migration to analyze'),
    pg_version: z.number().optional().default(17).describe('Target PostgreSQL version (default: 17)'),
  },
  async ({ sql, pg_version }) => {
    try {
      const result = await analyzeSQL(sql, '<mcp>', pg_version, freeRules);

      const summary = {
        riskLevel: result.overallRisk.level,
        riskScore: result.overallRisk.score,
        violationCount: result.violations.length,
        violations: result.violations.map(v => ({
          ruleId: v.ruleId,
          ruleName: v.ruleName,
          severity: v.severity,
          message: v.message,
          line: v.line,
          safeAlternative: v.safeAlternative,
        })),
        statements: result.statements.map(s => ({
          sql: s.sql,
          lockType: s.lock.lockType,
          blocksReads: s.lock.blocksReads,
          blocksWrites: s.lock.blocksWrites,
          longHeld: s.lock.longHeld,
          riskLevel: s.risk.level,
          riskScore: s.risk.score,
        })),
      };

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(summary, null, 2),
        }],
      };
    } catch (err) {
      return {
        content: [{
          type: 'text' as const,
          text: `Analysis error: ${err instanceof Error ? err.message : String(err)}`,
        }],
        isError: true,
      };
    }
  },
);

server.tool(
  'suggest_fix',
  'Auto-fix safe violations in a PostgreSQL migration SQL. Returns the fixed SQL and list of changes.',
  {
    sql: z.string().describe('The SQL migration to fix'),
    pg_version: z.number().optional().default(17).describe('Target PostgreSQL version (default: 17)'),
  },
  async ({ sql, pg_version }) => {
    try {
      const result = await analyzeSQL(sql, '<mcp>', pg_version, freeRules);

      if (result.violations.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ message: 'No violations found. SQL is safe.', fixedSql: sql }, null, 2),
          }],
        };
      }

      const fixResult = autoFix(sql, result.violations);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            fixedSql: fixResult.fixedSql,
            fixedCount: fixResult.fixedCount,
            unfixableViolations: fixResult.unfixable.map(v => ({
              ruleId: v.ruleId,
              message: v.message,
              safeAlternative: v.safeAlternative,
            })),
            fixableRules: freeRules.filter(r => isFixable(r.id)).map(r => r.id),
          }, null, 2),
        }],
      };
    } catch (err) {
      return {
        content: [{
          type: 'text' as const,
          text: `Fix error: ${err instanceof Error ? err.message : String(err)}`,
        }],
        isError: true,
      };
    }
  },
);

server.tool(
  'explain_lock',
  'Explain what PostgreSQL lock a DDL statement acquires and its impact.',
  {
    sql: z.string().describe('A single DDL statement to analyze'),
    pg_version: z.number().optional().default(17).describe('Target PostgreSQL version (default: 17)'),
  },
  async ({ sql, pg_version }) => {
    try {
      const parsed = await parseMigration(sql);
      if (parsed.errors.length > 0) {
        return {
          content: [{
            type: 'text' as const,
            text: `Parse error: ${parsed.errors.map(e => e.message).join('; ')}`,
          }],
          isError: true,
        };
      }

      const stmt = parsed.statements[0];
      if (!stmt) {
        return {
          content: [{
            type: 'text' as const,
            text: 'No statement found in the provided SQL.',
          }],
          isError: true,
        };
      }

      const lock = classifyLock(stmt.stmt, pg_version);
      const targets = extractTargets(stmt.stmt);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            lockType: lock.lockType,
            blocksReads: lock.blocksReads,
            blocksWrites: lock.blocksWrites,
            longHeld: lock.longHeld,
            affectedTables: targets.map(t => ({
              table: t.tableName,
              schema: t.schemaName,
              operation: t.operation,
            })),
            impact: lock.blocksReads && lock.blocksWrites
              ? 'Blocks ALL reads and writes. High outage risk on busy tables.'
              : lock.blocksWrites
                ? 'Blocks writes (INSERT/UPDATE/DELETE). Reads continue.'
                : 'Minimal impact. Does not block reads or writes.',
          }, null, 2),
        }],
      };
    } catch (err) {
      return {
        content: [{
          type: 'text' as const,
          text: `Error: ${err instanceof Error ? err.message : String(err)}`,
        }],
        isError: true,
      };
    }
  },
);

server.tool(
  'list_rules',
  'List all available MigrationPilot safety rules with descriptions.',
  {},
  async () => {
    const rules = freeRules.map(r => ({
      id: r.id,
      name: r.name,
      severity: r.severity,
      description: r.description,
      autoFixable: isFixable(r.id),
      docsUrl: r.docsUrl,
    }));

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(rules, null, 2),
      }],
    };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
