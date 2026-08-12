/**
 * Extended catalog reads — index definitions, write traffic, partitioning,
 * replication state, server settings, and extension-managed tables
 * (TimescaleDB, Citus, pg_partman).
 *
 * This is the data behind the catalog-aware rules (MP100-MP108, MP110-MP112).
 * Everything here is optional: each query is independently guarded so a missing
 * view, a missing extension, or a permission error degrades that one field to
 * undefined instead of failing the whole analysis. Rules that depend on a field
 * stay silent when it is absent, which is what happens on every run without
 * --database-url.
 *
 * SAFETY: identical contract to context.ts — SELECT-only against pg_catalog,
 * pg_stat_* views, and the extensions' own metadata tables. Never reads user data.
 */

import type pg from 'pg';

/** One existing index on a target table, as PostgreSQL describes it. */
export interface ExistingIndex {
  tableName: string;
  indexName: string;
  /** Access method name: btree, hash, gin, gist, brin, hnsw, ivfflat, ... */
  method: string;
  isUnique: boolean;
  isPrimary: boolean;
  /**
   * True when a constraint owns this index (pg_constraint.conindid points at
   * it), which is what makes `DROP INDEX` fail with "cannot drop index ...
   * because constraint ... requires it".
   *
   * This is not the same thing as `isUnique`. A plain `CREATE UNIQUE INDEX`
   * is unique and drops fine; only an index adopted by a UNIQUE or PRIMARY KEY
   * constraint refuses. Verified on PostgreSQL 18.3.
   */
  isConstraintBacked: boolean;
  /** True when the index has a WHERE clause. */
  isPartial: boolean;
  /**
   * Key column expressions in index order, as rendered by pg_get_indexdef().
   * A plain column is just its name; an expression index renders the expression.
   * INCLUDE columns are excluded — only key columns appear here.
   */
  keyColumns: string[];
  definition: string;
}

/** Write traffic and shape for a target table. */
export interface TableFacts {
  tableName: string;
  /** pg_class.relkind — 'r' ordinary table, 'p' partitioned table. */
  relKind: string;
  /** Number of direct children (partitions). 0 for a non-partitioned table. */
  partitionCount: number;
  /** Cumulative counters from pg_stat_user_tables. */
  inserts: number;
  updates: number;
  deletes: number;
  liveTuples: number;
  /**
   * Seconds the cumulative counters cover, derived from
   * pg_stat_database.stats_reset. Undefined when the server reports no reset
   * time (never reset, or a build that does not track it), in which case the
   * counters are totals over an unknown window and must not be turned into rates.
   */
  windowSeconds?: number;
}

/** What an extension knows about a target table. */
export interface TableExtensionInfo {
  tableName: string;
  /** TimescaleDB hypertable. */
  isHypertable: boolean;
  chunkCount?: number;
  /** True when the hypertable has compression / columnstore enabled. */
  compressionEnabled?: boolean;
  /** The hypertable's primary time dimension column, when the server reports it. */
  timeColumn?: string;
  /** Citus distributed table. */
  isCitusDistributed: boolean;
  citusDistributionColumn?: string;
  citusShardCount?: number;
  /** pg_partman-managed partition parent. */
  isPartmanParent: boolean;
  partmanControlColumn?: string;
  partmanInterval?: string;
  partmanPremake?: number;
  partmanRetention?: string;
}

/** Streaming replication state of the cluster. */
export interface ReplicationInfo {
  /** Connected standbys visible in pg_stat_replication. */
  replicaCount: number;
  /** Replication slots defined on this server. */
  slotCount: number;
  /**
   * Largest replay lag in bytes across connected standbys. Undefined when the
   * connected role cannot read the LSN columns (needs pg_monitor / pg_read_all_stats).
   */
  maxLagBytes?: number;
}

/** Disk headroom, when the server can report it. */
export interface DiskInfo {
  /**
   * Free bytes on the default tablespace.
   *
   * Core PostgreSQL has no function for this (pg_tablespace_avail() has been
   * proposed but is not in a released version as of PG18), so this is normally
   * undefined. It is populated when the server defines a
   * pg_tablespace_avail(name) -> bigint function — MigrationPilot feature-detects
   * it so operators who add their own can get headroom numbers in MP102.
   */
  availableBytes?: number;
}

/** Server settings that change how long an operation takes. */
export interface ServerSettings {
  maintenanceWorkMemBytes?: number;
  maxParallelMaintenanceWorkers?: number;
}

/** Everything the catalog-aware rules read beyond the core table stats. */
export interface CatalogContext {
  /** Existing indexes, keyed by table name. */
  indexes: Map<string, ExistingIndex[]>;
  /** Write traffic and partition shape, keyed by table name. */
  tableFacts: Map<string, TableFacts>;
  /** Extension-managed table info, keyed by table name. Only tables an extension owns appear. */
  extensionTables: Map<string, TableExtensionInfo>;
  /** Names of installed extensions (pg_extension.extname). */
  installedExtensions: Set<string>;
  replication?: ReplicationInfo;
  disk?: DiskInfo;
  settings?: ServerSettings;
}

/** An empty catalog — what rules see when no database is reachable. */
export function emptyCatalogContext(): CatalogContext {
  return {
    indexes: new Map(),
    tableFacts: new Map(),
    extensionTables: new Map(),
    installedExtensions: new Set(),
  };
}

/**
 * Reads the extended catalog for the given tables.
 *
 * Never throws: every query is guarded, so a partially-readable server still
 * returns whatever it could answer.
 */
export async function fetchCatalogContext(
  pool: pg.Pool,
  tableNames: string[]
): Promise<CatalogContext> {
  if (tableNames.length === 0) return emptyCatalogContext();

  const [indexes, tableFacts, installedExtensions, replication, disk, settings] = await Promise.all([
    guard(() => queryIndexes(pool, tableNames), new Map<string, ExistingIndex[]>()),
    guard(() => queryTableFacts(pool, tableNames), new Map<string, TableFacts>()),
    guard(() => queryInstalledExtensions(pool), new Set<string>()),
    guard<ReplicationInfo | undefined>(() => queryReplication(pool), undefined),
    guard<DiskInfo | undefined>(() => queryDisk(pool), undefined),
    guard<ServerSettings | undefined>(() => querySettings(pool), undefined),
  ]);

  const extensionTables = await guard(
    () => queryExtensionTables(pool, tableNames, installedExtensions),
    new Map<string, TableExtensionInfo>()
  );

  return { indexes, tableFacts, extensionTables, installedExtensions, replication, disk, settings };
}

/** Runs a query, falling back to a default value on any failure. */
async function guard<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

/**
 * Index definitions for the target tables.
 *
 * pg_get_indexdef(indexrelid, colno, pretty) renders one key column at a time,
 * which gives ordered key columns without parsing the full CREATE INDEX text.
 * indnkeyatts (PG11+) excludes INCLUDE columns.
 */
async function queryIndexes(
  pool: pg.Pool,
  tableNames: string[]
): Promise<Map<string, ExistingIndex[]>> {
  const result = await pool.query<{
    table_name: string;
    index_name: string;
    method: string;
    is_unique: boolean;
    is_primary: boolean;
    is_constraint_backed: boolean;
    is_partial: boolean;
    key_columns: string[];
    definition: string;
  }>(`
    SELECT
      t.relname AS table_name,
      i.relname AS index_name,
      am.amname AS method,
      ix.indisunique AS is_unique,
      ix.indisprimary AS is_primary,
      EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = ix.indexrelid) AS is_constraint_backed,
      (ix.indpred IS NOT NULL) AS is_partial,
      ARRAY(
        SELECT pg_get_indexdef(ix.indexrelid, k, true)
        FROM generate_series(1, ix.indnkeyatts) AS k
      ) AS key_columns,
      pg_get_indexdef(ix.indexrelid) AS definition
    FROM pg_index ix
    JOIN pg_class i ON i.oid = ix.indexrelid
    JOIN pg_class t ON t.oid = ix.indrelid
    JOIN pg_am am ON am.oid = i.relam
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE t.relname = ANY($1)
      AND n.nspname NOT IN ('pg_catalog', 'information_schema')
    ORDER BY t.relname, i.relname
  `, [tableNames]);

  const byTable = new Map<string, ExistingIndex[]>();
  for (const row of result.rows) {
    const entry: ExistingIndex = {
      tableName: row.table_name,
      indexName: row.index_name,
      method: row.method,
      isUnique: row.is_unique,
      isPrimary: row.is_primary,
      isConstraintBacked: row.is_constraint_backed,
      isPartial: row.is_partial,
      keyColumns: (row.key_columns ?? []).map(c => c.trim()),
      definition: row.definition,
    };
    const list = byTable.get(row.table_name);
    if (list) list.push(entry);
    else byTable.set(row.table_name, [entry]);
  }
  return byTable;
}

/**
 * Write counters and partition shape for the target tables.
 *
 * pg_stat_user_tables has no per-table stats_reset column, so the window comes
 * from pg_stat_database. It is a lower bound on the real window (a table created
 * after the reset has been counting for less time), which is why rates built on
 * it are reported as approximate.
 */
async function queryTableFacts(
  pool: pg.Pool,
  tableNames: string[]
): Promise<Map<string, TableFacts>> {
  const result = await pool.query<{
    table_name: string;
    relkind: string;
    partition_count: string;
    inserts: string;
    updates: string;
    deletes: string;
    live_tuples: string;
    window_seconds: string | null;
  }>(`
    SELECT
      c.relname AS table_name,
      c.relkind::text AS relkind,
      (SELECT count(*) FROM pg_inherits h WHERE h.inhparent = c.oid) AS partition_count,
      COALESCE(s.n_tup_ins, 0)::bigint AS inserts,
      COALESCE(s.n_tup_upd, 0)::bigint AS updates,
      COALESCE(s.n_tup_del, 0)::bigint AS deletes,
      COALESCE(s.n_live_tup, 0)::bigint AS live_tuples,
      (
        SELECT EXTRACT(EPOCH FROM (now() - d.stats_reset))::bigint
        FROM pg_stat_database d
        WHERE d.datname = current_database()
      ) AS window_seconds
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
    WHERE c.relname = ANY($1)
      AND n.nspname NOT IN ('pg_catalog', 'information_schema')
      AND c.relkind IN ('r', 'p')
  `, [tableNames]);

  const facts = new Map<string, TableFacts>();
  for (const row of result.rows) {
    const windowSeconds = row.window_seconds === null ? undefined : parseInt(row.window_seconds, 10);
    facts.set(row.table_name, {
      tableName: row.table_name,
      relKind: row.relkind,
      partitionCount: parseInt(row.partition_count, 10) || 0,
      inserts: parseInt(row.inserts, 10) || 0,
      updates: parseInt(row.updates, 10) || 0,
      deletes: parseInt(row.deletes, 10) || 0,
      liveTuples: parseInt(row.live_tuples, 10) || 0,
      ...(windowSeconds !== undefined && Number.isFinite(windowSeconds) && windowSeconds > 0
        ? { windowSeconds }
        : {}),
    });
  }
  return facts;
}

/** Installed extension names. */
async function queryInstalledExtensions(pool: pg.Pool): Promise<Set<string>> {
  const result = await pool.query<{ extname: string }>(`SELECT extname FROM pg_extension`);
  return new Set(result.rows.map(r => r.extname));
}

/** Streaming replication state. */
async function queryReplication(pool: pg.Pool): Promise<ReplicationInfo | undefined> {
  const result = await pool.query<{ replica_count: number; slot_count: number }>(`
    SELECT
      (SELECT count(*) FROM pg_stat_replication)::int AS replica_count,
      (SELECT count(*) FROM pg_replication_slots)::int AS slot_count
  `);
  const row = result.rows[0];
  if (!row) return undefined;

  const info: ReplicationInfo = {
    replicaCount: Number(row.replica_count) || 0,
    slotCount: Number(row.slot_count) || 0,
  };

  if (info.replicaCount > 0) {
    // Needs pg_monitor / pg_read_all_stats to see replay_lsn; guarded separately
    // so a restricted role still gets the replica count.
    const lag = await guard<number | undefined>(async () => {
      const r = await pool.query<{ max_lag_bytes: string | null }>(`
        SELECT max(pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn))::bigint AS max_lag_bytes
        FROM pg_stat_replication
        WHERE replay_lsn IS NOT NULL
      `);
      const raw = r.rows[0]?.max_lag_bytes;
      if (raw === null || raw === undefined) return undefined;
      const parsed = parseInt(raw, 10);
      return Number.isFinite(parsed) ? parsed : undefined;
    }, undefined);
    if (lag !== undefined) info.maxLagBytes = lag;
  }

  return info;
}

/**
 * Free space on the default tablespace, if this server can answer.
 *
 * Core PostgreSQL cannot, so this returns an empty DiskInfo on almost every
 * server. MP102 reports sizes only in that case.
 */
async function queryDisk(pool: pg.Pool): Promise<DiskInfo | undefined> {
  const probe = await pool.query<{ present: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE p.proname = 'pg_tablespace_avail'
        AND p.pronargs = 1
        AND n.nspname IN ('pg_catalog', 'public')
    ) AS present
  `);
  if (!probe.rows[0]?.present) return {};

  const result = await pool.query<{ available_bytes: string | null }>(
    `SELECT pg_tablespace_avail('pg_default')::bigint AS available_bytes`
  );
  const raw = result.rows[0]?.available_bytes;
  if (raw === null || raw === undefined) return {};
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? { availableBytes: parsed } : {};
}

/** Settings that affect index build and maintenance duration. */
async function querySettings(pool: pg.Pool): Promise<ServerSettings | undefined> {
  const result = await pool.query<{ name: string; setting: string; unit: string | null }>(`
    SELECT name, setting, unit
    FROM pg_settings
    WHERE name IN ('maintenance_work_mem', 'max_parallel_maintenance_workers')
  `);

  const settings: ServerSettings = {};
  for (const row of result.rows) {
    if (row.name === 'maintenance_work_mem') {
      const bytes = settingToBytes(row.setting, row.unit);
      if (bytes !== undefined) settings.maintenanceWorkMemBytes = bytes;
    } else if (row.name === 'max_parallel_maintenance_workers') {
      const workers = parseInt(row.setting, 10);
      if (Number.isFinite(workers)) settings.maxParallelMaintenanceWorkers = workers;
    }
  }
  return settings;
}

/**
 * Converts a pg_settings value + unit pair to bytes.
 * Units look like 'kB', '8kB', 'MB', 'B' — a multiplier followed by a size.
 */
export function settingToBytes(setting: string, unit: string | null): number | undefined {
  const value = parseFloat(setting);
  if (!Number.isFinite(value)) return undefined;
  if (!unit) return value;

  const match = /^(\d*)\s*([kMGT]?B)$/.exec(unit.trim());
  if (!match) return undefined;

  const multiplier = match[1] ? parseInt(match[1], 10) : 1;
  const scales: Record<string, number> = {
    B: 1,
    kB: 1024,
    MB: 1024 ** 2,
    GB: 1024 ** 3,
    TB: 1024 ** 4,
  };
  const scale = scales[match[2] ?? 'B'];
  if (scale === undefined) return undefined;
  return value * multiplier * scale;
}

/**
 * Which of the target tables are managed by TimescaleDB, Citus, or pg_partman.
 *
 * Each extension is probed only when it is installed, and each probe is guarded
 * on its own: an older extension version with different catalog columns costs us
 * that one extension's data, not the rest.
 */
async function queryExtensionTables(
  pool: pg.Pool,
  tableNames: string[],
  installedExtensions: Set<string>
): Promise<Map<string, TableExtensionInfo>> {
  const info = new Map<string, TableExtensionInfo>();

  const entry = (tableName: string): TableExtensionInfo => {
    const existing = info.get(tableName);
    if (existing) return existing;
    const created: TableExtensionInfo = {
      tableName,
      isHypertable: false,
      isCitusDistributed: false,
      isPartmanParent: false,
    };
    info.set(tableName, created);
    return created;
  };

  if (installedExtensions.has('timescaledb')) {
    await guard(async () => {
      for (const row of await queryHypertables(pool, tableNames)) {
        const target = entry(row.tableName);
        target.isHypertable = true;
        if (row.chunkCount !== undefined) target.chunkCount = row.chunkCount;
        if (row.compressionEnabled !== undefined) target.compressionEnabled = row.compressionEnabled;
        if (row.timeColumn !== undefined) target.timeColumn = row.timeColumn;
      }
      return true;
    }, false);
  }

  if (installedExtensions.has('citus')) {
    await guard(async () => {
      for (const row of await queryCitusTables(pool, tableNames)) {
        const target = entry(row.tableName);
        target.isCitusDistributed = row.isDistributed;
        if (row.distributionColumn) target.citusDistributionColumn = row.distributionColumn;
        if (row.shardCount !== undefined) target.citusShardCount = row.shardCount;
      }
      return true;
    }, false);
  }

  if (installedExtensions.has('pg_partman')) {
    await guard(async () => {
      const schema = await partmanSchema(pool);
      if (!schema) return false;

      const result = await pool.query<{
        parent_table: string;
        control: string | null;
        partition_interval: string | null;
        premake: number | null;
        retention: string | null;
      }>(`
        SELECT parent_table, control, partition_interval, premake, retention
        FROM ${quoteIdent(schema)}.part_config
      `);

      for (const row of result.rows) {
        const bare = bareTableName(row.parent_table);
        if (!tableNames.includes(bare)) continue;
        const target = entry(bare);
        target.isPartmanParent = true;
        if (row.control) target.partmanControlColumn = row.control;
        if (row.partition_interval) target.partmanInterval = row.partition_interval;
        if (row.premake !== null) target.partmanPremake = Number(row.premake);
        if (row.retention) target.partmanRetention = row.retention;
      }
      return true;
    }, false);
  }

  return info;
}

interface CitusTableRow {
  tableName: string;
  isDistributed: boolean;
  distributionColumn?: string;
  shardCount?: number;
}

/**
 * Citus table metadata.
 *
 * Prefers the citus_tables view (Citus 10+), which names the distribution column
 * and the shard count directly. Falls back to pg_dist_partition + pg_dist_shard,
 * where partmethod tells distributed ('h' hash, 'r' range, 'a' append) from
 * reference ('n') tables but the distribution column is only available as a
 * serialized Var.
 */
async function queryCitusTables(pool: pg.Pool, tableNames: string[]): Promise<CitusTableRow[]> {
  try {
    const result = await pool.query<{
      table_name: string;
      citus_table_type: string | null;
      distribution_column: string | null;
      shard_count: number | null;
    }>(`
      SELECT
        c.relname AS table_name,
        ct.citus_table_type,
        ct.distribution_column,
        ct.shard_count::int AS shard_count
      FROM citus_tables ct
      JOIN pg_class c ON c.oid = ct.table_name::oid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relname = ANY($1)
        AND n.nspname NOT IN ('pg_catalog', 'information_schema')
    `, [tableNames]);

    return result.rows.map(row => ({
      tableName: row.table_name,
      isDistributed: row.citus_table_type === 'distributed',
      ...(row.distribution_column ? { distributionColumn: row.distribution_column } : {}),
      ...(row.shard_count !== null ? { shardCount: Number(row.shard_count) } : {}),
    }));
  } catch {
    const result = await pool.query<{
      table_name: string;
      partmethod: string;
      shard_count: number | null;
    }>(`
      SELECT
        c.relname AS table_name,
        p.partmethod::text AS partmethod,
        (SELECT count(*)::int FROM pg_dist_shard s WHERE s.logicalrelid = p.logicalrelid) AS shard_count
      FROM pg_dist_partition p
      JOIN pg_class c ON c.oid = p.logicalrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relname = ANY($1)
        AND n.nspname NOT IN ('pg_catalog', 'information_schema')
    `, [tableNames]);

    return result.rows.map(row => ({
      tableName: row.table_name,
      isDistributed: row.partmethod !== 'n',
      ...(row.shard_count !== null ? { shardCount: Number(row.shard_count) } : {}),
    }));
  }
}

interface HypertableRow {
  tableName: string;
  chunkCount?: number;
  compressionEnabled?: boolean;
  timeColumn?: string;
}

/**
 * Hypertable metadata.
 *
 * Prefers timescaledb_information.hypertables (documented, carries chunk count,
 * compression flag, and the primary time dimension). Falls back to the internal
 * _timescaledb_catalog.hypertable table, which has been stable across 2.x, when
 * the information view has different columns on this version.
 */
async function queryHypertables(pool: pg.Pool, tableNames: string[]): Promise<HypertableRow[]> {
  try {
    const result = await pool.query<{
      table_name: string;
      num_chunks: string | null;
      compression_enabled: boolean | null;
      primary_dimension: string | null;
    }>(`
      SELECT
        hypertable_name AS table_name,
        num_chunks,
        compression_enabled,
        primary_dimension
      FROM timescaledb_information.hypertables
      WHERE hypertable_name = ANY($1)
    `, [tableNames]);

    return result.rows.map(row => ({
      tableName: row.table_name,
      ...(row.num_chunks !== null ? { chunkCount: parseInt(row.num_chunks, 10) || 0 } : {}),
      ...(row.compression_enabled !== null ? { compressionEnabled: row.compression_enabled } : {}),
      ...(row.primary_dimension ? { timeColumn: row.primary_dimension } : {}),
    }));
  } catch {
    const result = await pool.query<{ table_name: string }>(`
      SELECT table_name
      FROM _timescaledb_catalog.hypertable
      WHERE table_name = ANY($1)
    `, [tableNames]);
    return result.rows.map(row => ({ tableName: row.table_name }));
  }
}

/** The schema pg_partman was installed into. */
async function partmanSchema(pool: pg.Pool): Promise<string | null> {
  const result = await pool.query<{ nspname: string }>(`
    SELECT n.nspname
    FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'pg_partman'
  `);
  return result.rows[0]?.nspname ?? null;
}

/** part_config.parent_table is schema-qualified; rules match on the bare name. */
export function bareTableName(qualified: string): string {
  const parts = qualified.split('.');
  const last = parts[parts.length - 1] ?? qualified;
  return last.replace(/^"|"$/g, '');
}

/** Quotes an identifier for interpolation into a query. */
function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** Lookup helper mirroring getTableStats() in context.ts. */
export function getExistingIndexes(
  catalog: CatalogContext | undefined,
  tableName: string
): ExistingIndex[] | undefined {
  const list = catalog?.indexes.get(tableName);
  return list && list.length > 0 ? list : undefined;
}

/** Lookup helper mirroring getTableStats() in context.ts. */
export function getTableFacts(
  catalog: CatalogContext | undefined,
  tableName: string
): TableFacts | undefined {
  return catalog?.tableFacts.get(tableName);
}

/** Lookup helper mirroring getTableStats() in context.ts. */
export function getTableExtensions(
  catalog: CatalogContext | undefined,
  tableName: string
): TableExtensionInfo | undefined {
  return catalog?.extensionTables.get(tableName);
}
