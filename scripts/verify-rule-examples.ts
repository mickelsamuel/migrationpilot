/**
 * Acceptance test for the site's rule examples.
 *
 * For every entry in site/src/app/rule-data.ts: the rule must fire on its own
 * badExample and stay silent on its own goodExample. Catalog-aware rules get the
 * production context they document, because without it they are silent by design.
 */

import { parseMigration } from '../src/parser/parse.js';
import { classifyLock } from '../src/locks/classify.js';
import { allRules, runRules } from '../src/rules/index.js';
import type { ProductionContext } from '../src/production/context.js';
import type { CatalogContext, ExistingIndex, TableExtensionInfo, TableFacts } from '../src/production/catalog.js';
import { emptyCatalogContext } from '../src/production/catalog.js';
import type { TableStats } from '../src/scoring/score.js';
import { rules } from '../site/src/app/rule-data.js';

const PG_VERSION = 17;

/** Rules that only fire on a newer server than the default target. */
const pgVersions: Record<string, number> = { MP081: 18, MP082: 18, MP083: 18 };

async function analyze(sql: string, prodCtx?: ProductionContext, pgVersion = PG_VERSION) {
  const parsed = await parseMigration(sql);
  if (parsed.errors.length > 0) {
    throw new Error(`PARSE ERROR: ${parsed.errors.map((e) => e.message).join('; ')}`);
  }
  const statements = parsed.statements.map((s) => {
    const lock = classifyLock(s.stmt, pgVersion);
    const line = sql.slice(0, s.stmtLocation).split('\n').length;
    return { ...s, lock, line };
  });
  return runRules(allRules, statements, pgVersion, prodCtx);
}

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

/** The production context each catalog-aware rule documents in its example. */
const contexts: Record<string, ProductionContext> = {
  MP013: {
    tableStats: new Map(),
    affectedQueries: new Map([['users', [{
      queryId: '1', normalizedQuery: 'SELECT * FROM users WHERE id = $1',
      calls: 50_000, meanExecTime: 0.8, serviceName: 'api',
    }]]]),
    activeConnections: new Map(),
  },
  MP014: {
    tableStats: new Map([['users', stats({ tableName: 'users', rowCount: 50_000_000, totalBytes: 40 * 1024 ** 3, indexCount: 4 })]]),
    affectedQueries: new Map(),
    activeConnections: new Map(),
  },
  MP019: {
    tableStats: new Map(),
    affectedQueries: new Map(),
    activeConnections: new Map([['users', 200]]),
  },
  MP097: ctx({
    indexes: new Map([['users', [
      index({ tableName: 'users', indexName: 'users_email_key', isUnique: true, isConstraintBacked: true, keyColumns: ['email'] }),
    ]]]),
  }),
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

type Row = { id: string; fires: boolean; silent: boolean; note: string };

const onlyNew = process.argv.includes('--new');
const target = rules.filter((r) => (onlyNew ? Number(r.id.slice(2)) >= 84 : true));

const results: Row[] = [];
for (const rule of target) {
  const prodCtx = contexts[rule.id];
  const pgv = pgVersions[rule.id] ?? PG_VERSION;
  const row: Row = { id: rule.id, fires: false, silent: false, note: '' };
  try {
    const bad = await analyze(rule.badExample, prodCtx, pgv);
    row.fires = bad.some((v) => v.ruleId === rule.id);
  } catch (e) {
    row.note += `bad: ${(e as Error).message} `;
  }
  try {
    const good = await analyze(rule.goodExample, prodCtx, pgv);
    row.silent = !good.some((v) => v.ruleId === rule.id);
  } catch (e) {
    row.note += `good: ${(e as Error).message} `;
  }
  results.push(row);
}

const fails = results.filter((r) => !r.fires || !r.silent);
const pad = (s: string, n: number) => s.padEnd(n);
console.log(`${pad('RULE', 8)} ${pad('FIRES-ON-BAD', 14)} ${pad('SILENT-ON-GOOD', 15)} NOTE`);
for (const r of results) {
  const bad = r.fires ? 'PASS' : 'FAIL';
  const good = r.silent ? 'PASS' : 'FAIL';
  if (!r.fires || !r.silent || process.argv.includes('--all')) {
    console.log(`${pad(r.id, 8)} ${pad(bad, 14)} ${pad(good, 15)} ${r.note}`);
  }
}
console.log(`\nchecked ${results.length} rules — ${results.length - fails.length} pass, ${fails.length} fail`);
if (fails.length > 0) console.log('failing:', fails.map((f) => f.id).join(', '));

// Known exceptions, each with a reason and a pending decision on record:
// - MP017..MP080 set: goodExample intentionally repeats the flagged statement with
//   process mitigation above it (irreversible operations; the "safe" form is the
//   same op done carefully). Pending relabel to "mitigated" on the rule pages.
// - MP081/MP082: bundled parser speaks PG17 grammar; their PG18 syntax cannot
//   parse until the libpg-query upgrade lands (documented public limitation).
const KNOWN_EXCEPTIONS = new Set([
  'MP017', 'MP026', 'MP029', 'MP035', 'MP044', 'MP048', 'MP066', 'MP069',
  'MP072', 'MP075', 'MP080', 'MP081', 'MP082',
]);
const newFailures = fails.filter((f) => !KNOWN_EXCEPTIONS.has(f.id));
const fixedExceptions = [...KNOWN_EXCEPTIONS].filter((id) => !fails.some((f) => f.id === id));
if (fixedExceptions.length > 0) {
  console.log(`note: known exceptions now passing (remove from list): ${fixedExceptions.join(', ')}`);
}
if (newFailures.length > 0) {
  console.log(`NEW failures (not in the known-exception list): ${newFailures.map((f) => f.id).join(', ')}`);
  process.exit(1);
}
