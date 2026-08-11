/**
 * Catalog introspection for the simulator.
 *
 * Takes the same snapshot `src/drift/compare.ts` takes of a real database, but
 * over an already-open connection instead of a connection string, so it can be
 * pointed at the ephemeral PGlite instance. The snapshot shape is deliberately
 * identical: the diff itself is then `diffSchemas()` from the drift module,
 * which means "what this migration changed" and "what drifted between two
 * databases" are described in exactly the same vocabulary.
 */

import type { ColumnInfo, IndexInfo, ConstraintInfo } from '../drift/compare.js';

/**
 * The slice of a database client this module needs. PGlite's `query` satisfies
 * it, and so does a `pg` Client, which keeps the module testable without WASM.
 */
export interface QueryableDb {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

/**
 * Structural twin of the drift module's internal `SchemaSnapshot`. Kept as an
 * exported type here because the simulator builds snapshots directly.
 */
export interface SchemaSnapshot {
  tables: Map<string, ColumnInfo[]>;
  indexes: Map<string, IndexInfo>;
  constraints: Map<string, ConstraintInfo>;
  sequences: Set<string>;
}

/**
 * Read the current schema out of the catalog.
 */
export async function snapshotSchema(db: QueryableDb, schemaName = 'public'): Promise<SchemaSnapshot> {
  const cols = await db.query<{
    table_name: string;
    column_name: string;
    data_type: string;
    udt_name: string;
    is_nullable: string;
    column_default: string | null;
  }>(`
    SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = $1
    ORDER BY table_name, ordinal_position
  `, [schemaName]);

  const tables = new Map<string, ColumnInfo[]>();
  for (const row of cols.rows) {
    const existing = tables.get(row.table_name) ?? [];
    existing.push({
      name: row.column_name,
      dataType: row.udt_name || row.data_type,
      nullable: row.is_nullable === 'YES',
      defaultValue: row.column_default,
    });
    tables.set(row.table_name, existing);
  }

  const idx = await db.query<{ indexname: string; tablename: string; indexdef: string }>(`
    SELECT indexname, tablename, indexdef
    FROM pg_indexes
    WHERE schemaname = $1
  `, [schemaName]);

  const indexes = new Map<string, IndexInfo>();
  for (const row of idx.rows) {
    indexes.set(row.indexname, { name: row.indexname, table: row.tablename, definition: row.indexdef });
  }

  const cons = await db.query<{
    constraint_name: string;
    table_name: string;
    constraint_type: string;
    check_clause: string | null;
  }>(`
    SELECT tc.constraint_name, tc.table_name, tc.constraint_type, cc.check_clause
    FROM information_schema.table_constraints tc
    LEFT JOIN information_schema.check_constraints cc
      ON tc.constraint_name = cc.constraint_name
      AND tc.constraint_schema = cc.constraint_schema
    WHERE tc.table_schema = $1
  `, [schemaName]);

  const constraints = new Map<string, ConstraintInfo>();
  for (const row of cons.rows) {
    constraints.set(row.constraint_name, {
      name: row.constraint_name,
      table: row.table_name,
      type: row.constraint_type,
      definition: row.check_clause ?? row.constraint_type,
    });
  }

  const seq = await db.query<{ sequence_name: string }>(`
    SELECT sequence_name
    FROM information_schema.sequences
    WHERE sequence_schema = $1
  `, [schemaName]);

  return {
    tables,
    indexes,
    constraints,
    sequences: new Set(seq.rows.map(r => r.sequence_name)),
  };
}

export interface EngineVersion {
  /** PGlite package version parsed out of `version()`, or 'unknown'. */
  pglite: string;
  /** Server version as reported, e.g. '18.3'. */
  serverVersion: string;
  /** Server major version, e.g. 18. 0 when it cannot be parsed. */
  serverMajor: number;
  /** The full, verbatim `SELECT version()` string. */
  versionString: string;
}

/**
 * Ask the engine what it actually is.
 *
 * This is not decoration. Which PostgreSQL grammar a migration is checked
 * against is a property of the PGlite build, not of anything MigrationPilot
 * chooses, and it changes when PGlite is upgraded. Reporting the parsed value
 * rather than a hardcoded one is the only way that claim stays true.
 */
export async function detectEngineVersion(db: QueryableDb): Promise<EngineVersion> {
  const result = await db.query<{ version: string }>('SELECT version()');
  const versionString = result.rows[0]?.version ?? '';

  const server = /PostgreSQL (\d+(?:\.\d+)*)/.exec(versionString);
  const pglite = /PGlite ([^)\s]+)/.exec(versionString);
  const serverVersion = server?.[1] ?? 'unknown';
  const major = /^(\d+)/.exec(serverVersion);

  return {
    pglite: pglite?.[1] ?? 'unknown',
    serverVersion,
    serverMajor: major ? Number(major[1]) : 0,
    versionString,
  };
}
