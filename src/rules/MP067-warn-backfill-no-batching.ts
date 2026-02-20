import type { Rule, RuleContext, RuleViolation } from './engine.js';

/**
 * MP067: warn-backfill-no-batching
 *
 * DELETE without a WHERE clause removes every row in a single transaction,
 * generating massive WAL, holding ROW EXCLUSIVE lock, and potentially
 * causing replication lag and disk pressure.
 *
 * Complements MP011 (unbatched UPDATE). Together they cover all unbatched
 * data modifications in migrations.
 */

export const warnBackfillNoBatching: Rule = {
  id: 'MP067',
  name: 'warn-backfill-no-batching',
  severity: 'warning',
  description: 'DELETE without a WHERE clause removes every row in a single transaction, generating massive WAL and holding locks.',
  whyItMatters:
    'A full-table DELETE generates a WAL entry for every row, bloats the table with dead tuples, ' +
    'and holds a ROW EXCLUSIVE lock for the entire duration. On tables with millions of rows, this ' +
    'can take hours, cause replication lag, and exhaust disk space. Use batched deletes or TRUNCATE instead.',
  docsUrl: 'https://migrationpilot.dev/rules/mp067',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (!('DeleteStmt' in stmt)) return null;

    const del = stmt.DeleteStmt as {
      relation?: { relname?: string };
      whereClause?: Record<string, unknown>;
    };

    if (del.whereClause) return null;

    const tableName = del.relation?.relname ?? 'unknown';

    return {
      ruleId: 'MP067',
      ruleName: 'warn-backfill-no-batching',
      severity: 'warning',
      message: `DELETE on "${tableName}" without a WHERE clause removes every row in a single transaction. Use TRUNCATE for full deletes or batch with WHERE + LIMIT.`,
      line: ctx.line,
      safeAlternative: `-- For full table delete, use TRUNCATE (much faster, minimal WAL):
TRUNCATE ${tableName};

-- For partial deletes, batch to reduce lock duration:
DELETE FROM ${tableName} WHERE ctid IN (
  SELECT ctid FROM ${tableName} LIMIT 10000
);`,
    };
  },
};
