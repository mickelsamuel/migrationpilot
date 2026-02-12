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
