/**
 * MP102: warn-rewrite-disk-headroom
 *
 * A full-rewrite operation needs room for a second copy of the table before the
 * old one goes away. On a large table that briefly doubles disk usage, and
 * running out of space mid-rewrite leaves the operation to roll back after
 * hours of work.
 *
 * Production-context rule: silent without --database-url, because the size comes
 * from the catalog.
 */

import type { Rule, RuleContext, RuleViolation } from './engine.js';
import { classifyRewrite, formatBytes, lookupTableStats } from './catalog-helpers.js';

/** Below this size the extra copy is not worth a warning. */
const MIN_TABLE_BYTES = 1_000_000_000; // 1 GB

/** Headroom below this multiple of the required space is called out as tight. */
const TIGHT_HEADROOM_FACTOR = 1.5;

export const warnRewriteDiskHeadroom: Rule = {
  id: 'MP102',
  name: 'warn-rewrite-disk-headroom',
  severity: 'warning',
  description: 'Full-table rewrite on a large table needs room for a second copy while it runs.',
  whyItMatters:
    'VACUUM FULL, CLUSTER, and a rewriting ALTER TABLE do not edit the table in place. PostgreSQL ' +
    'builds a complete new copy — heap and indexes — and only drops the original once the new copy is ' +
    'committed. Peak usage is therefore roughly twice the current size. If the volume fills up partway ' +
    'through, the rewrite fails and rolls back, and you have paid the full lock duration for nothing.',
  docsUrl: 'https://migrationpilot.dev/rules/mp102',
  requiresDatabaseUrl: true,

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    const rewrite = classifyRewrite(stmt, ctx.pgVersion);
    if (!rewrite) return null;

    // Only fires with production context — the size comes from the catalog.
    // VACUUM and CLUSTER need their own lookup: the engine does not resolve them.
    const stats = (rewrite.tableName ? lookupTableStats(ctx, rewrite.tableName) : undefined)
      ?? ctx.tableStats;
    if (!stats) return null;

    const currentBytes = stats.totalBytes;
    if (currentBytes < MIN_TABLE_BYTES) return null;

    const tableName = stats.tableName;
    const current = formatBytes(currentBytes);
    const peak = formatBytes(currentBytes * 2);

    const available = ctx.cluster?.disk?.availableBytes;
    let headroom: string;
    if (available === undefined) {
      // Core PostgreSQL exposes no free-space function, so this is the normal path
      headroom = `MigrationPilot cannot read free space from this server — PostgreSQL has no function for it. Check the data volume yourself (df -h on $PGDATA) before running this.`;
    } else if (available < currentBytes) {
      headroom = `The server reports ${formatBytes(available)} free, which is less than the ${current} the copy needs. This rewrite is expected to run out of space.`;
    } else if (available < currentBytes * TIGHT_HEADROOM_FACTOR) {
      headroom = `The server reports ${formatBytes(available)} free against ${current} needed — enough, but with little margin for WAL and ordinary traffic during the rewrite.`;
    } else {
      headroom = `The server reports ${formatBytes(available)} free, so there is room for the copy.`;
    }

    return {
      ruleId: 'MP102',
      ruleName: 'warn-rewrite-disk-headroom',
      severity: 'warning',
      message: `${rewrite.label} rewrites "${tableName}", which is ${current} today (heap, indexes, and TOAST). The rewrite writes a full second copy before releasing the original, so peak usage is about ${peak} and roughly ${current} of free space is needed. ${headroom}`,
      line: ctx.line,
      safeAlternative: `-- Check free space on the data volume first:
--   df -h $(psql -tAc "SHOW data_directory")

-- Confirm what the copy will cost:
SELECT pg_size_pretty(pg_total_relation_size('${tableName}')) AS current_size,
       pg_size_pretty(pg_total_relation_size('${tableName}') * 2) AS peak_during_rewrite;

-- pg_repack rebuilds the table without the ACCESS EXCLUSIVE lock, but it still
-- needs the same second copy, so the disk requirement does not change:
--   pg_repack --table=${tableName} --no-superuser-check <dbname>`,
    };
  },
};
