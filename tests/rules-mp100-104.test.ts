/**
 * MP100-MP104: catalog-aware rules.
 *
 * These read the live catalog through ProductionContext.catalog. Each rule has a
 * "does not fire without production context" case, because that is the behaviour
 * on every run without --database-url.
 */

import { describe, it, expect } from 'vitest';
import { parseMigration } from '../src/parser/parse.js';
import { classifyLock } from '../src/locks/classify.js';
import { allRules, runRules } from '../src/rules/index.js';
import type { ProductionContext } from '../src/production/context.js';
import type {
  CatalogContext,
  ExistingIndex,
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

function index(overrides: Partial<ExistingIndex> & { tableName: string; indexName: string }): ExistingIndex {
  return {
    method: 'btree',
    isUnique: false,
    isPrimary: false,
    isConstraintBacked: false,
    isPartial: false,
    keyColumns: [],
    definition: '',
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

// ──────────────────────────────────────────────
// MP100: warn-redundant-index
// ──────────────────────────────────────────────

describe('MP100: warn-redundant-index', () => {
  const withComposite = context({
    indexes: new Map([['users', [
      index({
        tableName: 'users',
        indexName: 'idx_users_tenant_created',
        keyColumns: ['tenant_id', 'created_at'],
        definition: 'CREATE INDEX idx_users_tenant_created ON public.users USING btree (tenant_id, created_at)',
      }),
    ]]]),
  });

  it('flags a new index that is a prefix of an existing one', async () => {
    const violations = await analyze(
      'CREATE INDEX CONCURRENTLY idx_users_tenant ON users (tenant_id);',
      withComposite
    );
    const v = violations.find(v => v.ruleId === 'MP100');
    expect(v).toBeDefined();
    expect(v!.message).toContain('idx_users_tenant_created');
    expect(v!.message).toContain('tenant_id');
  });

  it('flags an exact duplicate', async () => {
    const violations = await analyze(
      'CREATE INDEX CONCURRENTLY idx_dup ON users (tenant_id, created_at);',
      withComposite
    );
    expect(violations.find(v => v.ruleId === 'MP100')).toBeDefined();
  });

  it('does not fire without production context', async () => {
    const violations = await analyze('CREATE INDEX CONCURRENTLY idx_users_tenant ON users (tenant_id);');
    expect(violations.find(v => v.ruleId === 'MP100')).toBeUndefined();
  });

  it('does not fire when the new index leads with a different column', async () => {
    const violations = await analyze(
      'CREATE INDEX CONCURRENTLY idx_users_created ON users (created_at);',
      withComposite
    );
    expect(violations.find(v => v.ruleId === 'MP100')).toBeUndefined();
  });

  it('does not fire when the existing index uses a different access method', async () => {
    const ctx = context({
      indexes: new Map([['docs', [
        index({ tableName: 'docs', indexName: 'idx_docs_body', method: 'gin', keyColumns: ['body'] }),
      ]]]),
    });
    const violations = await analyze('CREATE INDEX CONCURRENTLY idx_docs_btree ON docs (body);', ctx);
    expect(violations.find(v => v.ruleId === 'MP100')).toBeUndefined();
  });

  it('does not treat a wider unique index as covering a narrower unique index', async () => {
    const ctx = context({
      indexes: new Map([['users', [
        index({
          tableName: 'users',
          indexName: 'idx_users_email_tenant',
          isUnique: true,
          keyColumns: ['email', 'tenant_id'],
        }),
      ]]]),
    });
    const violations = await analyze(
      'CREATE UNIQUE INDEX CONCURRENTLY idx_users_email ON users (email);',
      ctx
    );
    expect(violations.find(v => v.ruleId === 'MP100')).toBeUndefined();
  });

  it('does not fire for a unique index against a non-unique existing index', async () => {
    const violations = await analyze(
      'CREATE UNIQUE INDEX CONCURRENTLY idx_u ON users (tenant_id);',
      withComposite
    );
    expect(violations.find(v => v.ruleId === 'MP100')).toBeUndefined();
  });

  it('stays quiet for partial indexes on either side', async () => {
    const partialExisting = context({
      indexes: new Map([['users', [
        index({ tableName: 'users', indexName: 'idx_partial', isPartial: true, keyColumns: ['tenant_id'] }),
      ]]]),
    });
    const againstPartial = await analyze(
      'CREATE INDEX CONCURRENTLY idx_new ON users (tenant_id);',
      partialExisting
    );
    expect(againstPartial.find(v => v.ruleId === 'MP100')).toBeUndefined();

    const newPartial = await analyze(
      'CREATE INDEX CONCURRENTLY idx_new ON users (tenant_id) WHERE deleted_at IS NULL;',
      withComposite
    );
    expect(newPartial.find(v => v.ruleId === 'MP100')).toBeUndefined();
  });

  it('stays quiet for expression indexes', async () => {
    const violations = await analyze(
      'CREATE INDEX CONCURRENTLY idx_lower ON users (lower(tenant_id));',
      withComposite
    );
    expect(violations.find(v => v.ruleId === 'MP100')).toBeUndefined();
  });

  it('matches the primary key index and names it as such', async () => {
    const ctx = context({
      indexes: new Map([['users', [
        index({
          tableName: 'users',
          indexName: 'users_pkey',
          isUnique: true,
          isPrimary: true,
          keyColumns: ['id'],
          definition: 'CREATE UNIQUE INDEX users_pkey ON public.users USING btree (id)',
        }),
      ]]]),
    });
    const violations = await analyze('CREATE INDEX CONCURRENTLY idx_users_id ON users (id);', ctx);
    const v = violations.find(v => v.ruleId === 'MP100');
    expect(v).toBeDefined();
    expect(v!.message).toContain('primary key index');
  });
});

// ──────────────────────────────────────────────
// MP101: warn-index-on-write-hot-table
// ──────────────────────────────────────────────

describe('MP101: warn-index-on-write-hot-table', () => {
  const hotTable = context({
    tableFacts: new Map([['events', facts({
      tableName: 'events',
      inserts: 8_000_000,
      updates: 2_000_000,
      deletes: 500_000,
      windowSeconds: 86_400,
    })]]),
  });

  it('flags an index build on a write-hot table', async () => {
    const violations = await analyze(
      'CREATE INDEX CONCURRENTLY idx_events_type ON events (event_type);',
      hotTable
    );
    const v = violations.find(v => v.ruleId === 'MP101');
    expect(v).toBeDefined();
    expect(v!.message).toContain('writes/sec');
    expect(v!.message).toContain('8,000,000 inserts');
  });

  it('does not fire without production context', async () => {
    const violations = await analyze('CREATE INDEX CONCURRENTLY idx_events_type ON events (event_type);');
    expect(violations.find(v => v.ruleId === 'MP101')).toBeUndefined();
  });

  it('does not fire on a quiet table', async () => {
    const quiet = context({
      tableFacts: new Map([['events', facts({
        tableName: 'events',
        inserts: 1_000,
        windowSeconds: 86_400,
      })]]),
    });
    const violations = await analyze(
      'CREATE INDEX CONCURRENTLY idx_events_type ON events (event_type);',
      quiet
    );
    expect(violations.find(v => v.ruleId === 'MP101')).toBeUndefined();
  });

  it('falls back to total writes when the stats window is unknown', async () => {
    const noWindow = context({
      tableFacts: new Map([['events', facts({
        tableName: 'events',
        inserts: 6_000_000,
      })]]),
    });
    const violations = await analyze(
      'CREATE INDEX CONCURRENTLY idx_events_type ON events (event_type);',
      noWindow
    );
    const v = violations.find(v => v.ruleId === 'MP101');
    expect(v).toBeDefined();
    expect(v!.message).toContain('since the statistics counters were last reset');
  });

  it('calls out a non-concurrent build blocking writes', async () => {
    const violations = await analyze('CREATE INDEX idx_events_type ON events (event_type);', hotTable);
    const v = violations.find(v => v.ruleId === 'MP101');
    expect(v).toBeDefined();
    expect(v!.message).toContain('not CONCURRENTLY');
  });

  it('ignores non-index statements', async () => {
    const violations = await analyze('ALTER TABLE events ADD COLUMN note text;', hotTable);
    expect(violations.find(v => v.ruleId === 'MP101')).toBeUndefined();
  });
});

// ──────────────────────────────────────────────
// MP102: warn-rewrite-disk-headroom
// ──────────────────────────────────────────────

describe('MP102: warn-rewrite-disk-headroom', () => {
  const bigTable = context({}, [stats({ tableName: 'orders', rowCount: 200_000_000, totalBytes: 400_000_000_000 })]);

  it('flags VACUUM FULL on a large table', async () => {
    const violations = await analyze('VACUUM FULL orders;', bigTable);
    const v = violations.find(v => v.ruleId === 'MP102');
    expect(v).toBeDefined();
    expect(v!.message).toContain('VACUUM FULL');
    expect(v!.message).toContain('400.0 GB');
    expect(v!.message).toContain('800.0 GB');
  });

  it('flags a rewriting column type change', async () => {
    const violations = await analyze(
      'ALTER TABLE orders ALTER COLUMN total TYPE numeric(14,2);',
      bigTable
    );
    const v = violations.find(v => v.ruleId === 'MP102');
    expect(v).toBeDefined();
    expect(v!.message).toContain('ALTER COLUMN ... TYPE');
  });

  it('flags CLUSTER and SET UNLOGGED', async () => {
    const cluster = await analyze('CLUSTER orders USING orders_pkey;', bigTable);
    expect(cluster.find(v => v.ruleId === 'MP102')).toBeDefined();

    const unlogged = await analyze('ALTER TABLE orders SET UNLOGGED;', bigTable);
    expect(unlogged.find(v => v.ruleId === 'MP102')).toBeDefined();
  });

  it('flags ADD COLUMN with a volatile default', async () => {
    const violations = await analyze(
      'ALTER TABLE orders ADD COLUMN token uuid DEFAULT gen_random_uuid();',
      bigTable
    );
    const v = violations.find(v => v.ruleId === 'MP102');
    expect(v).toBeDefined();
    expect(v!.message).toContain('volatile default');
  });

  it('does not flag ADD COLUMN with a constant default on PG11+', async () => {
    const violations = await analyze(
      "ALTER TABLE orders ADD COLUMN status text DEFAULT 'new';",
      bigTable
    );
    expect(violations.find(v => v.ruleId === 'MP102')).toBeUndefined();
  });

  it('does not fire without production context', async () => {
    const violations = await analyze('VACUUM FULL orders;');
    expect(violations.find(v => v.ruleId === 'MP102')).toBeUndefined();
  });

  it('does not fire on a small table', async () => {
    const small = context({}, [stats({ tableName: 'orders', rowCount: 100, totalBytes: 8192 })]);
    const violations = await analyze('VACUUM FULL orders;', small);
    expect(violations.find(v => v.ruleId === 'MP102')).toBeUndefined();
  });

  it('says free space is unavailable when the server cannot report it', async () => {
    const violations = await analyze('VACUUM FULL orders;', bigTable);
    const v = violations.find(v => v.ruleId === 'MP102');
    expect(v!.message).toContain('cannot read free space');
  });

  it('reports the shortfall when free space is known and too small', async () => {
    const tight = context(
      { disk: { availableBytes: 50_000_000_000 } },
      [stats({ tableName: 'orders', rowCount: 200_000_000, totalBytes: 400_000_000_000 })]
    );
    const violations = await analyze('VACUUM FULL orders;', tight);
    const v = violations.find(v => v.ruleId === 'MP102');
    expect(v!.message).toContain('expected to run out of space');
  });

  it('confirms headroom when free space is ample', async () => {
    const roomy = context(
      { disk: { availableBytes: 4_000_000_000_000 } },
      [stats({ tableName: 'orders', rowCount: 200_000_000, totalBytes: 400_000_000_000 })]
    );
    const violations = await analyze('VACUUM FULL orders;', roomy);
    const v = violations.find(v => v.ruleId === 'MP102');
    expect(v!.message).toContain('there is room for the copy');
  });
});

// ──────────────────────────────────────────────
// MP103: warn-replication-lag-risk
// ──────────────────────────────────────────────

describe('MP103: warn-replication-lag-risk', () => {
  const withReplicas = context(
    { replication: { replicaCount: 2, slotCount: 2, maxLagBytes: 12_000_000 } },
    [stats({ tableName: 'events', rowCount: 80_000_000, totalBytes: 60_000_000_000 })]
  );

  it('flags a rewrite while replicas are connected', async () => {
    const violations = await analyze(
      'ALTER TABLE events ALTER COLUMN payload TYPE jsonb;',
      withReplicas
    );
    const v = violations.find(v => v.ruleId === 'MP103');
    expect(v).toBeDefined();
    expect(v!.message).toContain('2 streaming replicas');
    expect(v!.message).toContain('12.0 MB');
    expect(v!.message).toContain('2 replication slots are defined');
  });

  it('flags a large UPDATE, resolving the table from the DML statement', async () => {
    const violations = await analyze(
      'UPDATE events SET processed = true WHERE processed IS NULL;',
      withReplicas
    );
    const v = violations.find(v => v.ruleId === 'MP103');
    expect(v).toBeDefined();
    expect(v!.message).toContain('UPDATE on "events"');
  });

  it('flags an index build', async () => {
    const violations = await analyze(
      'CREATE INDEX CONCURRENTLY idx_events_ts ON events (created_at);',
      withReplicas
    );
    expect(violations.find(v => v.ruleId === 'MP103')).toBeDefined();
  });

  it('does not fire without production context', async () => {
    const violations = await analyze('ALTER TABLE events ALTER COLUMN payload TYPE jsonb;');
    expect(violations.find(v => v.ruleId === 'MP103')).toBeUndefined();
  });

  it('does not fire when no replicas are connected', async () => {
    const noReplicas = context(
      { replication: { replicaCount: 0, slotCount: 0 } },
      [stats({ tableName: 'events', rowCount: 80_000_000, totalBytes: 60_000_000_000 })]
    );
    const violations = await analyze(
      'ALTER TABLE events ALTER COLUMN payload TYPE jsonb;',
      noReplicas
    );
    expect(violations.find(v => v.ruleId === 'MP103')).toBeUndefined();
  });

  it('does not fire on a small table', async () => {
    const small = context(
      { replication: { replicaCount: 2, slotCount: 0 } },
      [stats({ tableName: 'events', rowCount: 1_000, totalBytes: 100_000 })]
    );
    const violations = await analyze(
      'UPDATE events SET processed = true WHERE processed IS NULL;',
      small
    );
    expect(violations.find(v => v.ruleId === 'MP103')).toBeUndefined();
  });

  it('does not fire for a small INSERT ... VALUES', async () => {
    const violations = await analyze(
      "INSERT INTO events (event_type) VALUES ('signup');",
      withReplicas
    );
    expect(violations.find(v => v.ruleId === 'MP103')).toBeUndefined();
  });

  it('flags INSERT ... SELECT', async () => {
    const violations = await analyze(
      'INSERT INTO events (event_type) SELECT event_type FROM staging_events;',
      withReplicas
    );
    const v = violations.find(v => v.ruleId === 'MP103');
    expect(v).toBeDefined();
    expect(v!.message).toContain('INSERT ... SELECT');
  });
});

// ──────────────────────────────────────────────
// MP104: warn-long-index-build
// ──────────────────────────────────────────────

describe('MP104: warn-long-index-build', () => {
  const hugeTable = context({}, [
    stats({ tableName: 'events', rowCount: 500_000_000, totalBytes: 300_000_000_000 }),
  ]);

  it('flags a build on a very large table with a range, not a single number', async () => {
    const violations = await analyze('CREATE INDEX idx_events_ts ON events (created_at);', hugeTable);
    const v = violations.find(v => v.ruleId === 'MP104');
    expect(v).toBeDefined();
    expect(v!.message).toContain('500,000,000 rows');
    expect(v!.message).toMatch(/roughly .+ to .+/);
    expect(v!.message).toContain('wide range');
  });

  it('does not fire without production context', async () => {
    const violations = await analyze('CREATE INDEX idx_events_ts ON events (created_at);');
    expect(violations.find(v => v.ruleId === 'MP104')).toBeUndefined();
  });

  it('does not fire on a table small enough to build quickly', async () => {
    const small = context({}, [stats({ tableName: 'events', rowCount: 100_000, totalBytes: 50_000_000 })]);
    const violations = await analyze('CREATE INDEX idx_events_ts ON events (created_at);', small);
    expect(violations.find(v => v.ruleId === 'MP104')).toBeUndefined();
  });

  it('fires at a lower row count for CONCURRENTLY, which is slower', async () => {
    const midSize = context({}, [
      stats({ tableName: 'events', rowCount: 20_000_000, totalBytes: 10_000_000_000 }),
    ]);

    const plain = await analyze('CREATE INDEX idx_events_ts ON events (created_at);', midSize);
    expect(plain.find(v => v.ruleId === 'MP104')).toBeUndefined();

    const concurrent = await analyze(
      'CREATE INDEX CONCURRENTLY idx_events_ts ON events (created_at);',
      midSize
    );
    const v = concurrent.find(v => v.ruleId === 'MP104');
    expect(v).toBeDefined();
    expect(v!.message).toContain('holds a snapshot');
  });

  it('warns that a plain build blocks writes for the whole window', async () => {
    const violations = await analyze('CREATE INDEX idx_events_ts ON events (created_at);', hugeTable);
    expect(violations.find(v => v.ruleId === 'MP104')!.message).toContain('blocked for that whole window');
  });

  it('reports maintenance_work_mem when the server exposes it', async () => {
    const withSettings = context(
      { settings: { maintenanceWorkMemBytes: 67_108_864, maxParallelMaintenanceWorkers: 2 } },
      [stats({ tableName: 'events', rowCount: 500_000_000, totalBytes: 300_000_000_000 })]
    );
    const violations = await analyze('CREATE INDEX idx_events_ts ON events (created_at);', withSettings);
    const v = violations.find(v => v.ruleId === 'MP104');
    expect(v!.message).toContain('maintenance_work_mem is 64MB');
    expect(v!.message).toContain('max_parallel_maintenance_workers is 2');
  });
});
