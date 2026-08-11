/**
 * MP105-MP112: extension awareness (TimescaleDB, Citus, pg_partman, pgvector)
 * plus the partitioned-parent fan-out rule.
 *
 * All of these except MP109 need the live catalog, so each has a "does not fire
 * without production context" case.
 */

import { describe, it, expect } from 'vitest';
import { parseMigration } from '../src/parser/parse.js';
import { classifyLock } from '../src/locks/classify.js';
import { allRules, runRules } from '../src/rules/index.js';
import type { ProductionContext } from '../src/production/context.js';
import type {
  CatalogContext,
  TableExtensionInfo,
  TableFacts,
} from '../src/production/catalog.js';
import { emptyCatalogContext } from '../src/production/catalog.js';
import type { TableStats } from '../src/scoring/score.js';

async function analyze(sql: string, prodCtx?: ProductionContext, pgVersion = 17) {
  const parsed = await parseMigration(sql);
  expect(parsed.errors).toHaveLength(0);

  const statements = parsed.statements.map(s => {
    const lock = classifyLock(s.stmt, pgVersion);
    const line = sql.slice(0, s.stmtLocation).split('\n').length;
    return { ...s, lock, line };
  });

  return runRules(allRules, statements, pgVersion, prodCtx);
}

function stats(overrides: Partial<TableStats> & { tableName: string }): TableStats {
  return { rowCount: 0, totalBytes: 0, indexCount: 0, ...overrides };
}

function extension(
  overrides: Partial<TableExtensionInfo> & { tableName: string }
): TableExtensionInfo {
  return {
    isHypertable: false,
    isCitusDistributed: false,
    isPartmanParent: false,
    ...overrides,
  };
}

function facts(overrides: Partial<TableFacts> & { tableName: string }): TableFacts {
  return {
    relKind: 'r',
    partitionCount: 0,
    inserts: 0,
    updates: 0,
    deletes: 0,
    liveTuples: 0,
    ...overrides,
  };
}

function context(
  catalog: Partial<CatalogContext>,
  tableStats: TableStats[] = []
): ProductionContext {
  return {
    tableStats: new Map(tableStats.map(s => [s.tableName, s])),
    affectedQueries: new Map(),
    activeConnections: new Map(),
    catalog: { ...emptyCatalogContext(), ...catalog },
  };
}

function withExtension(info: TableExtensionInfo, tableStats: TableStats[] = []): ProductionContext {
  return context({ extensionTables: new Map([[info.tableName, info]]) }, tableStats);
}

// ──────────────────────────────────────────────
// MP105: warn-timescale-hypertable-ddl
// ──────────────────────────────────────────────

describe('MP105: warn-timescale-hypertable-ddl', () => {
  const hypertable = withExtension(extension({
    tableName: 'metrics',
    isHypertable: true,
    chunkCount: 420,
    timeColumn: 'time',
  }));

  it('flags ALTER TABLE on a hypertable and reports the chunk count', async () => {
    const violations = await analyze('ALTER TABLE metrics ADD COLUMN device_id integer;', hypertable);
    const v = violations.find(v => v.ruleId === 'MP105');
    expect(v).toBeDefined();
    expect(v!.message).toContain('420 chunks');
  });

  it('flags a plain CREATE INDEX on a hypertable', async () => {
    const violations = await analyze('CREATE INDEX idx_metrics_device ON metrics (device_id);', hypertable);
    const v = violations.find(v => v.ruleId === 'MP105');
    expect(v).toBeDefined();
    expect(v!.safeAlternative).toContain('timescaledb.transaction_per_chunk');
  });

  it('says CONCURRENTLY is unsupported on hypertables', async () => {
    const violations = await analyze(
      'CREATE INDEX CONCURRENTLY idx_metrics_device ON metrics (device_id);',
      hypertable
    );
    const v = violations.find(v => v.ruleId === 'MP105');
    expect(v).toBeDefined();
    expect(v!.message).toContain('not supported on hypertables');
  });

  it('does not fire without production context', async () => {
    const violations = await analyze('ALTER TABLE metrics ADD COLUMN device_id integer;');
    expect(violations.find(v => v.ruleId === 'MP105')).toBeUndefined();
  });

  it('does not fire on an ordinary table', async () => {
    const plain = withExtension(extension({ tableName: 'metrics' }));
    const violations = await analyze('ALTER TABLE metrics ADD COLUMN device_id integer;', plain);
    expect(violations.find(v => v.ruleId === 'MP105')).toBeUndefined();
  });

  it('mentions compression when the hypertable has it enabled', async () => {
    const compressed = withExtension(extension({
      tableName: 'metrics',
      isHypertable: true,
      chunkCount: 12,
      compressionEnabled: true,
    }));
    const violations = await analyze('ALTER TABLE metrics ADD COLUMN device_id integer;', compressed);
    expect(violations.find(v => v.ruleId === 'MP105')!.message).toContain('compression enabled');
  });
});

// ──────────────────────────────────────────────
// MP106: prefer-timescale-drop-chunks
// ──────────────────────────────────────────────

describe('MP106: prefer-timescale-drop-chunks', () => {
  const hypertable = withExtension(extension({
    tableName: 'metrics',
    isHypertable: true,
    chunkCount: 90,
    timeColumn: 'time',
  }));

  it('flags a retention DELETE against the time dimension', async () => {
    const violations = await analyze(
      "DELETE FROM metrics WHERE time < now() - interval '30 days';",
      hypertable
    );
    const v = violations.find(v => v.ruleId === 'MP106');
    expect(v).toBeDefined();
    expect(v!.message).toContain('time');
    expect(v!.safeAlternative).toContain('drop_chunks');
  });

  it('flags a literal timestamp bound too', async () => {
    const violations = await analyze("DELETE FROM metrics WHERE time < '2024-01-01';", hypertable);
    expect(violations.find(v => v.ruleId === 'MP106')).toBeDefined();
  });

  it('does not fire without production context', async () => {
    const violations = await analyze("DELETE FROM metrics WHERE time < now() - interval '30 days';");
    expect(violations.find(v => v.ruleId === 'MP106')).toBeUndefined();
  });

  it('does not fire on a DELETE filtered on some other column', async () => {
    const violations = await analyze('DELETE FROM metrics WHERE device_id = 7;', hypertable);
    expect(violations.find(v => v.ruleId === 'MP106')).toBeUndefined();
  });

  it('does not fire when the time dimension is unknown', async () => {
    const noDimension = withExtension(extension({
      tableName: 'metrics',
      isHypertable: true,
      chunkCount: 90,
    }));
    const violations = await analyze(
      "DELETE FROM metrics WHERE time < now() - interval '30 days';",
      noDimension
    );
    expect(violations.find(v => v.ruleId === 'MP106')).toBeUndefined();
  });

  it('does not fire on a plain table', async () => {
    const plain = withExtension(extension({ tableName: 'metrics' }));
    const violations = await analyze("DELETE FROM metrics WHERE time < '2024-01-01';", plain);
    expect(violations.find(v => v.ruleId === 'MP106')).toBeUndefined();
  });

  it('does not fire on a WHERE-less DELETE (MP067 covers that)', async () => {
    const violations = await analyze('DELETE FROM metrics;', hypertable);
    expect(violations.find(v => v.ruleId === 'MP106')).toBeUndefined();
    expect(violations.find(v => v.ruleId === 'MP067')).toBeDefined();
  });
});

// ──────────────────────────────────────────────
// MP107: warn-citus-distributed-ddl
// ──────────────────────────────────────────────

describe('MP107: warn-citus-distributed-ddl', () => {
  const distributed = withExtension(extension({
    tableName: 'orders',
    isCitusDistributed: true,
    citusDistributionColumn: 'tenant_id',
    citusShardCount: 32,
  }));

  it('flags ALTER on a distributed table with the shard count', async () => {
    const violations = await analyze('ALTER TABLE orders ADD COLUMN note text;', distributed);
    const v = violations.find(v => v.ruleId === 'MP107');
    expect(v).toBeDefined();
    expect(v!.message).toContain('32 shards');
    expect(v!.message).toContain('tenant_id');
  });

  it('says the statement will be refused when it touches the distribution column', async () => {
    const violations = await analyze(
      'ALTER TABLE orders ALTER COLUMN tenant_id TYPE bigint;',
      distributed
    );
    const v = violations.find(v => v.ruleId === 'MP107');
    expect(v).toBeDefined();
    expect(v!.message).toContain('refuses');
  });

  it('does not fire without production context', async () => {
    const violations = await analyze('ALTER TABLE orders ADD COLUMN note text;');
    expect(violations.find(v => v.ruleId === 'MP107')).toBeUndefined();
  });

  it('does not fire on a local table', async () => {
    const local = withExtension(extension({ tableName: 'orders' }));
    const violations = await analyze('ALTER TABLE orders ADD COLUMN note text;', local);
    expect(violations.find(v => v.ruleId === 'MP107')).toBeUndefined();
  });

  it('ignores non-ALTER statements', async () => {
    const violations = await analyze('CREATE INDEX CONCURRENTLY idx_o ON orders (note);', distributed);
    expect(violations.find(v => v.ruleId === 'MP107')).toBeUndefined();
  });
});

// ──────────────────────────────────────────────
// MP108: warn-partman-managed-parent
// ──────────────────────────────────────────────

describe('MP108: warn-partman-managed-parent', () => {
  const managed = withExtension(extension({
    tableName: 'events',
    isPartmanParent: true,
    partmanControlColumn: 'created_at',
    partmanInterval: '1 day',
    partmanPremake: 4,
    partmanRetention: '90 days',
  }));

  it('flags CREATE TABLE ... PARTITION OF a managed parent', async () => {
    const violations = await analyze(
      `CREATE TABLE events_p2024_01 PARTITION OF events
         FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');`,
      managed
    );
    const v = violations.find(v => v.ruleId === 'MP108');
    expect(v).toBeDefined();
    expect(v!.message).toContain('pg_partman');
    expect(v!.message).toContain('control column "created_at"');
    expect(v!.message).toContain('retention 90 days');
  });

  it('flags ATTACH PARTITION and DETACH PARTITION', async () => {
    const attach = await analyze(
      `ALTER TABLE events ATTACH PARTITION events_p2024_02
         FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');`,
      managed
    );
    expect(attach.find(v => v.ruleId === 'MP108')).toBeDefined();

    const detach = await analyze('ALTER TABLE events DETACH PARTITION events_p2024_01;', managed);
    expect(detach.find(v => v.ruleId === 'MP108')).toBeDefined();
  });

  it('does not fire without production context', async () => {
    const violations = await analyze('ALTER TABLE events DETACH PARTITION events_p2024_01;');
    expect(violations.find(v => v.ruleId === 'MP108')).toBeUndefined();
  });

  it('does not fire on a parent partman does not manage', async () => {
    const unmanaged = withExtension(extension({ tableName: 'events' }));
    const violations = await analyze('ALTER TABLE events DETACH PARTITION events_p2024_01;', unmanaged);
    expect(violations.find(v => v.ruleId === 'MP108')).toBeUndefined();
  });

  it('ignores DDL that is not partition management', async () => {
    const violations = await analyze('ALTER TABLE events ADD COLUMN note text;', managed);
    expect(violations.find(v => v.ruleId === 'MP108')).toBeUndefined();
  });
});

// ──────────────────────────────────────────────
// MP109: require-vector-index-params (static)
// ──────────────────────────────────────────────

describe('MP109: require-vector-index-params', () => {
  it('flags an HNSW index with no parameters, with no database needed', async () => {
    const violations = await analyze(
      'CREATE INDEX idx_items_embedding ON items USING hnsw (embedding vector_cosine_ops);'
    );
    const v = violations.find(v => v.ruleId === 'MP109');
    expect(v).toBeDefined();
    expect(v!.message).toContain('m = 16');
    expect(v!.message).toContain('ef_construction = 64');
  });

  it('accepts an HNSW index that sets both parameters', async () => {
    const violations = await analyze(
      'CREATE INDEX idx_items_embedding ON items USING hnsw (embedding vector_cosine_ops) WITH (m = 24, ef_construction = 128);'
    );
    expect(violations.find(v => v.ruleId === 'MP109')).toBeUndefined();
  });

  it('flags an HNSW index that sets only one of the two', async () => {
    const violations = await analyze(
      'CREATE INDEX idx_items_embedding ON items USING hnsw (embedding vector_cosine_ops) WITH (m = 24);'
    );
    const v = violations.find(v => v.ruleId === 'MP109');
    expect(v).toBeDefined();
    expect(v!.message).toContain('ef_construction');
  });

  it('flags an IVFFlat index with no lists', async () => {
    const violations = await analyze(
      'CREATE INDEX idx_items_embedding ON items USING ivfflat (embedding vector_l2_ops);'
    );
    const v = violations.find(v => v.ruleId === 'MP109');
    expect(v).toBeDefined();
    expect(v!.message).toContain('rows / 1000');
  });

  it('accepts an IVFFlat index that sets lists', async () => {
    const violations = await analyze(
      'CREATE INDEX idx_items_embedding ON items USING ivfflat (embedding vector_l2_ops) WITH (lists = 500);'
    );
    expect(violations.find(v => v.ruleId === 'MP109')).toBeUndefined();
  });

  it('sizes lists from the row count when production context is available', async () => {
    const ctx = context({}, [stats({ tableName: 'items', rowCount: 4_000_000, totalBytes: 20_000_000_000 })]);
    const violations = await analyze(
      'CREATE INDEX idx_items_embedding ON items USING ivfflat (embedding vector_l2_ops);',
      ctx
    );
    const v = violations.find(v => v.ruleId === 'MP109');
    expect(v).toBeDefined();
    // sqrt(4,000,000) = 2,000 for a table over a million rows
    expect(v!.message).toContain('2,000');
    expect(v!.safeAlternative).toContain('lists = 2000');
  });

  it('uses rows / 1000 below a million rows', async () => {
    const ctx = context({}, [stats({ tableName: 'items', rowCount: 250_000, totalBytes: 1_000_000_000 })]);
    const violations = await analyze(
      'CREATE INDEX idx_items_embedding ON items USING ivfflat (embedding vector_l2_ops);',
      ctx
    );
    expect(violations.find(v => v.ruleId === 'MP109')!.safeAlternative).toContain('lists = 250');
  });

  it('ignores ordinary B-tree indexes', async () => {
    const violations = await analyze('CREATE INDEX idx_items_name ON items (name);');
    expect(violations.find(v => v.ruleId === 'MP109')).toBeUndefined();
  });
});

// ──────────────────────────────────────────────
// MP110: warn-partitioned-parent-fanout
// ──────────────────────────────────────────────

describe('MP110: warn-partitioned-parent-fanout', () => {
  const manyPartitions = context({
    tableFacts: new Map([['events', facts({
      tableName: 'events',
      relKind: 'p',
      partitionCount: 365,
    })]]),
  });

  it('flags ALTER on a parent with many partitions', async () => {
    const violations = await analyze('ALTER TABLE events ADD COLUMN note text;', manyPartitions);
    const v = violations.find(v => v.ruleId === 'MP110');
    expect(v).toBeDefined();
    expect(v!.message).toContain('365 partitions');
    expect(v!.safeAlternative).toContain('max_locks_per_transaction');
  });

  it('flags a plain CREATE INDEX on the parent', async () => {
    const violations = await analyze('CREATE INDEX idx_events_note ON events (note);', manyPartitions);
    expect(violations.find(v => v.ruleId === 'MP110')).toBeDefined();
  });

  it('does not fire without production context', async () => {
    const violations = await analyze('ALTER TABLE events ADD COLUMN note text;');
    expect(violations.find(v => v.ruleId === 'MP110')).toBeUndefined();
  });

  it('does not fire on a non-partitioned table', async () => {
    const plain = context({
      tableFacts: new Map([['events', facts({ tableName: 'events' })]]),
    });
    const violations = await analyze('ALTER TABLE events ADD COLUMN note text;', plain);
    expect(violations.find(v => v.ruleId === 'MP110')).toBeUndefined();
  });

  it('does not fire on a parent with only a few partitions', async () => {
    const few = context({
      tableFacts: new Map([['events', facts({ tableName: 'events', relKind: 'p', partitionCount: 4 })]]),
    });
    const violations = await analyze('ALTER TABLE events ADD COLUMN note text;', few);
    expect(violations.find(v => v.ruleId === 'MP110')).toBeUndefined();
  });

  it('defers to MP105 and MP108 for extension-managed parents', async () => {
    const hypertable = context({
      tableFacts: new Map([['events', facts({ tableName: 'events', relKind: 'p', partitionCount: 365 })]]),
      extensionTables: new Map([['events', extension({ tableName: 'events', isHypertable: true })]]),
    });
    const violations = await analyze('ALTER TABLE events ADD COLUMN note text;', hypertable);
    expect(violations.find(v => v.ruleId === 'MP110')).toBeUndefined();
    expect(violations.find(v => v.ruleId === 'MP105')).toBeDefined();
  });
});

// ──────────────────────────────────────────────
// MP111: warn-timescale-columnstore-ddl
// ──────────────────────────────────────────────

describe('MP111: warn-timescale-columnstore-ddl', () => {
  const compressed = withExtension(extension({
    tableName: 'metrics',
    isHypertable: true,
    chunkCount: 200,
    compressionEnabled: true,
  }));

  it('flags a column type change as critical', async () => {
    const violations = await analyze('ALTER TABLE metrics ALTER COLUMN value TYPE numeric;', compressed);
    const v = violations.find(v => v.ruleId === 'MP111');
    expect(v).toBeDefined();
    expect(v!.severity).toBe('critical');
    expect(v!.message).toContain('columnstore enabled');
  });

  it('flags SET STORAGE and row-level security changes', async () => {
    const storage = await analyze(
      'ALTER TABLE metrics ALTER COLUMN payload SET STORAGE EXTERNAL;',
      compressed
    );
    expect(storage.find(v => v.ruleId === 'MP111')).toBeDefined();

    const rls = await analyze('ALTER TABLE metrics ENABLE ROW LEVEL SECURITY;', compressed);
    expect(rls.find(v => v.ruleId === 'MP111')).toBeDefined();
  });

  it('does not fire without production context', async () => {
    const violations = await analyze('ALTER TABLE metrics ALTER COLUMN value TYPE numeric;');
    expect(violations.find(v => v.ruleId === 'MP111')).toBeUndefined();
  });

  it('does not fire when the hypertable has no columnstore', async () => {
    const uncompressed = withExtension(extension({
      tableName: 'metrics',
      isHypertable: true,
      compressionEnabled: false,
    }));
    const violations = await analyze(
      'ALTER TABLE metrics ALTER COLUMN value TYPE numeric;',
      uncompressed
    );
    expect(violations.find(v => v.ruleId === 'MP111')).toBeUndefined();
  });

  it('does not fire for ALTER forms TimescaleDB allows', async () => {
    const violations = await analyze('ALTER TABLE metrics ADD COLUMN note text;', compressed);
    expect(violations.find(v => v.ruleId === 'MP111')).toBeUndefined();
  });
});

// ──────────────────────────────────────────────
// MP112: warn-hnsw-build-memory
// ──────────────────────────────────────────────

describe('MP112: warn-hnsw-build-memory', () => {
  const tightMemory = context(
    { settings: { maintenanceWorkMemBytes: 67_108_864, maxParallelMaintenanceWorkers: 2 } },
    [stats({ tableName: 'items', rowCount: 8_000_000, totalBytes: 40_000_000_000 })]
  );

  it('flags a large HNSW build against a small maintenance_work_mem', async () => {
    const violations = await analyze(
      'CREATE INDEX idx_items_embedding ON items USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);',
      tightMemory
    );
    const v = violations.find(v => v.ruleId === 'MP112');
    expect(v).toBeDefined();
    expect(v!.message).toContain('8,000,000 rows');
    expect(v!.message).toContain('64MB');
    expect(v!.message).toContain('no longer fits into maintenance_work_mem');
  });

  it('does not fire without production context', async () => {
    const violations = await analyze(
      'CREATE INDEX idx_items_embedding ON items USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);'
    );
    expect(violations.find(v => v.ruleId === 'MP112')).toBeUndefined();
  });

  it('does not fire when maintenance_work_mem is generous', async () => {
    const roomy = context(
      { settings: { maintenanceWorkMemBytes: 8 * 1024 ** 3 } },
      [stats({ tableName: 'items', rowCount: 8_000_000, totalBytes: 40_000_000_000 })]
    );
    const violations = await analyze(
      'CREATE INDEX idx_items_embedding ON items USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);',
      roomy
    );
    expect(violations.find(v => v.ruleId === 'MP112')).toBeUndefined();
  });

  it('does not fire on a small vector table', async () => {
    const small = context(
      { settings: { maintenanceWorkMemBytes: 67_108_864 } },
      [stats({ tableName: 'items', rowCount: 5_000, totalBytes: 20_000_000 })]
    );
    const violations = await analyze(
      'CREATE INDEX idx_items_embedding ON items USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);',
      small
    );
    expect(violations.find(v => v.ruleId === 'MP112')).toBeUndefined();
  });

  it('ignores IVFFlat and B-tree builds', async () => {
    const ivfflat = await analyze(
      'CREATE INDEX idx_items_embedding ON items USING ivfflat (embedding vector_l2_ops) WITH (lists = 1000);',
      tightMemory
    );
    expect(ivfflat.find(v => v.ruleId === 'MP112')).toBeUndefined();

    const btree = await analyze('CREATE INDEX idx_items_name ON items (name);', tightMemory);
    expect(btree.find(v => v.ruleId === 'MP112')).toBeUndefined();
  });
});
