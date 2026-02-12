import type { Rule, RuleContext, RuleViolation } from './engine.js';

export const requireConcurrentIndex: Rule = {
  id: 'MP001',
  name: 'require-concurrent-index-creation',
  severity: 'critical',
  description: 'CREATE INDEX without CONCURRENTLY blocks all writes on the target table for the entire duration of index creation.',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (!('IndexStmt' in stmt)) return null;

    const idx = stmt.IndexStmt as { concurrent?: boolean; relation?: { relname?: string }; idxname?: string };

    if (idx.concurrent) return null;

    const tableName = idx.relation?.relname ?? 'unknown';
    const indexName = idx.idxname ?? '';

    // Generate safe alternative
    const safeAlternative = ctx.originalSql
      .replace(/CREATE\s+INDEX/i, 'CREATE INDEX CONCURRENTLY')
      // CONCURRENTLY cannot run inside a transaction
      .replace(/^\s*BEGIN\s*;?\s*/i, '-- NOTE: CONCURRENTLY cannot run inside a transaction block\n');

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
