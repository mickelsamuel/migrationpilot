/**
 * MP112: warn-hnsw-build-memory
 *
 * An HNSW build on a large table with a small maintenance_work_mem. pgvector
 * builds the graph in memory while it fits and switches to a much slower path
 * once it does not, so the same statement can take minutes or hours depending on
 * a setting the migration never mentions.
 *
 * Production-context rule: silent without --database-url. It needs both the row
 * count and the server's maintenance_work_mem.
 */

import type { Rule, RuleContext, RuleViolation } from './engine.js';
import { formatMemorySetting } from './catalog-helpers.js';

/** Row count above which the graph is worth worrying about. */
const LARGE_VECTOR_TABLE_ROWS = 1_000_000;

/**
 * maintenance_work_mem below which a build on a table that size is likely to
 * spill. A heuristic, not a computed graph size — the real threshold depends on
 * the vector dimensions and m, neither of which is knowable from the statement.
 */
const SMALL_MAINTENANCE_WORK_MEM = 1024 ** 3; // 1 GB

export const warnHnswBuildMemory: Rule = {
  id: 'MP112',
  name: 'warn-hnsw-build-memory',
  severity: 'warning',
  description: 'HNSW build on a large table with a small maintenance_work_mem will spill and slow down sharply.',
  whyItMatters:
    'pgvector builds the HNSW graph in maintenance_work_mem. While the graph fits, the build is fast; ' +
    'once it does not, pgvector logs "hnsw graph no longer fits into maintenance_work_mem after N ' +
    'tuples" and finishes on a much slower path. The statement is identical either way, so a build ' +
    'that took minutes in staging can run for hours in production purely because the setting is lower ' +
    'there. maintenance_work_mem can be raised for the session that runs the build, which is the ' +
    'cheapest fix available.',
  docsUrl: 'https://migrationpilot.dev/rules/mp112',
  requiresDatabaseUrl: true,

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (!('IndexStmt' in stmt)) return null;

    const idx = stmt.IndexStmt as {
      idxname?: string;
      accessMethod?: string;
      relation?: { relname?: string };
    };
    if (idx.accessMethod?.toLowerCase() !== 'hnsw') return null;

    // Only fires with production context — needs the row count and the setting
    const rows = ctx.tableStats?.rowCount;
    if (!rows || rows < LARGE_VECTOR_TABLE_ROWS) return null;

    const memBytes = ctx.cluster?.settings?.maintenanceWorkMemBytes;
    if (memBytes === undefined || memBytes >= SMALL_MAINTENANCE_WORK_MEM) return null;

    const tableName = idx.relation?.relname ?? ctx.tableStats?.tableName ?? 'unknown';
    const indexName = idx.idxname ?? 'the new index';
    const workers = ctx.cluster?.settings?.maxParallelMaintenanceWorkers;
    const workerNote = workers !== undefined
      ? ` max_parallel_maintenance_workers is ${workers}${workers <= 2 ? ', which also caps how much of the build can run in parallel' : ''}.`
      : '';

    return {
      ruleId: 'MP112',
      ruleName: 'warn-hnsw-build-memory',
      severity: 'warning',
      message: `HNSW build "${indexName}" on "${tableName}" covers ${rows.toLocaleString()} rows with maintenance_work_mem at ${formatMemorySetting(memBytes)}. pgvector keeps the graph in that memory while it fits and drops to a much slower path once it does not — the notice reads "hnsw graph no longer fits into maintenance_work_mem after N tuples".${workerNote}`,
      line: ctx.line,
      safeAlternative: `-- Raise the limits for the session that builds the index:
SET maintenance_work_mem = '8GB';
SET max_parallel_maintenance_workers = 7;

CREATE INDEX ${indexName === 'the new index' ? 'idx_name' : indexName} ON ${tableName}
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 128);

-- Watch the server log during the build: if the "no longer fits" notice appears,
-- the rest of the build is on the slow path and more memory would have helped.

-- max_parallel_maintenance_workers is capped by max_parallel_workers, so raise
-- that too if you want more than a couple of workers on the build.`,
    };
  },
};
