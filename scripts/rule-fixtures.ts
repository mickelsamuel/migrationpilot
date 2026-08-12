/**
 * The production context each catalog-aware rule's example describes, plus the
 * server versions a few rules need. Shared so the example verifier and the
 * CLI-output generator cannot drift apart: if a rule's fixture changes, both the
 * gate and the sample output on its page change with it.
 */
import type { ProductionContext } from '../src/production/context.js';
import type {
  CatalogContext,
  ExistingIndex,
  TableExtensionInfo,
  TableFacts,
} from '../src/production/catalog.js';
import { emptyCatalogContext } from '../src/production/catalog.js';
import type { TableStats } from '../src/scoring/score.js';

/** The PostgreSQL major the examples are analysed against unless a rule needs newer. */
export const PG_VERSION = 17;


/** Rules that only fire on a newer server than the default target. */
export const pgVersions: Record<string, number> = { MP081: 18, MP082: 18, MP083: 18 };

const stats = (o: Partial<TableStats> & { tableName: string }): TableStats => ({
  rowCount: 0, totalBytes: 0, indexCount: 0, ...o,
});
const facts = (o: Partial<TableFacts> & { tableName: string }): TableFacts => ({
  relKind: 'r', partitionCount: 0, inserts: 0, updates: 0, deletes: 0, liveTuples: 0, ...o,
});
const ext = (o: Partial<TableExtensionInfo> & { tableName: string }): TableExtensionInfo => ({
  isHypertable: false, isCitusDistributed: false, isPartmanParent: false, ...o,
});
const index = (o: Partial<ExistingIndex> & { tableName: string; indexName: string }): ExistingIndex => ({
  method: 'btree', isUnique: false, isPrimary: false, isConstraintBacked: false,
  isPartial: false, keyColumns: [], definition: '', ...o,
});

function ctx(catalog: Partial<CatalogContext>, tableStats: TableStats[] = []): ProductionContext {
  return {
    tableStats: new Map(tableStats.map((s) => [s.tableName, s])),
    affectedQueries: new Map(),
    activeConnections: new Map(),
    catalog: { ...emptyCatalogContext(), ...catalog },
  };
}

const GB = 1024 ** 3;

/** The production context each catalog-aware rule's example describes. */
export const contexts: Record<string, ProductionContext> = {
  MP013: {
    tableStats: new Map(),
    affectedQueries: new Map([['users', [{
      queryId: '1', normalizedQuery: 'SELECT * FROM users WHERE id = $1',
      calls: 50_000, meanExecTime: 0.8, serviceName: 'api',
    }]]]),
    activeConnections: new Map(),
  },
  MP014: {
    tableStats: new Map([['users', stats({ tableName: 'users', rowCount: 50_000_000, totalBytes: 40 * GB, indexCount: 4 })]]),
    affectedQueries: new Map(),
    activeConnections: new Map(),
  },
  MP019: {
    tableStats: new Map(),
    affectedQueries: new Map(),
    activeConnections: new Map([['users', 200]]),
  },
  MP100: ctx({
    indexes: new Map([['users', [
      index({
        tableName: 'users', indexName: 'idx_users_tenant_created',
        keyColumns: ['tenant_id', 'created_at'],
        definition: 'CREATE INDEX idx_users_tenant_created ON public.users USING btree (tenant_id, created_at)',
      }),
    ]]]),
  }),
  MP101: ctx({
    tableFacts: new Map([['events', facts({
      tableName: 'events', inserts: 8_000_000, updates: 2_000_000, deletes: 100_000,
      liveTuples: 50_000_000, windowSeconds: 86_400,
    })]]),
  }),
  MP102: ctx({}, [stats({ tableName: 'orders', rowCount: 800_000_000, totalBytes: 400 * GB })]),
  MP103: ctx(
    { replication: { replicaCount: 2, slotCount: 2 } },
    [stats({ tableName: 'events', rowCount: 200_000_000, totalBytes: 60 * GB })]
  ),
  MP104: ctx({}, [stats({ tableName: 'events', rowCount: 500_000_000, totalBytes: 80 * GB })]),
  MP105: ctx({
    extensionTables: new Map([['metrics', ext({ tableName: 'metrics', isHypertable: true, chunkCount: 420, timeColumn: 'time' })]]),
  }),
  MP106: ctx({
    extensionTables: new Map([['metrics', ext({ tableName: 'metrics', isHypertable: true, chunkCount: 420, timeColumn: 'time' })]]),
  }),
  MP107: ctx({
    extensionTables: new Map([['orders', ext({
      tableName: 'orders', isCitusDistributed: true, citusDistributionColumn: 'tenant_id', citusShardCount: 32,
    })]]),
  }),
  MP108: ctx({
    extensionTables: new Map([['events', ext({
      tableName: 'events', isPartmanParent: true, partmanControlColumn: 'created_at',
      partmanInterval: '1 day', partmanPremake: 4, partmanRetention: '90 days',
    })]]),
  }),
  MP110: ctx({
    tableFacts: new Map([['events', facts({ tableName: 'events', relKind: 'p', partitionCount: 365, liveTuples: 900_000_000 })]]),
  }),
  MP111: ctx({
    extensionTables: new Map([['metrics', ext({
      tableName: 'metrics', isHypertable: true, chunkCount: 420, compressionEnabled: true, timeColumn: 'time',
    })]]),
  }),
  MP112: ctx(
    { settings: { maintenanceWorkMemBytes: 64 * 1024 * 1024, maxParallelMaintenanceWorkers: 2 } },
    [stats({ tableName: 'items', rowCount: 8_000_000, totalBytes: 40 * GB })]
  ),
};
