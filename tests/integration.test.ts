/**
 * Integration tests using PGlite — an in-process PostgreSQL WASM engine.
 * These validate that our production context SQL queries work correctly
 * against a real PostgreSQL catalog.
 *
 * PGlite limitations:
 * - Single connection only (pg_stat_activity won't show other connections)
 * - pg_stat_statements extension not available in WASM build
 * - reltuples may be -1 until ANALYZE is run
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { settingToBytes } from '../src/production/catalog.js';

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.waitReady;

  // Create test tables with data
  await db.exec(`
    CREATE TABLE users (
      id serial PRIMARY KEY,
      email text NOT NULL,
      name text,
      status text DEFAULT 'active'
    );

    CREATE TABLE orders (
      id serial PRIMARY KEY,
      user_id integer REFERENCES users(id),
      total numeric(10,2),
      created_at timestamptz DEFAULT now()
    );

    CREATE INDEX idx_users_email ON users (email);
    CREATE INDEX idx_orders_user_id ON orders (user_id);
    CREATE INDEX idx_orders_created ON orders (created_at);
  `);

  // Insert some data
  await db.exec(`
    INSERT INTO users (email, name)
    SELECT
      'user' || i || '@example.com',
      'User ' || i
    FROM generate_series(1, 100) AS i;

    INSERT INTO orders (user_id, total)
    SELECT
      (i % 100) + 1,
      (random() * 1000)::numeric(10,2)
    FROM generate_series(1, 500) AS i;
  `);

  // Run ANALYZE so reltuples is populated
  await db.exec('ANALYZE;');
});

afterAll(async () => {
  await db.close();
});

describe('pg_class table stats query', () => {
  it('returns row count for existing tables', async () => {
    const result = await db.query<{
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
    `, [['users', 'orders']]);

    expect(result.rows.length).toBe(2);

    const usersRow = result.rows.find(r => r.tablename === 'users');
    expect(usersRow).toBeDefined();
    expect(Number(usersRow!.row_count)).toBe(100);
    expect(Number(usersRow!.total_bytes)).toBeGreaterThan(0);
    // users has: PK index + idx_users_email = 2 indexes
    expect(Number(usersRow!.index_count)).toBe(2);

    const ordersRow = result.rows.find(r => r.tablename === 'orders');
    expect(ordersRow).toBeDefined();
    expect(Number(ordersRow!.row_count)).toBe(500);
    // orders has: PK + idx_orders_user_id + idx_orders_created = 3 indexes
    expect(Number(ordersRow!.index_count)).toBe(3);
  });

  it('returns empty for non-existent tables', async () => {
    const result = await db.query(`
      SELECT c.relname AS tablename
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relname = ANY($1)
        AND n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND c.relkind IN ('r', 'p')
    `, [['nonexistent_table']]);

    expect(result.rows.length).toBe(0);
  });

  it('filters out system catalogs', async () => {
    const result = await db.query(`
      SELECT c.relname AS tablename
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relname = ANY($1)
        AND n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND c.relkind IN ('r', 'p')
    `, [['pg_class']]);

    expect(result.rows.length).toBe(0);
  });
});

describe('pg_stat_statements extension check', () => {
  it('returns empty when extension is not installed', async () => {
    const result = await db.query(
      `SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements' LIMIT 1`
    );
    // PGlite doesn't include pg_stat_statements
    expect(result.rows.length).toBe(0);
  });
});

describe('pg_stat_activity query', () => {
  it('runs without error', async () => {
    const result = await db.query<{ count: string }>(`
      SELECT count(*) AS count
      FROM pg_stat_activity
      WHERE state = 'active'
        AND query ~* $1
        AND pid != pg_backend_pid()
    `, ['\\musers\\M']);

    // PGlite is single-connection, so no OTHER active connections
    expect(Number(result.rows[0].count)).toBe(0);
  });
});

describe('End-to-end: full analysis pipeline with PGlite catalog data', () => {
  it('pg_class data matches expected TableStats shape', async () => {
    const result = await db.query<{
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
    `, [['users']]);

    const row = result.rows[0];

    // Parse the same way context.ts does
    const stats = {
      tableName: row.tablename,
      rowCount: parseInt(row.row_count, 10) || 0,
      totalBytes: parseInt(row.total_bytes, 10) || 0,
      indexCount: parseInt(row.index_count, 10) || 0,
    };

    expect(stats.tableName).toBe('users');
    expect(stats.rowCount).toBe(100);
    expect(stats.totalBytes).toBeGreaterThan(8192); // At least one page
    expect(stats.indexCount).toBe(2);
  });

  it('table size increases with more data', async () => {
    // Get current size
    const before = await db.query<{ total_bytes: string }>(`
      SELECT pg_total_relation_size(c.oid) AS total_bytes
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relname = 'users' AND n.nspname = 'public'
    `);
    const sizeBefore = Number(before.rows[0].total_bytes);

    // Insert more data
    await db.exec(`
      INSERT INTO users (email, name)
      SELECT 'bulk' || i || '@example.com', 'Bulk ' || i
      FROM generate_series(1, 1000) AS i;
    `);

    const after = await db.query<{ total_bytes: string }>(`
      SELECT pg_total_relation_size(c.oid) AS total_bytes
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relname = 'users' AND n.nspname = 'public'
    `);
    const sizeAfter = Number(after.rows[0].total_bytes);

    expect(sizeAfter).toBeGreaterThan(sizeBefore);
  });

  it('index count changes when adding/dropping indexes', async () => {
    // Add an index
    await db.exec('CREATE INDEX idx_users_name ON users (name);');

    const result = await db.query<{ index_count: string }>(`
      SELECT (SELECT count(*) FROM pg_index i WHERE i.indrelid = c.oid) AS index_count
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relname = 'users' AND n.nspname = 'public'
    `);

    // PK + email + name = 3
    expect(Number(result.rows[0].index_count)).toBe(3);

    // Clean up
    await db.exec('DROP INDEX idx_users_name;');
  });
});

describe('Extended catalog queries (MP100-MP112)', () => {
  it('index metadata query returns ordered key columns per index', async () => {
    const result = await db.query<{
      table_name: string;
      index_name: string;
      method: string;
      is_unique: boolean;
      is_primary: boolean;
      is_partial: boolean;
      key_columns: string[];
    }>(`
      SELECT
        t.relname AS table_name,
        i.relname AS index_name,
        am.amname AS method,
        ix.indisunique AS is_unique,
        ix.indisprimary AS is_primary,
        (ix.indpred IS NOT NULL) AS is_partial,
        ARRAY(
          SELECT pg_get_indexdef(ix.indexrelid, k, true)
          FROM generate_series(1, ix.indnkeyatts) AS k
        ) AS key_columns
      FROM pg_index ix
      JOIN pg_class i ON i.oid = ix.indexrelid
      JOIN pg_class t ON t.oid = ix.indrelid
      JOIN pg_am am ON am.oid = i.relam
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE t.relname = ANY($1)
        AND n.nspname NOT IN ('pg_catalog', 'information_schema')
      ORDER BY t.relname, i.relname
    `, [['users']]);

    const pkey = result.rows.find(r => r.index_name === 'users_pkey');
    expect(pkey).toBeDefined();
    expect(pkey!.is_primary).toBe(true);
    expect(pkey!.is_unique).toBe(true);
    expect(pkey!.method).toBe('btree');
    expect(pkey!.key_columns).toEqual(['id']);

    const email = result.rows.find(r => r.index_name === 'idx_users_email');
    expect(email).toBeDefined();
    expect(email!.is_unique).toBe(false);
    expect(email!.is_partial).toBe(false);
    expect(email!.key_columns).toEqual(['email']);
  });

  it('index metadata query orders composite keys and renders expressions', async () => {
    await db.exec(`
      CREATE INDEX idx_users_status_name ON users (status, name);
      CREATE INDEX idx_users_lower_email ON users (lower(email));
      CREATE INDEX idx_users_partial ON users (name) WHERE status = 'active';
    `);

    const result = await db.query<{ index_name: string; is_partial: boolean; key_columns: string[] }>(`
      SELECT
        i.relname AS index_name,
        (ix.indpred IS NOT NULL) AS is_partial,
        ARRAY(
          SELECT pg_get_indexdef(ix.indexrelid, k, true)
          FROM generate_series(1, ix.indnkeyatts) AS k
        ) AS key_columns
      FROM pg_index ix
      JOIN pg_class i ON i.oid = ix.indexrelid
      JOIN pg_class t ON t.oid = ix.indrelid
      WHERE t.relname = 'users'
    `);

    const composite = result.rows.find(r => r.index_name === 'idx_users_status_name');
    expect(composite!.key_columns).toEqual(['status', 'name']);

    const expression = result.rows.find(r => r.index_name === 'idx_users_lower_email');
    expect(expression!.key_columns).toEqual(['lower(email)']);

    const partial = result.rows.find(r => r.index_name === 'idx_users_partial');
    expect(partial!.is_partial).toBe(true);

    await db.exec(`
      DROP INDEX idx_users_status_name;
      DROP INDEX idx_users_lower_email;
      DROP INDEX idx_users_partial;
    `);
  });

  it('table facts query returns write counters, relkind, and partition count', async () => {
    const result = await db.query<{
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
    `, [['users', 'orders']]);

    expect(result.rows.length).toBe(2);
    const users = result.rows.find(r => r.table_name === 'users');
    expect(users!.relkind).toBe('r');
    expect(Number(users!.partition_count)).toBe(0);
    expect(Number(users!.inserts)).toBeGreaterThanOrEqual(0);
    // stats_reset can be null on a database whose stats were never reset, which
    // is exactly why TableFacts.windowSeconds is optional
    expect(users!.window_seconds === null || Number(users!.window_seconds) >= 0).toBe(true);
  });

  it('table facts query counts partitions of a partitioned parent', async () => {
    await db.exec(`
      CREATE TABLE readings (id bigint, taken_at date NOT NULL) PARTITION BY RANGE (taken_at);
      CREATE TABLE readings_2024_01 PARTITION OF readings
        FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
      CREATE TABLE readings_2024_02 PARTITION OF readings
        FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');
    `);

    const result = await db.query<{ relkind: string; partition_count: string }>(`
      SELECT
        c.relkind::text AS relkind,
        (SELECT count(*) FROM pg_inherits h WHERE h.inhparent = c.oid) AS partition_count
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relname = 'readings' AND n.nspname = 'public'
    `);

    expect(result.rows[0].relkind).toBe('p');
    expect(Number(result.rows[0].partition_count)).toBe(2);

    await db.exec('DROP TABLE readings;');
  });

  it('replication query runs and reports no standbys on a single instance', async () => {
    const result = await db.query<{ replica_count: number; slot_count: number }>(`
      SELECT
        (SELECT count(*) FROM pg_stat_replication)::int AS replica_count,
        (SELECT count(*) FROM pg_replication_slots)::int AS slot_count
    `);
    expect(Number(result.rows[0].replica_count)).toBe(0);
    expect(Number(result.rows[0].slot_count)).toBe(0);
  });

  it('settings query returns maintenance_work_mem with its unit', async () => {
    const result = await db.query<{ name: string; setting: string; unit: string | null }>(`
      SELECT name, setting, unit
      FROM pg_settings
      WHERE name IN ('maintenance_work_mem', 'max_parallel_maintenance_workers')
    `);

    const mem = result.rows.find(r => r.name === 'maintenance_work_mem');
    expect(mem).toBeDefined();
    expect(settingToBytes(mem!.setting, mem!.unit)).toBeGreaterThan(0);

    const workers = result.rows.find(r => r.name === 'max_parallel_maintenance_workers');
    expect(workers).toBeDefined();
    expect(Number.isFinite(Number(workers!.setting))).toBe(true);
  });

  it('free-space probe reports that core PostgreSQL has no such function', async () => {
    const result = await db.query<{ present: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE p.proname = 'pg_tablespace_avail'
          AND p.pronargs = 1
          AND n.nspname IN ('pg_catalog', 'public')
      ) AS present
    `);
    // No released PostgreSQL has this function, so MP102 reports sizes only
    expect(result.rows[0].present).toBe(false);
  });

  it('extension probes come back empty when the extensions are not installed', async () => {
    const extensions = await db.query<{ extname: string }>(`SELECT extname FROM pg_extension`);
    const names = new Set(extensions.rows.map(r => r.extname));
    expect(names.has('timescaledb')).toBe(false);
    expect(names.has('citus')).toBe(false);
    expect(names.has('pg_partman')).toBe(false);

    const timescale = await db.query<{ present: boolean }>(
      `SELECT to_regclass('_timescaledb_catalog.hypertable') IS NOT NULL AS present`
    );
    expect(timescale.rows[0].present).toBe(false);

    const citus = await db.query<{ present: boolean }>(
      `SELECT to_regclass('pg_catalog.pg_dist_partition') IS NOT NULL AS present`
    );
    expect(citus.rows[0].present).toBe(false);
  });
});

describe('settingToBytes', () => {
  it('converts pg_settings units to bytes', () => {
    expect(settingToBytes('65536', 'kB')).toBe(65536 * 1024);
    expect(settingToBytes('64', 'MB')).toBe(64 * 1024 * 1024);
    expect(settingToBytes('2', 'GB')).toBe(2 * 1024 ** 3);
    expect(settingToBytes('1024', '8kB')).toBe(1024 * 8 * 1024);
    expect(settingToBytes('4', null)).toBe(4);
  });

  it('returns undefined for values it cannot read', () => {
    expect(settingToBytes('on', null)).toBeUndefined();
    expect(settingToBytes('100', 'ms')).toBeUndefined();
  });
});

describe('Regex word-boundary matching for table names', () => {
  it('matches table name with word boundaries', async () => {
    // This tests the same regex pattern used in queryAffectedQueries
    // \\m and \\M are PG word-boundary anchors
    const result = await db.query<{ match: boolean }>(`
      SELECT 'SELECT * FROM users WHERE id = 1' ~* $1 AS match
    `, ['\\musers\\M']);
    expect(result.rows[0].match).toBe(true);
  });

  it('does not match partial table names', async () => {
    const result = await db.query<{ match: boolean }>(`
      SELECT 'SELECT * FROM superusers WHERE id = 1' ~* $1 AS match
    `, ['\\musers\\M']);
    // "users" appears in "superusers" but word boundary should prevent match
    expect(result.rows[0].match).toBe(false);
  });

  it('matches table name in UPDATE statements', async () => {
    const result = await db.query<{ match: boolean }>(`
      SELECT 'UPDATE users SET status = active' ~* $1 AS match
    `, ['\\musers\\M']);
    expect(result.rows[0].match).toBe(true);
  });

  it('matches table name in JOIN clauses', async () => {
    const result = await db.query<{ match: boolean }>(`
      SELECT 'SELECT o.* FROM orders o JOIN users u ON o.user_id = u.id' ~* $1 AS match
    `, ['\\musers\\M']);
    expect(result.rows[0].match).toBe(true);
  });
});
