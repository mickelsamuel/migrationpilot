import type { Rule, RuleContext, RuleViolation } from './engine.js';
import { isInsideTransaction } from './helpers.js';

export const banConcurrentInTransaction: Rule = {
  id: 'MP025',
  name: 'ban-concurrent-in-transaction',
  severity: 'critical',
  description: 'CONCURRENTLY operations (CREATE INDEX, DROP INDEX, REINDEX) cannot run inside a transaction block. PostgreSQL will raise an ERROR at runtime.',
  whyItMatters: 'CONCURRENTLY operations cannot run inside a transaction block — PostgreSQL will raise a runtime ERROR, causing the entire migration to fail. Many migration frameworks wrap operations in transactions by default, making this a common trap.',
  docsUrl: 'https://migrationpilot.dev/rules/mp025',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    const isConcurrent = checkConcurrent(stmt);
    if (!isConcurrent) return null;

    if (!isInsideTransaction(ctx)) return null;

    return {
      ruleId: 'MP025',
      ruleName: 'ban-concurrent-in-transaction',
      severity: 'critical',
      message: `CONCURRENTLY operations cannot run inside a transaction block. PostgreSQL will raise: "ERROR: CREATE INDEX CONCURRENTLY cannot run inside a transaction block". Remove the surrounding BEGIN/COMMIT.`,
      line: ctx.line,
      safeAlternative: `-- Remove the surrounding transaction block:
-- CONCURRENTLY operations manage their own locking.
${ctx.originalSql}`,
    };
  },
};

function checkConcurrent(stmt: Record<string, unknown>): boolean {
  // CREATE INDEX CONCURRENTLY
  if ('IndexStmt' in stmt) {
    const idx = stmt.IndexStmt as { concurrent?: boolean };
    return idx.concurrent === true;
  }

  // DROP INDEX CONCURRENTLY
  if ('DropStmt' in stmt) {
    const drop = stmt.DropStmt as { concurrent?: boolean };
    return drop.concurrent === true;
  }

  // REINDEX ... CONCURRENTLY (uses params DefElem)
  if ('ReindexStmt' in stmt) {
    const reindex = stmt.ReindexStmt as {
      params?: Array<{ DefElem?: { defname: string } }>;
    };
    return reindex.params?.some(p => p.DefElem?.defname === 'concurrently') ?? false;
  }

  return false;
}
