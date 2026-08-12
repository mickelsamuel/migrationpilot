import type { Rule, RuleContext, RuleViolation } from './engine.js';

export const requireConcurrentIndex: Rule = {
  id: 'MP001',
  name: 'require-concurrent-index-creation',
  severity: 'critical',
  description: 'CREATE INDEX without CONCURRENTLY blocks all writes on the target table for the entire duration of index creation.',
  whyItMatters: 'Without CONCURRENTLY, PostgreSQL holds a SHARE lock on the table for the entire index build. Reads keep working; every INSERT, UPDATE and DELETE blocks until the build finishes. On a table with millions of rows that is minutes of writes queued behind one statement, and every connection waiting on them.',
  docsUrl: 'https://migrationpilot.dev/rules/mp001',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (!('IndexStmt' in stmt)) return null;

    const idx = stmt.IndexStmt as { concurrent?: boolean; relation?: { relname?: string }; idxname?: string };

    if (idx.concurrent) return null;

    const tableName = idx.relation?.relname ?? 'unknown';
    const indexName = idx.idxname ?? '';

    // The suggestion is the whole recipe, not just the keyword, because adding
    // CONCURRENTLY on its own creates a second problem: a concurrent build that
    // fails leaves an INVALID index behind, and the retry has to clear it. That
    // is MP070, and the answer to it is the preceding drop — never
    // IF NOT EXISTS, which skips creation and reports success over the broken
    // index (handbook MPH-012). lock_timeout stays; statement_timeout is
    // deliberately absent, since a timeout that fires mid-build is one of the
    // ways the index ends up invalid in the first place.
    const concurrentBuild = ctx.originalSql
      .replace(/CREATE\s+INDEX/i, 'CREATE INDEX CONCURRENTLY')
      // CONCURRENTLY cannot run inside a transaction
      .replace(/^\s*BEGIN\s*;?\s*/i, '-- NOTE: CONCURRENTLY cannot run inside a transaction block\n')
      .trimEnd()
      .replace(/;?$/, ';');

    const safeAlternative = indexName
      ? `SET lock_timeout = '5s';
-- Clear an invalid index left by an earlier failed attempt. Do not use
-- IF NOT EXISTS here: it would skip the build and report success over it.
DROP INDEX CONCURRENTLY IF EXISTS ${indexName};
${concurrentBuild}
-- If a UNIQUE or PRIMARY KEY constraint owns ${indexName}, the drop is refused.
-- Rebuild in place instead: REINDEX INDEX CONCURRENTLY ${indexName};`
      : concurrentBuild;

    return {
      ruleId: 'MP001',
      ruleName: 'require-concurrent-index-creation',
      severity: 'critical',
      message: `CREATE INDEX${indexName ? ` "${indexName}"` : ''} without CONCURRENTLY will lock all writes on "${tableName}" for the entire duration of index creation.`,
      line: ctx.line,
      safeAlternative,
    };
  },
};
