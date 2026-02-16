import type { Rule, RuleContext, RuleViolation } from './engine.js';

export const unbatchedBackfill: Rule = {
  id: 'MP011',
  name: 'unbatched-data-backfill',
  severity: 'warning',
  description: 'UPDATE without a WHERE clause or LIMIT pattern rewrites the entire table in a single transaction, generating massive WAL and holding locks.',
  whyItMatters: 'A full-table UPDATE generates massive WAL, bloats the table, and holds a ROW EXCLUSIVE lock for the entire duration. On tables with millions of rows, this can take hours and cause replication lag, disk pressure, and degraded performance.',
  docsUrl: 'https://migrationpilot.dev/rules/mp011',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (!('UpdateStmt' in stmt)) return null;

    const update = stmt.UpdateStmt as {
      relation?: { relname?: string };
      whereClause?: Record<string, unknown>;
    };

    // Only flag UPDATEs without a WHERE clause (full-table backfills)
    if (update.whereClause) return null;

    const tableName = update.relation?.relname ?? 'unknown';

    return {
      ruleId: 'MP011',
      ruleName: 'unbatched-data-backfill',
      severity: 'warning',
      message: `UPDATE on "${tableName}" without a WHERE clause rewrites every row in a single transaction. For large tables, this generates massive WAL, can bloat the table, and holds ROW EXCLUSIVE lock for the entire duration.`,
      line: ctx.line,
      safeAlternative: `-- Backfill in batches to reduce lock duration and WAL volume:
DO $$
DECLARE
  batch_size INT := 10000;
  rows_updated INT;
BEGIN
  LOOP
    UPDATE ${tableName}
    SET <column> = <value>
    WHERE <column> IS NULL  -- or your condition
    AND ctid IN (
      SELECT ctid FROM ${tableName}
      WHERE <column> IS NULL
      LIMIT batch_size
      FOR UPDATE SKIP LOCKED
    );
    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    EXIT WHEN rows_updated = 0;
    COMMIT;
    PERFORM pg_sleep(0.1);  -- Brief pause to let other queries through
  END LOOP;
END $$;`,
    };
  },
};
