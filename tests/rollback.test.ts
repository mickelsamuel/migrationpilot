import { describe, it, expect } from 'vitest';
import { parseMigration } from '../src/parser/parse.js';
import { generateRollback, formatRollbackSql } from '../src/generator/rollback.js';

async function rollback(sql: string) {
  const { statements } = await parseMigration(sql);
  return generateRollback(statements);
}

describe('rollback generator', () => {
  it('reverses CREATE TABLE → DROP TABLE', async () => {
    const result = await rollback('CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT);');
    expect(result.statements).toHaveLength(1);
    expect(result.statements[0]?.sql).toBe('DROP TABLE IF EXISTS users;');
  });

  it('reverses CREATE TABLE with schema', async () => {
    const result = await rollback('CREATE TABLE public.users (id INT);');
    expect(result.statements[0]?.sql).toBe('DROP TABLE IF EXISTS public.users;');
  });

  it('reverses CREATE INDEX → DROP INDEX', async () => {
    const result = await rollback('CREATE INDEX idx_users_email ON users (email);');
    expect(result.statements).toHaveLength(1);
    expect(result.statements[0]?.sql).toBe('DROP INDEX IF EXISTS idx_users_email;');
  });

  it('reverses CREATE INDEX CONCURRENTLY → DROP INDEX CONCURRENTLY', async () => {
    const result = await rollback('CREATE INDEX CONCURRENTLY idx_users_email ON users (email);');
    expect(result.statements[0]?.sql).toBe('DROP INDEX CONCURRENTLY IF EXISTS idx_users_email;');
  });

  it('reverses ADD COLUMN → DROP COLUMN', async () => {
    const result = await rollback('ALTER TABLE users ADD COLUMN bio TEXT;');
    expect(result.statements).toHaveLength(1);
    expect(result.statements[0]?.sql).toBe('ALTER TABLE users DROP COLUMN IF EXISTS bio;');
  });

  it('reverses SET NOT NULL → DROP NOT NULL', async () => {
    const result = await rollback('ALTER TABLE users ALTER COLUMN name SET NOT NULL;');
    expect(result.statements).toHaveLength(1);
    expect(result.statements[0]?.sql).toBe('ALTER TABLE users ALTER COLUMN name DROP NOT NULL;');
  });

  it('reverses DROP NOT NULL → SET NOT NULL', async () => {
    const result = await rollback('ALTER TABLE users ALTER COLUMN name DROP NOT NULL;');
    expect(result.statements[0]?.sql).toBe('ALTER TABLE users ALTER COLUMN name SET NOT NULL;');
  });

  it('reverses SET DEFAULT → DROP DEFAULT', async () => {
    const result = await rollback("ALTER TABLE users ALTER COLUMN role SET DEFAULT 'user';");
    expect(result.statements[0]?.sql).toBe('ALTER TABLE users ALTER COLUMN role DROP DEFAULT;');
  });

  it('reverses ADD CONSTRAINT → DROP CONSTRAINT', async () => {
    const result = await rollback('ALTER TABLE orders ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id);');
    expect(result.statements[0]?.sql).toBe('ALTER TABLE orders DROP CONSTRAINT IF EXISTS fk_user;');
  });

  it('reverses RENAME COLUMN → RENAME back', async () => {
    const result = await rollback('ALTER TABLE users RENAME COLUMN name TO full_name;');
    expect(result.statements[0]?.sql).toBe('ALTER TABLE users RENAME COLUMN full_name TO name;');
  });

  it('reverses CREATE TRIGGER → DROP TRIGGER', async () => {
    const result = await rollback('CREATE TRIGGER audit_trigger AFTER INSERT ON users FOR EACH ROW EXECUTE FUNCTION audit_fn();');
    expect(result.statements[0]?.sql).toBe('DROP TRIGGER IF EXISTS audit_trigger ON users;');
  });

  it('reverses CREATE EXTENSION → DROP EXTENSION', async () => {
    const result = await rollback("CREATE EXTENSION IF NOT EXISTS pgcrypto;");
    expect(result.statements[0]?.sql).toBe('DROP EXTENSION IF EXISTS pgcrypto;');
  });

  it('reverses CREATE SCHEMA → DROP SCHEMA', async () => {
    const result = await rollback('CREATE SCHEMA analytics;');
    expect(result.statements[0]?.sql).toBe('DROP SCHEMA IF EXISTS analytics;');
  });

  it('reverses ENABLE RLS → DISABLE RLS', async () => {
    const result = await rollback('ALTER TABLE users ENABLE ROW LEVEL SECURITY;');
    expect(result.statements[0]?.sql).toBe('ALTER TABLE users DISABLE ROW LEVEL SECURITY;');
  });

  it('reverses multi-statement migrations in correct order', async () => {
    const sql = `
      CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT);
      CREATE INDEX idx_users_name ON users (name);
      ALTER TABLE users ADD COLUMN email TEXT;
    `;
    const result = await rollback(sql);
    expect(result.statements).toHaveLength(3);
    // Should be in reverse order: DROP COLUMN, DROP INDEX, DROP TABLE
    expect(result.statements[0]?.sql).toContain('DROP COLUMN');
    expect(result.statements[1]?.sql).toContain('DROP INDEX');
    expect(result.statements[2]?.sql).toContain('DROP TABLE');
  });

  it('warns for DROP TABLE (cannot auto-recreate)', async () => {
    const result = await rollback('DROP TABLE IF EXISTS users;');
    expect(result.statements[0]?.sql).toContain('WARNING');
    expect(result.statements[0]?.sql).toContain('Cannot auto-generate CREATE');
  });

  it('warns for ALTER TYPE ADD VALUE (cannot remove enum values)', async () => {
    const result = await rollback("ALTER TYPE status ADD VALUE 'archived';");
    expect(result.statements[0]?.sql).toContain('WARNING');
    expect(result.statements[0]?.sql).toContain('does not support removing enum values');
  });

  it('reverses ALTER TYPE RENAME VALUE', async () => {
    const result = await rollback("ALTER TYPE status RENAME VALUE 'active' TO 'enabled';");
    expect(result.statements[0]?.sql).toContain("RENAME VALUE 'enabled' TO 'active'");
  });

  it('warns for ALTER COLUMN TYPE (original type unknown)', async () => {
    const result = await rollback('ALTER TABLE users ALTER COLUMN age TYPE BIGINT;');
    expect(result.statements[0]?.sql).toContain('WARNING');
    expect(result.statements[0]?.sql).toContain('Cannot auto-reverse column type change');
  });

  it('skips SET/RESET statements', async () => {
    const sql = "SET lock_timeout = '5s';\nCREATE TABLE users (id INT);\nRESET lock_timeout;";
    const result = await rollback(sql);
    expect(result.statements).toHaveLength(1);
    expect(result.statements[0]?.sql).toBe('DROP TABLE IF EXISTS users;');
    expect(result.warnings).toHaveLength(0);
  });

  it('skips BEGIN/COMMIT', async () => {
    const sql = "BEGIN;\nCREATE TABLE users (id INT);\nCOMMIT;";
    const result = await rollback(sql);
    expect(result.statements).toHaveLength(1);
    expect(result.statements[0]?.sql).toBe('DROP TABLE IF EXISTS users;');
  });

  it('formats rollback SQL with header and warnings', async () => {
    const result = await rollback('CREATE TABLE users (id INT);\nDROP TABLE old_users;');
    const formatted = formatRollbackSql(result);
    expect(formatted).toContain('Rollback migration generated by MigrationPilot');
    expect(formatted).toContain('DROP TABLE IF EXISTS users;');
    expect(formatted).toContain('Undo:');
  });

  it('returns empty for SET-only migrations', async () => {
    const result = await rollback("SET statement_timeout = '30s';");
    expect(result.statements).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('reverses CREATE VIEW → DROP VIEW', async () => {
    const result = await rollback('CREATE VIEW active_users AS SELECT * FROM users WHERE active = true;');
    expect(result.statements[0]?.sql).toBe('DROP VIEW IF EXISTS active_users;');
  });
});
