/**
 * MP104: warn-long-index-build
 *
 * An index build whose duration, estimated from the live row count, runs into
 * minutes or hours. The estimate is deliberately a wide range — build speed
 * depends on key width, maintenance_work_mem, parallel workers, and I/O, and
 * none of that is knowable from the migration file.
 *
 * Production-context rule: silent without --database-url, because the row count
 * comes from the catalog.
 */

import type { Rule, RuleContext, RuleViolation } from './engine.js';
import { formatBytes, formatDuration, formatMemorySetting } from './catalog-helpers.js';

/**
 * Throughput band for a plain B-tree build, in rows per second.
 *
 * The fast end is a narrow integer key on a warm, uncontended machine
 * (110M rows in 52s has been measured on a laptop). The slow end matches a wide
 * unique key on cloud storage under load (750M rows took about five hours on an
 * AWS r6g.4xlarge). Anything real lands between them, which is why the rule
 * reports a range and never a single number.
 */
const FAST_ROWS_PER_SECOND = 2_000_000;
const SLOW_ROWS_PER_SECOND = 125_000;

/** CONCURRENTLY makes two passes over the table and waits on transactions between them. */
const CONCURRENT_MULTIPLIER = 3;

/** Warn once the slow end of the estimate crosses this. */
const WARN_SECONDS = 300;

export const warnLongIndexBuild: Rule = {
  id: 'MP104',
  name: 'warn-long-index-build',
  severity: 'warning',
  description: 'Index build on a table large enough that the build runs for minutes or hours.',
  whyItMatters:
    'Build time scales with row count, and a long build is a long exposure. A plain CREATE INDEX holds ' +
    'a SHARE lock that blocks every write on the table until it finishes. CONCURRENTLY does not block ' +
    'writes, but it makes two passes over the table and holds a snapshot throughout, which keeps vacuum ' +
    'from cleaning up dead rows anywhere in the database — and if it fails or is cancelled it leaves an ' +
    'INVALID index behind that must be dropped and rebuilt.',
  docsUrl: 'https://migrationpilot.dev/rules/mp104',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    // Only fires with production context — the row count comes from the catalog
    if (!ctx.tableStats) return null;
    if (!('IndexStmt' in stmt)) return null;

    const idx = stmt.IndexStmt as {
      idxname?: string;
      concurrent?: boolean;
      relation?: { relname?: string };
    };

    const rows = ctx.tableStats.rowCount;
    if (rows <= 0) return null;

    const multiplier = idx.concurrent ? CONCURRENT_MULTIPLIER : 1;
    const fastSeconds = (rows / FAST_ROWS_PER_SECOND) * multiplier;
    const slowSeconds = (rows / SLOW_ROWS_PER_SECOND) * multiplier;
    if (slowSeconds < WARN_SECONDS) return null;

    const tableName = idx.relation?.relname ?? ctx.tableStats.tableName;
    const indexName = idx.idxname ?? 'the new index';
    const operation = idx.concurrent ? 'CREATE INDEX CONCURRENTLY' : 'CREATE INDEX';

    const exposure = idx.concurrent
      ? `For that whole window the build holds a snapshot, so vacuum cannot clean up dead rows anywhere in the database, and a failure leaves "${indexName}" INVALID.`
      : `Writes to "${tableName}" are blocked for that whole window — this build is not CONCURRENTLY.`;

    const memNote = ctx.cluster?.settings?.maintenanceWorkMemBytes !== undefined
      ? ` maintenance_work_mem is ${formatMemorySetting(ctx.cluster.settings.maintenanceWorkMemBytes)}${
          ctx.cluster.settings.maxParallelMaintenanceWorkers !== undefined
            ? ` and max_parallel_maintenance_workers is ${ctx.cluster.settings.maxParallelMaintenanceWorkers}`
            : ''
        }; raising both for the session shortens the build.`
      : '';

    return {
      ruleId: 'MP104',
      ruleName: 'warn-long-index-build',
      severity: 'warning',
      message: `${operation} on "${tableName}" covers ${rows.toLocaleString()} rows (${formatBytes(ctx.tableStats.totalBytes)}). Expect roughly ${formatDuration(fastSeconds)} to ${formatDuration(slowSeconds)} — a wide range, because build speed depends on key width, memory, parallel workers, and I/O. ${exposure}${memNote}`,
      line: ctx.line,
      safeAlternative: `-- Give the build more memory and workers for this session:
SET maintenance_work_mem = '2GB';
SET max_parallel_maintenance_workers = 4;

-- Build without blocking writes (outside a transaction):
CREATE INDEX CONCURRENTLY ${indexName === 'the new index' ? 'idx_name' : indexName} ON ${tableName} (...);

-- Watch it while it runs:
SELECT phase, blocks_done, blocks_total, tuples_done, tuples_total
FROM pg_stat_progress_create_index;

-- Afterwards, check nothing was left behind by a cancelled build:
SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;`,
    };
  },
};
