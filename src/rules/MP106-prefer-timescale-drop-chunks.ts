/**
 * MP106: prefer-timescale-drop-chunks
 *
 * A time-ranged DELETE against a hypertable. TimescaleDB stores the data in
 * chunks partitioned on exactly that time column, so the rows being deleted are
 * whole chunks — drop_chunks() unlinks them as files instead of deleting rows
 * one at a time.
 *
 * Production-context rule: silent without --database-url. Both the hypertable
 * membership and the time dimension come from the TimescaleDB catalog.
 */

import type { Rule, RuleContext, RuleViolation } from './engine.js';
import { dmlTargetTable, lookupTableExtensions } from './catalog-helpers.js';

const RANGE_OPERATORS = new Set(['<', '<=', '>', '>=']);

export const preferTimescaleDropChunks: Rule = {
  id: 'MP106',
  name: 'prefer-timescale-drop-chunks',
  severity: 'warning',
  description: 'Time-ranged DELETE on a hypertable. drop_chunks() removes the same data far more cheaply.',
  whyItMatters:
    'Deleting old data from a hypertable row by row does the most expensive possible version of the ' +
    'job: a WAL record per row, a dead tuple per row for vacuum to clean up later, and bloat that ' +
    'survives until the vacuum finishes. Chunks are already partitioned on the time column, so the rows ' +
    'in a retention window are whole chunks. drop_chunks() drops those chunks as tables — no per-row ' +
    'work, no WAL per row, and the space comes back immediately.',
  docsUrl: 'https://migrationpilot.dev/rules/mp106',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (!('DeleteStmt' in stmt)) return null;

    const tableName = dmlTargetTable(stmt);
    if (!tableName) return null;

    // Only fires with production context — hypertable membership comes from the catalog
    const info = ctx.tableExtensions?.isHypertable
      ? ctx.tableExtensions
      : lookupTableExtensions(ctx, tableName);
    if (!info?.isHypertable) return null;

    const del = stmt.DeleteStmt as { whereClause?: Record<string, unknown> };
    if (!del.whereClause) return null;

    // Without a known time dimension we cannot tell a retention delete from a
    // targeted one, so stay quiet rather than guess
    const timeColumn = info.timeColumn;
    if (!timeColumn) return null;
    if (!hasRangeComparison(del.whereClause, timeColumn.toLowerCase())) return null;

    const chunks = info.chunkCount !== undefined ? ` (${info.chunkCount.toLocaleString()} chunks)` : '';

    return {
      ruleId: 'MP106',
      ruleName: 'prefer-timescale-drop-chunks',
      severity: 'warning',
      message: `DELETE on hypertable "${tableName}"${chunks} filters on "${timeColumn}", its time dimension — so this removes whole chunks the slow way, one row at a time, leaving dead tuples for vacuum. drop_chunks() unlinks the chunks instead.`,
      line: ctx.line,
      safeAlternative: `-- Drop the chunks that fall entirely outside the retention window:
SELECT drop_chunks('${tableName}', older_than => INTERVAL '30 days');

-- drop_chunks only removes chunks whose whole range is outside the bound, so
-- data inside a partially-covered chunk stays. Check what would go first:
SELECT chunk_name, range_start, range_end
FROM timescaledb_information.chunks
WHERE hypertable_name = '${tableName}'
ORDER BY range_end;

-- For an ongoing policy rather than a one-off:
SELECT add_retention_policy('${tableName}', INTERVAL '30 days');`,
    };
  },
};

/**
 * True when the WHERE clause compares the given column against something with a
 * range operator — the shape of a retention delete.
 */
function hasRangeComparison(node: unknown, column: string): boolean {
  if (!node || typeof node !== 'object') return false;

  const record = node as Record<string, unknown>;
  const expr = record.A_Expr as
    | {
        kind?: string;
        name?: Array<{ String?: { sval?: string } }>;
        lexpr?: unknown;
        rexpr?: unknown;
      }
    | undefined;

  if (expr?.name) {
    const operator = expr.name[expr.name.length - 1]?.String?.sval;
    if (operator && RANGE_OPERATORS.has(operator)) {
      if (referencesColumn(expr.lexpr, column) || referencesColumn(expr.rexpr, column)) return true;
    }
  }

  for (const value of Object.values(record)) {
    if (Array.isArray(value)) {
      if (value.some(item => hasRangeComparison(item, column))) return true;
    } else if (hasRangeComparison(value, column)) {
      return true;
    }
  }
  return false;
}

/** True when the node is a direct reference to the named column. */
function referencesColumn(node: unknown, column: string): boolean {
  if (!node || typeof node !== 'object') return false;
  const columnRef = (node as Record<string, unknown>).ColumnRef as
    | { fields?: Array<{ String?: { sval?: string } }> }
    | undefined;
  if (!columnRef?.fields) return false;
  const last = columnRef.fields[columnRef.fields.length - 1]?.String?.sval;
  return last?.toLowerCase() === column;
}
