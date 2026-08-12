/**
 * MP103: warn-replication-lag-risk
 *
 * A WAL-heavy operation on a large table while standbys are connected. Replicas
 * replay WAL in a single stream, so a burst that the primary writes in parallel
 * arrives at the replica as serial work — read replicas fall behind, and
 * anything reading from them serves stale data until they catch up.
 *
 * Production-context rule: silent without --database-url, because it needs to
 * know that replicas exist.
 */

import type { Rule, RuleContext, RuleViolation } from './engine.js';
import {
  classifyRewrite,
  dmlTargetTable,
  formatBytes,
  lookupTableStats,
} from './catalog-helpers.js';

/** Below this size the WAL burst is not worth flagging. */
const LARGE_TABLE_BYTES = 1_000_000_000; // 1 GB
const LARGE_TABLE_ROWS = 5_000_000;

export const warnReplicationLagRisk: Rule = {
  id: 'MP103',
  name: 'warn-replication-lag-risk',
  severity: 'warning',
  description: 'WAL-heavy operation on a large table while streaming replicas are connected.',
  whyItMatters:
    'A table rewrite, an index build, or a large backfill writes the whole change set to WAL. Standbys ' +
    'replay that WAL with a single startup process, so work the primary spread across many backends ' +
    'arrives serially. Replication lag grows for as long as the operation runs and for some time after; ' +
    'read replicas serve stale data meanwhile, and a failover during the lag window loses whatever has ' +
    'not been replayed. Replication slots make it worse in the other direction: if a replica cannot ' +
    'keep up, the primary retains WAL for it and the disk fills.',
  docsUrl: 'https://migrationpilot.dev/rules/mp103',
  requiresDatabaseUrl: true,

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    // Only fires with production context — replica presence comes from pg_stat_replication
    const replication = ctx.cluster?.replication;
    if (!replication || replication.replicaCount === 0) return null;

    const operation = walHeavyOperation(stmt, ctx);
    if (!operation) return null;

    const stats = operation.tableName ? lookupTableStats(ctx, operation.tableName) : ctx.tableStats;
    if (!stats) return null;
    if (stats.totalBytes < LARGE_TABLE_BYTES && stats.rowCount < LARGE_TABLE_ROWS) return null;

    const replicas = `${replication.replicaCount} streaming ${replication.replicaCount === 1 ? 'replica' : 'replicas'}`;
    const lagNote = replication.maxLagBytes !== undefined
      ? ` Current replay lag is ${formatBytes(replication.maxLagBytes)}.`
      : '';
    const slotNote = replication.slotCount > 0
      ? ` ${replication.slotCount} replication ${replication.slotCount === 1 ? 'slot is' : 'slots are'} defined, so WAL is retained on the primary until the ${replication.replicaCount === 1 ? 'replica has' : 'replicas have'} consumed it.`
      : '';

    return {
      ruleId: 'MP103',
      ruleName: 'warn-replication-lag-risk',
      severity: 'warning',
      message: `${operation.label} on "${stats.tableName}" (${stats.rowCount.toLocaleString()} rows, ${formatBytes(stats.totalBytes)}) with ${replicas} connected. The whole change set goes through WAL and each replica replays it serially, so lag will grow for the duration and reads served from replicas will be stale until they catch up.${lagNote}${slotNote}`,
      line: ctx.line,
      safeAlternative: `-- Split the work and let replicas catch up between batches:
--   run one batch, then wait until lag is back under your threshold.

-- Watch lag while it runs:
SELECT client_addr,
       state,
       pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn)) AS replay_lag
FROM pg_stat_replication;

-- If reads are served from replicas, run this in a window where stale reads are
-- acceptable, and confirm max_slot_wal_keep_size is set so a lagging replica
-- cannot fill the primary's disk.`,
    };
  },
};

interface WalHeavyOperation {
  label: string;
  /** Table the operation targets, when it differs from the engine-resolved one. */
  tableName?: string;
}

function walHeavyOperation(
  stmt: Record<string, unknown>,
  ctx: RuleContext
): WalHeavyOperation | null {
  const rewrite = classifyRewrite(stmt, ctx.pgVersion);
  if (rewrite) return { label: rewrite.label, ...(rewrite.tableName ? { tableName: rewrite.tableName } : {}) };

  if ('IndexStmt' in stmt) {
    const idx = stmt.IndexStmt as { concurrent?: boolean };
    return { label: idx.concurrent ? 'CREATE INDEX CONCURRENTLY' : 'CREATE INDEX' };
  }

  if ('ReindexStmt' in stmt) {
    const reindex = stmt.ReindexStmt as { concurrent?: boolean };
    return { label: reindex.concurrent ? 'REINDEX CONCURRENTLY' : 'REINDEX' };
  }

  const dmlTable = dmlTargetTable(stmt);
  if (dmlTable) {
    if ('UpdateStmt' in stmt) return { label: 'UPDATE', tableName: dmlTable };
    if ('DeleteStmt' in stmt) return { label: 'DELETE', tableName: dmlTable };
    if ('InsertStmt' in stmt) {
      // Only bulk inserts are WAL-heavy; INSERT ... VALUES of a few rows is not
      const insert = stmt.InsertStmt as { selectStmt?: { SelectStmt?: { fromClause?: unknown[] } } };
      const fromClause = insert.selectStmt?.SelectStmt?.fromClause;
      if (!fromClause || fromClause.length === 0) return null;
      return { label: 'INSERT ... SELECT', tableName: dmlTable };
    }
  }

  return null;
}
