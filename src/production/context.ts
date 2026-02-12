/**
 * Production context engine — queries pg_class, pg_stat_statements,
 * and pg_stat_activity for real-time table statistics and query patterns.
 *
 * This is the PAID tier differentiator. Free tier only gets static DDL analysis.
 * Production context feeds into calculateRisk() for accurate risk scoring.
 *
 * SAFETY: Only reads from pg_catalog and pg_stat views. Never reads user data.
 * Never runs DDL. All queries are SELECT-only against system catalogs.
 */

import pg from 'pg';

import type { TableStats, AffectedQuery } from '../scoring/score.js';

const { Pool } = pg;

export interface ProductionContext {
  tableStats: Map<string, TableStats>;
  affectedQueries: Map<string, AffectedQuery[]>;
  activeConnections: Map<string, number>;
}

export interface ConnectionConfig {
  connectionString: string;
  /** Connection timeout in ms (default: 5000) */
  connectTimeout?: number;
  /** Query timeout in ms (default: 10000) */
  queryTimeout?: number;
  /** SSL mode */
  ssl?: boolean | { rejectUnauthorized: boolean };
}

/**
 * Fetches production context for the given table names.
 * Connects to the database, runs read-only catalog queries, and disconnects.
 */
export async function fetchProductionContext(
  config: ConnectionConfig,
  tableNames: string[]
): Promise<ProductionContext> {
  if (tableNames.length === 0) {
    return {
      tableStats: new Map(),
      affectedQueries: new Map(),
      activeConnections: new Map(),
    };
  }

  const pool = new Pool({
    connectionString: config.connectionString,
    connectionTimeoutMillis: config.connectTimeout ?? 5000,
    statement_timeout: config.queryTimeout ?? 10000,
    max: 1,
    ssl: config.ssl,
  });

  try {
    // Run all queries concurrently
    const [tableStats, affectedQueries, activeConnections] = await Promise.all([
      queryTableStats(pool, tableNames),
      queryAffectedQueries(pool, tableNames),
      queryActiveConnections(pool, tableNames),
    ]);

    return { tableStats, affectedQueries, activeConnections };
  } finally {
    await pool.end();
  }
}

/**
 * Query pg_class + pg_stat_user_tables for table size info.
 * Returns row count, total bytes (including indexes + toast), and index count.
 */
async function queryTableStats(
  pool: pg.Pool,
  tableNames: string[]
): Promise<Map<string, TableStats>> {
  const result = await pool.query<{
    tablename: string;
    row_count: string;
    total_bytes: string;
    index_count: string;
  }>(`
    SELECT
      c.relname AS tablename,
      c.reltuples::bigint AS row_count,
      pg_total_relation_size(c.oid) AS total_bytes,
      (SELECT count(*) FROM pg_index i WHERE i.indrelid = c.oid) AS index_count
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = ANY($1)
      AND n.nspname NOT IN ('pg_catalog', 'information_schema')
      AND c.relkind IN ('r', 'p')
  `, [tableNames]);

  const stats = new Map<string, TableStats>();
  for (const row of result.rows) {
    stats.set(row.tablename, {
      tableName: row.tablename,
      rowCount: parseInt(row.row_count, 10) || 0,
      totalBytes: parseInt(row.total_bytes, 10) || 0,
      indexCount: parseInt(row.index_count, 10) || 0,
    });
  }
  return stats;
}

/**
 * Query pg_stat_statements for queries that reference the target tables.
 * Matches normalized queries containing the table name.
 * Returns top queries by call frequency.
 */
async function queryAffectedQueries(
  pool: pg.Pool,
  tableNames: string[]
): Promise<Map<string, AffectedQuery[]>> {
  // Check if pg_stat_statements extension is available
  const extCheck = await pool.query(
    `SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements' LIMIT 1`
  );

  if (extCheck.rows.length === 0) {
    return new Map();
  }

  const queries = new Map<string, AffectedQuery[]>();

  for (const tableName of tableNames) {
    const result = await pool.query<{
      queryid: string;
      query: string;
      calls: string;
      mean_exec_time: string;
    }>(`
      SELECT
        queryid::text,
        query,
        calls::bigint,
        mean_exec_time
      FROM pg_stat_statements
      WHERE query ~* $1
        AND query NOT LIKE '%pg_stat%'
        AND query NOT LIKE '%pg_class%'
      ORDER BY calls DESC
      LIMIT 20
    `, [`\\m${tableName}\\M`]);

    if (result.rows.length > 0) {
      queries.set(tableName, result.rows.map(row => ({
        queryId: row.queryid,
        normalizedQuery: row.query,
        calls: parseInt(row.calls, 10) || 0,
        meanExecTime: parseFloat(row.mean_exec_time) || 0,
      })));
    }
  }

  return queries;
}

/**
 * Query pg_stat_activity for active connections running queries against target tables.
 * This helps detect if a migration would affect currently-running operations.
 */
async function queryActiveConnections(
  pool: pg.Pool,
  tableNames: string[]
): Promise<Map<string, number>> {
  const connections = new Map<string, number>();

  for (const tableName of tableNames) {
    const result = await pool.query<{ count: string }>(`
      SELECT count(*) AS count
      FROM pg_stat_activity
      WHERE state = 'active'
        AND query ~* $1
        AND pid != pg_backend_pid()
    `, [`\\m${tableName}\\M`]);

    const count = parseInt(result.rows[0]?.count ?? '0', 10);
    if (count > 0) {
      connections.set(tableName, count);
    }
  }

  return connections;
}

/**
 * Lookup table stats for a specific table from the production context.
 */
export function getTableStats(
  context: ProductionContext,
  tableName: string
): TableStats | undefined {
  return context.tableStats.get(tableName);
}

/**
 * Lookup affected queries for a specific table from the production context.
 */
export function getAffectedQueries(
  context: ProductionContext,
  tableName: string
): AffectedQuery[] {
  return context.affectedQueries.get(tableName) ?? [];
}

/**
 * Get active connection count for a specific table.
 */
export function getActiveConnections(
  context: ProductionContext,
  tableName: string
): number {
  return context.activeConnections.get(tableName) ?? 0;
}

/**
 * Test the database connection. Returns true if successful, throws on failure.
 */
export async function testConnection(config: ConnectionConfig): Promise<boolean> {
  const pool = new Pool({
    connectionString: config.connectionString,
    connectionTimeoutMillis: config.connectTimeout ?? 5000,
    max: 1,
    ssl: config.ssl,
  });

  try {
    await pool.query('SELECT 1');
    return true;
  } finally {
    await pool.end();
  }
}
