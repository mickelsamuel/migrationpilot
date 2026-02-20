import { describe, it, expect } from 'vitest';
import { parseMigration } from '../src/parser/parse.js';
import { suboptimalColumnOrder } from '../src/rules/MP061-suboptimal-column-order.js';

async function check(sql: string) {
  const { statements } = await parseMigration(sql);
  const stmt = statements[0];
  if (!stmt) return null;
  return suboptimalColumnOrder.check(stmt.stmt, {
    originalSql: stmt.originalSql,
    line: 1,
    pgVersion: 17,
    lock: { lockType: 'ACCESS EXCLUSIVE', blocksReads: true, blocksWrites: true },
    allStatements: statements.map(s => ({ stmt: s.stmt, originalSql: s.originalSql })),
    statementIndex: 0,
  });
}

describe('MP061: suboptimal-column-order', () => {
  it('flags text before integer columns', async () => {
    const result = await check(`
      CREATE TABLE users (
        name TEXT,
        bio TEXT,
        id INTEGER,
        age INTEGER
      );
    `);
    expect(result).not.toBeNull();
    expect(result?.ruleId).toBe('MP061');
    expect(result?.message).toContain('fixed-size columns');
  });

  it('ok when fixed-size columns come first', async () => {
    const result = await check(`
      CREATE TABLE users (
        id BIGINT,
        age INTEGER,
        created_at TIMESTAMPTZ,
        name TEXT,
        bio TEXT
      );
    `);
    expect(result).toBeNull();
  });

  it('ok with fewer than 3 columns (too few to matter)', async () => {
    const result = await check('CREATE TABLE kv (key TEXT, value TEXT);');
    expect(result).toBeNull();
  });

  it('flags jsonb before uuid', async () => {
    const result = await check(`
      CREATE TABLE events (
        data JSONB,
        tags TEXT,
        id UUID,
        created_at TIMESTAMP
      );
    `);
    expect(result).not.toBeNull();
    expect(result?.message).toContain('id');
  });

  it('ok when all columns are same kind (all fixed)', async () => {
    const result = await check(`
      CREATE TABLE metrics (
        id BIGINT,
        value FLOAT8,
        ts TIMESTAMPTZ
      );
    `);
    expect(result).toBeNull();
  });

  it('ok when all columns are variable-length', async () => {
    const result = await check(`
      CREATE TABLE documents (
        title TEXT,
        body TEXT,
        metadata JSONB
      );
    `);
    expect(result).toBeNull();
  });

  it('ignores non-CREATE TABLE statements', async () => {
    const result = await check('ALTER TABLE users ADD COLUMN bio TEXT;');
    expect(result).toBeNull();
  });
});
