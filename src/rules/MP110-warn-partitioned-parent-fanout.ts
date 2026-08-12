/**
 * MP110: warn-partitioned-parent-fanout
 *
 * ALTER TABLE or CREATE INDEX on a partitioned parent. The statement reads like
 * one table, but PostgreSQL takes the lock on the parent and on every partition,
 * so the real cost is the count of partitions in production.
 *
 * Production-context rule: silent without --database-url. Nothing in the
 * migration file says how many partitions the table has.
 */

import type { Rule, RuleContext, RuleViolation } from './engine.js';

/** Below this many partitions the fan-out is not worth a warning. */
const MANY_PARTITIONS = 20;

export const warnPartitionedParentFanout: Rule = {
  id: 'MP110',
  name: 'warn-partitioned-parent-fanout',
  severity: 'warning',
  description: 'DDL on a partitioned parent takes the lock on the parent and on every partition.',
  whyItMatters:
    'DDL on a partitioned table recurses. PostgreSQL locks the parent and each partition, and it holds ' +
    'all of those locks until the statement commits — so the blocking window is set by the slowest ' +
    'partition and the number of locks by the partition count. Two things follow: the statement can ' +
    'exhaust max_locks_per_transaction on a table with many partitions, and a lock_timeout only helps ' +
    'if it is short enough to fire before the queue behind the parent lock has stalled every query.',
  docsUrl: 'https://migrationpilot.dev/rules/mp110',
  requiresDatabaseUrl: true,

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    // Only fires with production context — the partition count comes from the catalog
    const facts = ctx.tableFacts;
    if (!facts) return null;
    if (facts.relKind !== 'p') return null;
    if (facts.partitionCount < MANY_PARTITIONS) return null;

    // Skip tables an extension manages — MP105 and MP108 explain those better
    if (ctx.tableExtensions?.isHypertable || ctx.tableExtensions?.isPartmanParent) return null;

    const operation = fanoutOperation(stmt);
    if (!operation) return null;

    const partitions = facts.partitionCount.toLocaleString();

    return {
      ruleId: 'MP110',
      ruleName: 'warn-partitioned-parent-fanout',
      severity: 'warning',
      message: `${operation} on partitioned table "${facts.tableName}", which has ${partitions} partitions. PostgreSQL takes the ${ctx.lock.lockType} lock on the parent and on all ${partitions} partitions and holds them until the statement commits, so the real blocking window is set by the slowest partition — not by the one line in this file.`,
      line: ctx.line,
      safeAlternative: `-- Confirm the fan-out before running it:
SELECT count(*) AS partitions FROM pg_inherits WHERE inhparent = '${facts.tableName}'::regclass;

-- Make sure the lock table can hold one entry per partition:
SHOW max_locks_per_transaction;

-- Fail fast instead of stalling every query queued behind the parent lock:
SET lock_timeout = '5s';
${ctx.originalSql}
RESET lock_timeout;

-- For an index, build on each partition first, then attach them to a parent
-- index created ONLY — that keeps each blocking window to a single partition:
--   CREATE INDEX CONCURRENTLY idx_part_1 ON ${facts.tableName}_p1 (col);
--   CREATE INDEX idx_parent ON ONLY ${facts.tableName} (col);
--   ALTER INDEX idx_parent ATTACH PARTITION idx_part_1;`,
    };
  },
};

function fanoutOperation(stmt: Record<string, unknown>): string | null {
  if ('AlterTableStmt' in stmt) return 'ALTER TABLE';
  if ('IndexStmt' in stmt) {
    const idx = stmt.IndexStmt as { concurrent?: boolean };
    // CREATE INDEX CONCURRENTLY is rejected on a partitioned parent, so it is
    // never the statement we are looking at here
    return idx.concurrent ? null : 'CREATE INDEX';
  }
  return null;
}
