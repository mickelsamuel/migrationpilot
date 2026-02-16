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

  return runRules(allRules, statements, pgVersion);
}

// --- MP021: require-concurrent-reindex ---

describe('MP021: require-concurrent-reindex', () => {
  it('flags REINDEX TABLE without CONCURRENTLY on PG 17', async () => {
    const violations = await analyze('REINDEX TABLE users;');
    const v = violations.find(v => v.ruleId === 'MP021');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('warning');
    expect(v?.message).toContain('users');
    expect(v?.message).toContain('CONCURRENTLY');
  });

  it('flags REINDEX INDEX without CONCURRENTLY on PG 17', async () => {
    const violations = await analyze('REINDEX INDEX idx_users_email;');
    const v = violations.find(v => v.ruleId === 'MP021');
    expect(v).toBeDefined();
    expect(v?.message).toContain('idx_users_email');
  });

  it('passes REINDEX TABLE CONCURRENTLY', async () => {
    const violations = await analyze('REINDEX TABLE CONCURRENTLY users;');
    expect(violations.find(v => v.ruleId === 'MP021')).toBeUndefined();
  });

  it('does not flag on PG 11 (CONCURRENTLY unavailable)', async () => {
    const violations = await analyze('REINDEX TABLE users;', 11);
    expect(violations.find(v => v.ruleId === 'MP021')).toBeUndefined();
  });

  it('provides safe alternative with CONCURRENTLY', async () => {
    const violations = await analyze('REINDEX TABLE users;');
    const v = violations.find(v => v.ruleId === 'MP021');
    expect(v?.safeAlternative).toContain('CONCURRENTLY');
  });
});

// --- MP022: no-drop-cascade ---

describe('MP022: no-drop-cascade', () => {
  it('flags DROP TABLE CASCADE', async () => {
    const violations = await analyze('DROP TABLE users CASCADE;');
    const v = violations.find(v => v.ruleId === 'MP022');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('warning');
    expect(v?.message).toContain('users');
    expect(v?.message).toContain('CASCADE');
    expect(v?.message).toContain('dependent objects');
  });

  it('flags DROP VIEW CASCADE', async () => {
    const violations = await analyze('DROP VIEW active_users CASCADE;');
    const v = violations.find(v => v.ruleId === 'MP022');
    expect(v).toBeDefined();
  });

  it('passes DROP TABLE without CASCADE', async () => {
    const violations = await analyze('DROP TABLE users;');
    expect(violations.find(v => v.ruleId === 'MP022')).toBeUndefined();
  });

  it('passes DROP TABLE RESTRICT', async () => {
    const violations = await analyze('DROP TABLE users RESTRICT;');
    expect(violations.find(v => v.ruleId === 'MP022')).toBeUndefined();
  });

  it('provides safe alternative without CASCADE', async () => {
    const violations = await analyze('DROP TABLE users CASCADE;');
    const v = violations.find(v => v.ruleId === 'MP022');
    expect(v?.safeAlternative).toBeDefined();
    expect(v?.safeAlternative).not.toContain('CASCADE;');
    expect(v?.safeAlternative).toContain('pg_depend');
  });
});

// --- MP023: require-if-not-exists ---

describe('MP023: require-if-not-exists', () => {
  it('flags CREATE TABLE without IF NOT EXISTS', async () => {
    const violations = await analyze('CREATE TABLE users (id int);');
    const v = violations.find(v => v.ruleId === 'MP023');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('warning');
    expect(v?.message).toContain('users');
    expect(v?.message).toContain('IF NOT EXISTS');
  });

  it('passes CREATE TABLE IF NOT EXISTS', async () => {
    const violations = await analyze('CREATE TABLE IF NOT EXISTS users (id int);');
    expect(violations.find(v => v.ruleId === 'MP023')).toBeUndefined();
  });

  it('flags CREATE INDEX without IF NOT EXISTS', async () => {
    const violations = await analyze('CREATE INDEX CONCURRENTLY idx ON users (email);');
    const v = violations.find(v => v.ruleId === 'MP023');
    expect(v).toBeDefined();
    expect(v?.message).toContain('idx');
  });

  it('passes CREATE INDEX IF NOT EXISTS', async () => {
    const violations = await analyze('CREATE INDEX IF NOT EXISTS idx ON users (email);');
    expect(violations.find(v => v.ruleId === 'MP023')).toBeUndefined();
  });

  it('passes CREATE INDEX CONCURRENTLY IF NOT EXISTS', async () => {
    const violations = await analyze('CREATE INDEX CONCURRENTLY IF NOT EXISTS idx ON users (email);');
    expect(violations.find(v => v.ruleId === 'MP023')).toBeUndefined();
  });

  it('provides safe alternative with IF NOT EXISTS for table', async () => {
    const violations = await analyze('CREATE TABLE users (id int);');
    const v = violations.find(v => v.ruleId === 'MP023');
    expect(v?.safeAlternative).toContain('IF NOT EXISTS');
  });

  it('provides safe alternative with IF NOT EXISTS for index', async () => {
    const violations = await analyze('CREATE INDEX CONCURRENTLY idx ON users (email);');
    const v = violations.find(v => v.ruleId === 'MP023');
    expect(v?.safeAlternative).toContain('IF NOT EXISTS');
  });
});

// --- MP024: no-enum-value-removal ---

describe('MP024: no-enum-value-removal', () => {
  it('flags DROP TYPE', async () => {
    const violations = await analyze('DROP TYPE status_enum;');
    const v = violations.find(v => v.ruleId === 'MP024');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('warning');
    expect(v?.message).toContain('status_enum');
    expect(v?.message).toContain('recreated');
  });

  it('does not flag CREATE TYPE', async () => {
    const violations = await analyze("CREATE TYPE status_enum AS ENUM ('active', 'inactive');");
    expect(violations.find(v => v.ruleId === 'MP024')).toBeUndefined();
  });

  it('does not flag ALTER TYPE ADD VALUE', async () => {
    const violations = await analyze("ALTER TYPE status_enum ADD VALUE 'pending';");
    expect(violations.find(v => v.ruleId === 'MP024')).toBeUndefined();
  });

  it('provides safe alternative with rename-and-recreate pattern', async () => {
    const violations = await analyze('DROP TYPE status_enum;');
    const v = violations.find(v => v.ruleId === 'MP024');
    expect(v?.safeAlternative).toContain('_new');
    expect(v?.safeAlternative).toContain('RENAME TO');
  });
});

// --- MP025: ban-concurrent-in-transaction ---

describe('MP025: ban-concurrent-in-transaction', () => {
  it('flags CREATE INDEX CONCURRENTLY inside BEGIN/COMMIT', async () => {
    const sql = `BEGIN;
CREATE INDEX CONCURRENTLY idx ON users (email);
COMMIT;`;
    const violations = await analyze(sql);
    const v = violations.find(v => v.ruleId === 'MP025');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('critical');
    expect(v?.message).toContain('cannot run inside a transaction');
  });

  it('flags DROP INDEX CONCURRENTLY inside BEGIN/COMMIT', async () => {
    const sql = `BEGIN;
DROP INDEX CONCURRENTLY idx;
COMMIT;`;
    const violations = await analyze(sql);
    const v = violations.find(v => v.ruleId === 'MP025');
    expect(v).toBeDefined();
  });

  it('passes CREATE INDEX CONCURRENTLY outside transaction', async () => {
    const sql = 'CREATE INDEX CONCURRENTLY idx ON users (email);';
    const violations = await analyze(sql);
    expect(violations.find(v => v.ruleId === 'MP025')).toBeUndefined();
  });

  it('does not flag non-concurrent index inside transaction', async () => {
    const sql = `BEGIN;
SET lock_timeout = '5s';
CREATE INDEX idx ON users (email);
COMMIT;`;
    const violations = await analyze(sql);
    // MP025 should NOT fire (it only cares about CONCURRENTLY)
    expect(violations.find(v => v.ruleId === 'MP025')).toBeUndefined();
  });

  it('passes when CONCURRENTLY is after COMMIT', async () => {
    const sql = `BEGIN;
ALTER TABLE users ADD COLUMN bio text;
COMMIT;
CREATE INDEX CONCURRENTLY idx ON users (bio);`;
    const violations = await analyze(sql);
    // The CONCURRENTLY is outside the transaction
    expect(violations.find(v => v.ruleId === 'MP025')).toBeUndefined();
  });

  it('provides safe alternative mentioning transaction removal', async () => {
    const sql = `BEGIN;
CREATE INDEX CONCURRENTLY idx ON users (email);
COMMIT;`;
    const violations = await analyze(sql);
    const v = violations.find(v => v.ruleId === 'MP025');
    expect(v?.safeAlternative).toContain('transaction block');
  });
});
