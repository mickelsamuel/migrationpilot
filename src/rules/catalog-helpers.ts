/**
 * Shared helpers for the catalog-aware and extension-aware rules (MP100-MP112).
 *
 * Every function here is safe to call without production context — the lookups
 * return undefined and the rules that use them stay silent, which is how these
 * rules behave on every run without --database-url.
 */

import type { RuleContext } from './engine.js';
import type { TableExtensionInfo, TableFacts } from '../production/catalog.js';
import type { TableStats } from '../scoring/score.js';

/** Formats a byte count the same way MP014 does. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(1)} TB`;
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(1)} KB`;
  return `${bytes} B`;
}

/**
 * Formats a memory setting the way PostgreSQL itself prints it — binary units,
 * no decimal point when the value divides evenly. 67108864 renders as "64MB",
 * which is what SHOW maintenance_work_mem says and what the user wrote in
 * postgresql.conf.
 */
export function formatMemorySetting(bytes: number): string {
  const units: Array<[number, string]> = [
    [1024 ** 3, 'GB'],
    [1024 ** 2, 'MB'],
    [1024, 'kB'],
  ];
  for (const [scale, suffix] of units) {
    if (bytes >= scale) {
      const value = bytes / scale;
      return Number.isInteger(value) ? `${value}${suffix}` : `${value.toFixed(1)}${suffix}`;
    }
  }
  return `${Math.round(bytes)}B`;
}

/** Formats a duration in seconds as a coarse, human-readable string. */
export function formatDuration(seconds: number): string {
  if (seconds < 90) return `${Math.round(seconds)}s`;
  if (seconds < 5400) return `${Math.round(seconds / 60)} min`;
  if (seconds < 172_800) return `${(seconds / 3600).toFixed(1)} h`;
  return `${(seconds / 86_400).toFixed(1)} days`;
}

/** The table a DML statement targets, if this is DML. */
export function dmlTargetTable(stmt: Record<string, unknown>): string | null {
  for (const key of ['UpdateStmt', 'DeleteStmt', 'InsertStmt']) {
    if (key in stmt) {
      const node = stmt[key] as { relation?: { relname?: string } };
      return node.relation?.relname ?? null;
    }
  }
  return null;
}

/** Table stats for any table, not just the one the engine resolved. */
export function lookupTableStats(ctx: RuleContext, tableName: string): TableStats | undefined {
  return ctx.production?.tableStats.get(tableName);
}

/** Table facts for any table, not just the one the engine resolved. */
export function lookupTableFacts(ctx: RuleContext, tableName: string): TableFacts | undefined {
  return ctx.production?.catalog?.tableFacts.get(tableName);
}

/** Extension info for any table, not just the one the engine resolved. */
export function lookupTableExtensions(
  ctx: RuleContext,
  tableName: string
): TableExtensionInfo | undefined {
  return ctx.production?.catalog?.extensionTables.get(tableName);
}

/**
 * Full-rewrite operations: PostgreSQL writes a complete new copy of the table
 * before dropping the old one, so peak disk usage is roughly double and the whole
 * copy goes through WAL.
 */
export interface RewriteOp {
  /** Human-readable name of the operation, e.g. "VACUUM FULL". */
  label: string;
  /**
   * Table the rewrite targets, read straight from the statement. Rules resolve
   * stats through this rather than ctx.tableStats, because the engine's target
   * extraction does not cover VACUUM and CLUSTER.
   */
  tableName?: string;
}

export function classifyRewrite(stmt: Record<string, unknown>, pgVersion: number): RewriteOp | null {
  if ('VacuumStmt' in stmt) {
    const vacuum = stmt.VacuumStmt as {
      options?: Array<{ DefElem?: { defname?: string } }>;
      rels?: Array<{ VacuumRelation?: { relation?: { relname?: string } } }>;
    };
    const isFull = vacuum.options?.some(opt => opt.DefElem?.defname === 'full');
    if (!isFull) return null;
    const tableName = vacuum.rels?.[0]?.VacuumRelation?.relation?.relname;
    return { label: 'VACUUM FULL', ...(tableName ? { tableName } : {}) };
  }

  if ('ClusterStmt' in stmt) {
    const cluster = stmt.ClusterStmt as { relation?: { relname?: string } };
    return { label: 'CLUSTER', ...(cluster.relation?.relname ? { tableName: cluster.relation.relname } : {}) };
  }

  if ('AlterTableStmt' in stmt) {
    const alter = stmt.AlterTableStmt as {
      relation?: { relname?: string };
      cmds?: Array<{ AlterTableCmd?: { subtype?: string; def?: Record<string, unknown> } }>;
    };
    const tableName = alter.relation?.relname;
    const named = (label: string): RewriteOp => ({ label, ...(tableName ? { tableName } : {}) });

    for (const cmd of alter.cmds ?? []) {
      const sub = cmd.AlterTableCmd?.subtype;
      if (sub === 'AT_AlterColumnType') return named('ALTER COLUMN ... TYPE');
      if (sub === 'AT_SetLogged') return named('ALTER TABLE ... SET LOGGED');
      if (sub === 'AT_SetUnLogged') return named('ALTER TABLE ... SET UNLOGGED');
      if (sub === 'AT_AddColumn' && addColumnRewrites(cmd.AlterTableCmd?.def, pgVersion)) {
        return named('ADD COLUMN with a volatile default');
      }
    }
  }

  return null;
}

const VOLATILE_FUNCTIONS = new Set([
  'now', 'random', 'nextval', 'clock_timestamp', 'timeofday',
  'gen_random_uuid', 'uuid_generate_v4', 'statement_timestamp',
]);

/**
 * ADD COLUMN rewrites the table when the default is volatile (any version), or
 * whenever a default is present before PG11 stored non-volatile defaults in the
 * catalog. Mirrors the classification in locks/classify.ts.
 */
function addColumnRewrites(def: Record<string, unknown> | undefined, pgVersion: number): boolean {
  const colDef = def?.ColumnDef as
    | { constraints?: Array<{ Constraint?: { contype?: string; raw_expr?: Record<string, unknown> } }> }
    | undefined;
  if (!colDef?.constraints) return false;

  const defaultConstraint = colDef.constraints.find(c => c.Constraint?.contype === 'CONSTR_DEFAULT');
  if (!defaultConstraint) return false;
  if (pgVersion < 11) return true;

  return containsVolatileCall(defaultConstraint.Constraint?.raw_expr);
}

function containsVolatileCall(node: unknown): boolean {
  if (!node || typeof node !== 'object') return false;

  const record = node as Record<string, unknown>;
  const funcCall = record.FuncCall as
    | { funcname?: Array<{ String?: { sval?: string } }> }
    | undefined;
  if (funcCall?.funcname) {
    const name = funcCall.funcname[funcCall.funcname.length - 1]?.String?.sval;
    if (name && VOLATILE_FUNCTIONS.has(name.toLowerCase())) return true;
  }

  for (const value of Object.values(record)) {
    if (Array.isArray(value)) {
      if (value.some(containsVolatileCall)) return true;
    } else if (containsVolatileCall(value)) {
      return true;
    }
  }
  return false;
}

/**
 * Key columns of a CREATE INDEX statement, in index order.
 *
 * Returns null when any key is an expression rather than a plain column — the
 * rules that compare against catalog indexes stay silent in that case rather
 * than guess at how PostgreSQL would render the expression.
 */
export function indexKeyColumns(idx: {
  indexParams?: Array<{ IndexElem?: { name?: string; expr?: unknown } }>;
}): string[] | null {
  if (!idx.indexParams || idx.indexParams.length === 0) return null;

  const columns: string[] = [];
  for (const param of idx.indexParams) {
    const name = param.IndexElem?.name;
    if (!name) return null;
    columns.push(name);
  }
  return columns;
}

/** Normalizes an index key expression for comparison against catalog output. */
export function normalizeKey(key: string): string {
  return key.trim().replace(/^"(.*)"$/, '$1').toLowerCase();
}

/** Writes per second for a table, when the stats window is known. */
export function writesPerSecond(facts: TableFacts): number | undefined {
  if (!facts.windowSeconds || facts.windowSeconds <= 0) return undefined;
  return totalWrites(facts) / facts.windowSeconds;
}

/** Total row-level writes recorded since the stats window started. */
export function totalWrites(facts: TableFacts): number {
  return facts.inserts + facts.updates + facts.deletes;
}
