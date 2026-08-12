/**
 * Checks the site's rule catalog against the engine.
 *
 * Three things, all of which have been wrong in production at some point:
 *
 *  1. Examples. Every rule must fire on its own badExample and stay silent on
 *     its goodExample. A rule page whose "safe" block the tool itself flags, or
 *     whose "unsafe" block it ignores, is worse than no page.
 *  2. Registry parity. Names, severities, auto-fix flags and requiresDatabaseUrl
 *     must match the engine. Rule names are what users put in
 *     .migrationpilotrc.yml, where an unknown name fails silently.
 *  3. requiresDatabaseUrl, checked by behaviour rather than by label: a rule
 *     that claims to need a connection must say nothing without one, and a rule
 *     that does not claim it must speak up.
 *
 * The 15 catalog-aware rules are silent by design without --database-url, so
 * each is given the production context its own documentation describes.
 *
 *   npx tsx scripts/verify-rule-examples.ts          # everything
 *   npx tsx scripts/verify-rule-examples.ts --all    # print passing rows too
 *
 * Exits non-zero on any failure.
 */

import { parseMigration } from '../src/parser/parse.js';
import { classifyLock } from '../src/locks/classify.js';
import { allRules, runRules } from '../src/rules/index.js';
import { isFixable } from '../src/fixer/fix.js';
import type { ProductionContext } from '../src/production/context.js';
import type {
  CatalogContext,
  ExistingIndex,
  TableExtensionInfo,
  TableFacts,
} from '../src/production/catalog.js';
import { emptyCatalogContext } from '../src/production/catalog.js';
import type { TableStats } from '../src/scoring/score.js';
import {
  rules,
  ruleCatalog,
  ruleCategories,
  productionContextRuleIds,
  autoFixableRuleIds,
} from '../site/src/app/rule-data.js';

const PG_VERSION = 17;

/**
 * Known, accepted example failures. Each one is a decision, not a bug, so the
 * script stays green on them and goes red the moment anything else breaks.
 * Delete an entry when its cause is fixed — a stale exception is the failure
 * mode this map is meant to prevent.
 */
const KNOWN_EXCEPTIONS: Record<string, string> = {
  // Irreversible operations have no syntactic "safe" form: the mitigation is
  // process, so the good example legitimately still trips the rule. These are
  // labelled "mitigated (still flagged)" on the site rather than rewritten.
  MP017: 'good example is the same DROP COLUMN, mitigated by sequencing',
  MP026: 'good example still drops the table, after a rename and a wait',
  MP029: 'good example still drops NOT NULL, after auditing callers',
  MP035: 'good example still drops the schema, object by object',
  MP044: 'good example still narrows the type, after checking bounds',
  MP048: 'good example still sets the volatile default, then backfills',
  MP066: 'good example still disables autovacuum, for a bounded window',
  MP069: 'good example still takes both FK locks',
  MP072: 'good example still scans the default partition',
  MP075: 'good example still risks TOAST bloat',
  MP080: 'good example still carries DML, split across files',
  // libpg-query is pinned to the PostgreSQL 17 grammar, so PG18-only syntax
  // does not parse at all. Tracked as a parser-upgrade fast-follow.
  MP081: 'PG18 native NOT NULL ... NOT VALID does not parse under libpg-query 17',
  MP082: 'PG18 NOT ENFORCED does not parse under libpg-query 17',
};

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

/** The production context each catalog-aware rule's example describes. */
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

// ── 1. examples ──────────────────────────────────────────────────────────────

type Row = { id: string; fires: boolean; silent: boolean; note: string };
const results: Row[] = [];

for (const rule of rules) {
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

// ── 2. registry parity ───────────────────────────────────────────────────────

const reg = Object.fromEntries(allRules.map((r) => [r.id, r]));
const parity: string[] = [];

if (ruleCatalog.length !== allRules.length) {
  parity.push(`catalog has ${ruleCatalog.length} rules, engine has ${allRules.length}`);
}
for (const entry of ruleCatalog) {
  const r = reg[entry.id];
  if (!r) { parity.push(`${entry.id}: not in the engine registry`); continue; }
  if (entry.name !== r.name) parity.push(`${entry.id}: name "${entry.name}" != engine "${r.name}"`);
  if (entry.severity !== r.severity) parity.push(`${entry.id}: severity "${entry.severity}" != engine "${r.severity}"`);
  if (entry.autoFixable !== isFixable(r.id)) parity.push(`${entry.id}: autoFixable ${entry.autoFixable} != engine ${isFixable(r.id)}`);
  if (entry.requiresDatabaseUrl !== (r.requiresDatabaseUrl === true)) {
    parity.push(`${entry.id}: requiresDatabaseUrl ${entry.requiresDatabaseUrl} != engine ${r.requiresDatabaseUrl === true}`);
  }
  if (!entry.shortDesc?.trim()) parity.push(`${entry.id}: empty shortDesc`);
}
for (const r of allRules) {
  if (!ruleCatalog.some((e) => e.id === r.id)) parity.push(`${r.id}: missing from the catalog`);
}
const grouped = ruleCategories.flatMap((c) => c.rules.map((r) => r.id));
if (grouped.length !== ruleCatalog.length) {
  parity.push(`grouping covers ${grouped.length} rules, catalog has ${ruleCatalog.length}`);
}
const dupes = grouped.filter((id, i) => grouped.indexOf(id) !== i);
if (dupes.length) parity.push(`in more than one category: ${dupes.join(', ')}`);
if (autoFixableRuleIds.join(',') !== allRules.filter((r) => isFixable(r.id)).map((r) => r.id).join(',')) {
  parity.push('auto-fix list disagrees with the engine');
}

// ── 3. requiresDatabaseUrl, by behaviour ─────────────────────────────────────

const ctxClaims: string[] = [];
for (const rule of rules) {
  const declared = productionContextRuleIds.includes(rule.id);
  let firesBare = false;
  try {
    const bare = await analyze(rule.badExample, undefined, pgVersions[rule.id] ?? PG_VERSION);
    firesBare = bare.some((v) => v.ruleId === rule.id);
  } catch {
    continue; // parse failures are reported by the example check above
  }
  if (declared && firesBare) ctxClaims.push(`${rule.id}: declared production-context but fires with no connection`);
  if (!declared && !firesBare) ctxClaims.push(`${rule.id}: silent with no connection but not declared production-context`);
}

// ── report ───────────────────────────────────────────────────────────────────

const showAll = process.argv.includes('--all');
const pad = (s: string, n: number) => s.padEnd(n);
const fails = results.filter((r) => !r.fires || !r.silent);

const unexpected = fails.filter((r) => !(r.id in KNOWN_EXCEPTIONS));
const stale = Object.keys(KNOWN_EXCEPTIONS).filter((id) => !fails.some((f) => f.id === id));

console.log(`${pad('RULE', 8)} ${pad('FIRES-ON-BAD', 14)} ${pad('SILENT-ON-GOOD', 15)} NOTE`);
for (const r of results) {
  if (!r.fires || !r.silent || showAll) {
    const known = KNOWN_EXCEPTIONS[r.id];
    const note = known ? `known: ${known}` : r.note;
    console.log(`${pad(r.id, 8)} ${pad(r.fires ? 'PASS' : 'FAIL', 14)} ${pad(r.silent ? 'PASS' : 'FAIL', 15)} ${note}`);
  }
}
console.log(`\nexamples: ${results.length - fails.length}/${results.length} pass, ${fails.length - unexpected.length} known exceptions`);
if (unexpected.length) console.log('  UNEXPECTED:', unexpected.map((f) => f.id).join(', '));
if (stale.length) console.log('  stale exceptions (now passing, remove them):', stale.join(', '));

console.log('\nregistry parity:');
if (parity.length === 0) {
  console.log(`  OK — all ${ruleCatalog.length} entries match the engine on name, severity, auto-fix and requiresDatabaseUrl, grouped into ${ruleCategories.length} categories with no duplicates`);
} else {
  for (const p of parity) console.log('  ' + p);
}

console.log('\nproduction-context flags (verified by behaviour):');
if (ctxClaims.length === 0) {
  console.log(`  OK — ${productionContextRuleIds.length} declared, and exactly those stay silent without --database-url`);
} else {
  for (const c of ctxClaims) console.log('  ' + c);
}

if (parity.length || ctxClaims.length || unexpected.length || stale.length) {
  console.log('\nFAILED');
  process.exit(1);
}
console.log('\nOK');
