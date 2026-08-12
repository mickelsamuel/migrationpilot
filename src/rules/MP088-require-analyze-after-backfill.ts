import type { Rule, RuleContext, RuleViolation } from './engine.js';

/**
 * MP088: require-analyze-after-backfill
 *
 * A backfill can change a column's statistics beyond recognition — a column
 * that was 100% NULL before the UPDATE is now fully populated, and its
 * histogram, n_distinct and null_frac in pg_statistic all describe the old
 * shape. The planner keeps using those numbers until autovacuum's next
 * analyze, which is scheduled off a row-change threshold and can be minutes
 * or hours away on a large table.
 *
 * In that window the planner picks plans for a table that no longer exists:
 * seq scans where an index would do, nested loops sized for a row count that
 * is off by orders of magnitude. The migration reports success and the
 * latency regression arrives afterwards, which makes it hard to connect back.
 *
 * One violation is reported per table — on the last backfill touching it.
 */

interface RelationShape {
  relname?: string;
}

export const requireAnalyzeAfterBackfill: Rule = {
  id: 'MP088',
  name: 'require-analyze-after-backfill',
  severity: 'warning',
  description: 'Bulk UPDATE or INSERT ... SELECT with no ANALYZE afterwards leaves the planner working from stale statistics.',
  whyItMatters:
    'After a backfill the statistics in pg_statistic still describe the table as it was before. The ' +
    'planner trusts them, so it keeps choosing plans built for the old null fraction and the old ' +
    'row count: sequential scans over a column that is now selective, nested loops sized for a ' +
    'fraction of the rows that are actually there. Autovacuum will fix it eventually, but it ' +
    'triggers off a row-change threshold rather than the end of your migration, so on a large table ' +
    'the gap is long enough to matter. A single ANALYZE closes it deterministically and takes a ' +
    'sample-sized fraction of the time the backfill just took.',
  docsUrl: 'https://migrationpilot.dev/rules/mp088',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    const target = backfillTarget(stmt);
    if (!target) return null;

    // Report once per table: skip if a later statement backfills the same table.
    const laterBackfillSameTable = ctx.allStatements
      .slice(ctx.statementIndex + 1)
      .some(s => backfillTarget(s.stmt) === target);
    if (laterBackfillSameTable) return null;

    // Look for an ANALYZE covering this table after the backfill.
    const analyzed = ctx.allStatements
      .slice(ctx.statementIndex + 1)
      .some(s => analyzesTable(s.stmt, target));
    if (analyzed) return null;

    return {
      ruleId: 'MP088',
      ruleName: 'require-analyze-after-backfill',
      severity: 'warning',
      message: `Backfill on "${target}" is not followed by ANALYZE. The planner will keep using pre-backfill statistics until autovacuum catches up, which can mean bad plans on "${target}" well after the migration reports success.`,
      line: ctx.line,
      safeAlternative: `-- Refresh the statistics once the backfill is done:
ANALYZE ${target};

-- ANALYZE takes only a ShareUpdateExclusiveLock, so it does not block
-- reads or writes and can run outside the migration transaction.`,
    };
  },
};

/** Returns the table name if this statement is a bulk backfill, else null. */
function backfillTarget(stmt: Record<string, unknown>): string | null {
  if ('UpdateStmt' in stmt) {
    const update = stmt.UpdateStmt as { relation?: RelationShape };
    return update.relation?.relname ?? null;
  }

  if ('InsertStmt' in stmt) {
    const insert = stmt.InsertStmt as {
      relation?: RelationShape;
      selectStmt?: { SelectStmt?: { valuesLists?: unknown[]; fromClause?: unknown[] } };
    };
    const select = insert.selectStmt?.SelectStmt;
    // INSERT ... VALUES is seeding, not a backfill. INSERT ... SELECT is.
    const isValuesOnly = Array.isArray(select?.valuesLists) && select.valuesLists.length > 0;
    if (isValuesOnly) return null;
    if (!select?.fromClause) return null;
    return insert.relation?.relname ?? null;
  }

  return null;
}

/** True if the statement is an ANALYZE (bare or targeted) covering `table`. */
function analyzesTable(stmt: Record<string, unknown>, table: string): boolean {
  if (!('VacuumStmt' in stmt)) return false;

  const vacuum = stmt.VacuumStmt as {
    is_vacuumcmd?: boolean;
    options?: Array<{ DefElem?: { defname?: string } }>;
    rels?: Array<{ VacuumRelation?: { relation?: RelationShape } }>;
  };

  // ANALYZE parses as VacuumStmt without is_vacuumcmd; VACUUM sets it.
  // VACUUM ANALYZE also refreshes statistics, so accept it too.
  const isAnalyze =
    vacuum.is_vacuumcmd !== true ||
    (vacuum.options ?? []).some(o => o.DefElem?.defname === 'analyze');
  if (!isAnalyze) return false;

  // Bare ANALYZE with no relation list covers every table.
  if (!vacuum.rels || vacuum.rels.length === 0) return true;

  return vacuum.rels.some(r => r.VacuumRelation?.relation?.relname === table);
}
