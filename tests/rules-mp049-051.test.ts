import { describe, it, expect } from 'vitest';
import { parseMigration } from '../src/parser/parse.js';
import { classifyLock } from '../src/locks/classify.js';
import { allRules, runRules } from '../src/rules/index.js';

async function analyze(sql: string, pgVersion = 17) {
  const parsed = await parseMigration(sql);
  expect(parsed.errors).toHaveLength(0);

  const statements = parsed.statements.map((s) => {
    const lock = classifyLock(s.stmt, pgVersion);
    const line = sql.slice(0, s.stmtLocation).split('\n').length;
    return { ...s, lock, line };
  });

  return runRules(allRules, statements, pgVersion, undefined, sql);
}

// --- MP049: require-partition-key-in-pk ---

describe('MP049: require-partition-key-in-pk', () => {
  it('flags PK missing partition key column', async () => {
    const sql = `CREATE TABLE events (
      id bigint PRIMARY KEY,
      created_at timestamptz NOT NULL,
      data jsonb
    ) PARTITION BY RANGE (created_at);`;
    const violations = await analyze(sql);
    const v = violations.find(v => v.ruleId === 'MP049');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('critical');
    expect(v?.message).toContain('created_at');
  });

  it('passes when PK includes partition key', async () => {
    const sql = `CREATE TABLE events (
      id bigint NOT NULL,
      created_at timestamptz NOT NULL,
      data jsonb,
      PRIMARY KEY (id, created_at)
    ) PARTITION BY RANGE (created_at);`;
    const violations = await analyze(sql);
    const v = violations.find(v => v.ruleId === 'MP049');
    expect(v).toBeUndefined();
  });

  it('passes for non-partitioned tables', async () => {
    const sql = `CREATE TABLE users (id bigint PRIMARY KEY, name text);`;
    const violations = await analyze(sql);
    const v = violations.find(v => v.ruleId === 'MP049');
    expect(v).toBeUndefined();
  });

  it('passes when partitioned table has no PK', async () => {
    const sql = `CREATE TABLE events (
      id bigint NOT NULL,
      created_at timestamptz NOT NULL
    ) PARTITION BY RANGE (created_at);`;
    const violations = await analyze(sql);
    const v = violations.find(v => v.ruleId === 'MP049');
    expect(v).toBeUndefined();
  });

  it('flags table-level PK missing partition key', async () => {
    const sql = `CREATE TABLE metrics (
      id bigint NOT NULL,
      ts timestamptz NOT NULL,
      value double precision,
      PRIMARY KEY (id)
    ) PARTITION BY RANGE (ts);`;
    const violations = await analyze(sql);
    const v = violations.find(v => v.ruleId === 'MP049');
    expect(v).toBeDefined();
    expect(v?.message).toContain('ts');
  });
});

// --- MP050: prefer-hnsw-over-ivfflat ---

describe('MP050: prefer-hnsw-over-ivfflat', () => {
  it('flags IVFFlat index creation', async () => {
    const sql = `CREATE INDEX idx_embeddings ON items USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);`;
    const violations = await analyze(sql);
    const v = violations.find(v => v.ruleId === 'MP050');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('warning');
    expect(v?.message).toContain('IVFFlat');
    expect(v?.message).toContain('HNSW');
  });

  it('passes for HNSW index', async () => {
    const sql = `CREATE INDEX idx_embeddings ON items USING hnsw (embedding vector_cosine_ops);`;
    const violations = await analyze(sql);
    const v = violations.find(v => v.ruleId === 'MP050');
    expect(v).toBeUndefined();
  });

  it('passes for btree index', async () => {
    const sql = `CREATE INDEX idx_users_email ON users (email);`;
    const violations = await analyze(sql);
    const v = violations.find(v => v.ruleId === 'MP050');
    expect(v).toBeUndefined();
  });
});

// --- MP051: require-spatial-index ---

describe('MP051: require-spatial-index', () => {
  it('flags geometry column without spatial index', async () => {
    const sql = `CREATE TABLE locations (
      id bigint PRIMARY KEY,
      geom geometry NOT NULL
    );`;
    const violations = await analyze(sql);
    const v = violations.find(v => v.ruleId === 'MP051');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('warning');
    expect(v?.message).toContain('geom');
    expect(v?.message).toContain('GIST');
  });

  it('passes when GIST index follows the CREATE TABLE', async () => {
    const sql = `CREATE TABLE locations (
      id bigint PRIMARY KEY,
      geom geometry NOT NULL
    );
    CREATE INDEX CONCURRENTLY idx_locations_geom ON locations USING GIST (geom);`;
    const violations = await analyze(sql);
    const v = violations.find(v => v.ruleId === 'MP051');
    expect(v).toBeUndefined();
  });

  it('passes for tables without spatial columns', async () => {
    const sql = `CREATE TABLE users (id bigint PRIMARY KEY, name text);`;
    const violations = await analyze(sql);
    const v = violations.find(v => v.ruleId === 'MP051');
    expect(v).toBeUndefined();
  });

  it('flags geography column without spatial index', async () => {
    const sql = `CREATE TABLE places (
      id bigint PRIMARY KEY,
      location geography NOT NULL
    );`;
    const violations = await analyze(sql);
    const v = violations.find(v => v.ruleId === 'MP051');
    expect(v).toBeDefined();
    expect(v?.message).toContain('location');
  });
});
