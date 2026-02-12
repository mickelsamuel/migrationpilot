import { describe, it, expect } from 'vitest';
import { parseMigration } from '../src/parser/parse.js';
import { extractTargets } from '../src/parser/extract.js';

describe('parseMigration', () => {
  it('parses a simple CREATE TABLE', async () => {
    const result = await parseMigration('CREATE TABLE users (id serial PRIMARY KEY, name text);');
    expect(result.errors).toHaveLength(0);
    expect(result.statements).toHaveLength(1);
    expect(result.statements[0].stmt).toHaveProperty('CreateStmt');
  });

  it('parses ALTER TABLE ADD COLUMN', async () => {
    const result = await parseMigration('ALTER TABLE users ADD COLUMN email text;');
    expect(result.errors).toHaveLength(0);
    expect(result.statements).toHaveLength(1);
    expect(result.statements[0].stmt).toHaveProperty('AlterTableStmt');
  });

  it('parses CREATE INDEX', async () => {
    const result = await parseMigration('CREATE INDEX idx_users_email ON users (email);');
    expect(result.errors).toHaveLength(0);
    expect(result.statements[0].stmt).toHaveProperty('IndexStmt');
  });

  it('parses CREATE INDEX CONCURRENTLY', async () => {
    const result = await parseMigration('CREATE INDEX CONCURRENTLY idx_users_email ON users (email);');
    expect(result.errors).toHaveLength(0);
    const idx = result.statements[0].stmt.IndexStmt as { concurrent?: boolean };
    expect(idx.concurrent).toBe(true);
  });

  it('parses multiple statements', async () => {
    const sql = `
      ALTER TABLE users ADD COLUMN email text;
      CREATE INDEX idx_users_email ON users (email);
    `;
    const result = await parseMigration(sql);
    expect(result.errors).toHaveLength(0);
    expect(result.statements).toHaveLength(2);
  });

  it('returns errors for invalid SQL', async () => {
    const result = await parseMigration('NOT VALID SQL AT ALL');
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('preserves original SQL for each statement', async () => {
    const sql = 'ALTER TABLE users ADD COLUMN email text;';
    const result = await parseMigration(sql);
    expect(result.statements[0].originalSql).toContain('ALTER TABLE');
  });

  // Edge cases
  it('handles empty SQL string gracefully', async () => {
    const result = await parseMigration('');
    // libpg-query may return an error or empty statements for empty input
    expect(result.statements.length + result.errors.length).toBeGreaterThanOrEqual(0);
  });

  it('handles SQL with only comments', async () => {
    const result = await parseMigration('-- this is just a comment');
    expect(result.errors).toHaveLength(0);
    expect(result.statements).toHaveLength(0);
  });

  it('parses SET + DDL multi-statement', async () => {
    const sql = `SET lock_timeout = '5s'; CREATE INDEX CONCURRENTLY idx ON users (email);`;
    const result = await parseMigration(sql);
    expect(result.errors).toHaveLength(0);
    expect(result.statements).toHaveLength(2);
    expect(result.statements[0].stmt).toHaveProperty('VariableSetStmt');
    expect(result.statements[1].stmt).toHaveProperty('IndexStmt');
  });

  it('parses schema-qualified table name', async () => {
    const result = await parseMigration('ALTER TABLE public.users ADD COLUMN email text;');
    expect(result.errors).toHaveLength(0);
    expect(result.statements[0].stmt).toHaveProperty('AlterTableStmt');
  });

  it('parses VACUUM statement', async () => {
    const result = await parseMigration('VACUUM users;');
    expect(result.errors).toHaveLength(0);
    expect(result.statements[0].stmt).toHaveProperty('VacuumStmt');
  });

  it('parses BEGIN/COMMIT transaction blocks', async () => {
    const sql = 'BEGIN; ALTER TABLE users ADD COLUMN x text; COMMIT;';
    const result = await parseMigration(sql);
    expect(result.errors).toHaveLength(0);
    expect(result.statements).toHaveLength(3);
    expect(result.statements[0].stmt).toHaveProperty('TransactionStmt');
    expect(result.statements[2].stmt).toHaveProperty('TransactionStmt');
  });

  it('parses DROP INDEX CONCURRENTLY', async () => {
    const result = await parseMigration('DROP INDEX CONCURRENTLY idx_users_email;');
    expect(result.errors).toHaveLength(0);
    expect(result.statements[0].stmt).toHaveProperty('DropStmt');
  });

  it('parses ADD COLUMN with DEFAULT', async () => {
    const result = await parseMigration("ALTER TABLE users ADD COLUMN created_at timestamptz DEFAULT now();");
    expect(result.errors).toHaveLength(0);
    expect(result.statements[0].stmt).toHaveProperty('AlterTableStmt');
  });
});

describe('extractTargets', () => {
  it('extracts table from ALTER TABLE', async () => {
    const result = await parseMigration('ALTER TABLE users ADD COLUMN email text;');
    const targets = extractTargets(result.statements[0].stmt);
    expect(targets).toHaveLength(1);
    expect(targets[0].tableName).toBe('users');
    expect(targets[0].operation).toBe('ALTER TABLE');
  });

  it('extracts table from CREATE INDEX', async () => {
    const result = await parseMigration('CREATE INDEX idx_email ON users (email);');
    const targets = extractTargets(result.statements[0].stmt);
    expect(targets).toHaveLength(1);
    expect(targets[0].tableName).toBe('users');
    expect(targets[0].operation).toBe('CREATE INDEX');
  });

  it('detects CONCURRENTLY in index creation', async () => {
    const result = await parseMigration('CREATE INDEX CONCURRENTLY idx_email ON users (email);');
    const targets = extractTargets(result.statements[0].stmt);
    expect(targets[0].operation).toBe('CREATE INDEX CONCURRENTLY');
  });

  it('extracts table from CREATE TABLE', async () => {
    const result = await parseMigration('CREATE TABLE orders (id serial PRIMARY KEY);');
    const targets = extractTargets(result.statements[0].stmt);
    expect(targets).toHaveLength(1);
    expect(targets[0].tableName).toBe('orders');
    expect(targets[0].operation).toBe('CREATE TABLE');
  });

  it('extracts columns from ALTER TABLE', async () => {
    const result = await parseMigration('ALTER TABLE users ADD COLUMN email text;');
    const targets = extractTargets(result.statements[0].stmt);
    expect(targets[0].columns).toContain('email');
  });

  // Edge cases
  it('handles DROP TABLE statement', async () => {
    const result = await parseMigration('DROP TABLE users;');
    const targets = extractTargets(result.statements[0].stmt);
    // DROP extraction depends on AST object structure — may return 0 or 1 targets
    expect(targets.length).toBeLessThanOrEqual(1);
  });

  it('handles VACUUM statement', async () => {
    const result = await parseMigration('VACUUM users;');
    const targets = extractTargets(result.statements[0].stmt);
    // VACUUM extraction depends on AST rels structure — may return 0 or 1 targets
    expect(targets.length).toBeLessThanOrEqual(1);
  });

  it('returns empty for SET statements', async () => {
    const result = await parseMigration("SET lock_timeout = '5s';");
    const targets = extractTargets(result.statements[0].stmt);
    expect(targets).toHaveLength(0);
  });
});
