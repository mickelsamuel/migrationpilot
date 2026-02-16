import type { Rule, RuleContext, RuleViolation } from './engine.js';

const LARGE_TABLE_ROWS = 1_000_000;

export const largeTableDDL: Rule = {
  id: 'MP014',
  name: 'large-table-ddl',
  severity: 'warning',
  description: 'DDL with long-held locks on a table with over 1M rows. Lock duration will scale with table size.',
  whyItMatters: 'DDL operations on large tables take proportionally longer. Lock duration scales with row count and table size — what takes seconds on a small table can take minutes or hours on a table with millions of rows.',
  docsUrl: 'https://migrationpilot.dev/rules/mp014',

  check(_stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    // Only fire when production context is available (paid tier)
    if (!ctx.tableStats) return null;

    // Only flag long-held locks on large tables
    if (!ctx.lock.longHeld) return null;
    if (ctx.tableStats.rowCount < LARGE_TABLE_ROWS) return null;

    const rows = ctx.tableStats.rowCount.toLocaleString();
    const size = formatBytes(ctx.tableStats.totalBytes);
    const indexes = ctx.tableStats.indexCount;

    return {
      ruleId: 'MP014',
      ruleName: 'large-table-ddl',
      severity: 'warning',
      message: `Long-held ${ctx.lock.lockType} on a table with ${rows} rows (${size}, ${indexes} indexes). Lock duration will scale with table size${ctx.lock.blocksReads ? ', blocking ALL reads and writes' : ', blocking writes'}.`,
      line: ctx.line,
      safeAlternative: `-- For large tables, consider:
-- 1. Set a lock_timeout to fail fast:
SET lock_timeout = '5s';
${ctx.originalSql}
RESET lock_timeout;

-- 2. Run during maintenance windows
-- 3. If this is an index creation, ensure CONCURRENTLY is used
-- 4. For column additions with defaults, consider adding without default then backfilling`,
    };
  },
};

function formatBytes(bytes: number): string {
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(1)} TB`;
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(1)} KB`;
  return `${bytes} B`;
}
