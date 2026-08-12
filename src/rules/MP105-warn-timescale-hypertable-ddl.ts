/**
 * MP105: warn-timescale-hypertable-ddl
 *
 * Raw DDL against a TimescaleDB hypertable. A hypertable is a facade over many
 * chunks, and TimescaleDB propagates the statement to every one of them, so the
 * lock footprint and the duration scale with the chunk count rather than looking
 * like the single-table statement in the migration file.
 *
 * Production-context rule: silent without --database-url. Hypertable membership
 * is only knowable from the TimescaleDB catalog — a create_hypertable() call in
 * some other migration file is out of scope.
 */

import type { Rule, RuleContext, RuleViolation } from './engine.js';

export const warnTimescaleHypertableDdl: Rule = {
  id: 'MP105',
  name: 'warn-timescale-hypertable-ddl',
  severity: 'warning',
  description: 'DDL on a TimescaleDB hypertable propagates to every chunk, so its cost scales with chunk count.',
  whyItMatters:
    'A hypertable stores its data in chunks, each a real table. TimescaleDB applies schema changes to ' +
    'the hypertable and to every chunk, so an ALTER that looks like one statement takes locks across ' +
    'the whole set and runs for as long as the slowest chunk. Index creation has its own catch: ' +
    'TimescaleDB does not support CREATE INDEX CONCURRENTLY on a hypertable, and offers ' +
    'WITH (timescaledb.transaction_per_chunk) instead, which builds chunk by chunk in separate ' +
    'transactions so only one chunk is blocked at a time.',
  docsUrl: 'https://migrationpilot.dev/rules/mp105',
  requiresDatabaseUrl: true,

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    // Only fires with production context — hypertable membership comes from the catalog
    if (!ctx.tableExtensions?.isHypertable) return null;

    const info = ctx.tableExtensions;
    const chunks = info.chunkCount !== undefined
      ? `${info.chunkCount.toLocaleString()} chunk${info.chunkCount === 1 ? '' : 's'}`
      : 'every chunk';

    if ('IndexStmt' in stmt) {
      const idx = stmt.IndexStmt as {
        idxname?: string;
        concurrent?: boolean;
        unique?: boolean;
        relation?: { relname?: string };
      };
      const tableName = idx.relation?.relname ?? info.tableName;
      const indexName = idx.idxname ?? 'the new index';

      const lead = idx.concurrent
        ? `CREATE INDEX CONCURRENTLY is not supported on hypertables — TimescaleDB documents WITH (timescaledb.transaction_per_chunk) as the alternative. This statement targets hypertable "${tableName}".`
        : `Creating "${indexName}" on hypertable "${tableName}" builds an index on ${chunks} inside one transaction, blocking writes to the whole hypertable until every chunk is done.`;

      return {
        ruleId: 'MP105',
        ruleName: 'warn-timescale-hypertable-ddl',
        severity: 'warning',
        message: lead,
        line: ctx.line,
        safeAlternative: `-- Build chunk by chunk so only one chunk is blocked at a time:
CREATE INDEX ${indexName === 'the new index' ? 'idx_name' : indexName} ON ${tableName} (...)
  WITH (timescaledb.transaction_per_chunk);

-- Note: this is not supported for CREATE UNIQUE INDEX, and if it fails partway
-- through, some chunks keep the index and the hypertable's index is marked invalid.
-- A unique index on a hypertable must also include all partitioning columns.`,
      };
    }

    if (!('AlterTableStmt' in stmt) && !('RenameStmt' in stmt)) return null;

    const tableName = info.tableName;
    const compressionNote = info.compressionEnabled
      ? ' This hypertable has compression enabled, which blocks several ALTER forms outright — see MP111.'
      : '';

    return {
      ruleId: 'MP105',
      ruleName: 'warn-timescale-hypertable-ddl',
      severity: 'warning',
      message: `"${tableName}" is a TimescaleDB hypertable with ${chunks}. TimescaleDB applies this DDL to the hypertable and to every chunk, so the lock footprint and the duration scale with the chunk count, not with the single statement in this file.${compressionNote}`,
      line: ctx.line,
      safeAlternative: `-- Check what this statement will actually touch:
SELECT hypertable_name, num_chunks, compression_enabled
FROM timescaledb_information.hypertables
WHERE hypertable_name = '${tableName}';

-- Fail fast rather than queueing behind a long chunk:
SET lock_timeout = '5s';
${ctx.originalSql}
RESET lock_timeout;

-- Anything that rewrites data is the expensive case here: the rewrite happens
-- once per chunk. Prefer schema changes that only touch the catalog.`,
    };
  },
};
