import { describe, it, expect } from 'vitest';
import { autoFix, isFixable } from '../src/fixer/fix.js';
import { parseMigration } from '../src/parser/parse.js';
import { classifyLock } from '../src/locks/classify.js';
import { allRules, runRules } from '../src/rules/index.js';

async function analyzeAndFix(sql: string, pgVersion = 17) {
  const parsed = await parseMigration(sql);
  const statements = parsed.statements.map((s) => {
    const lock = classifyLock(s.stmt, pgVersion);
    const line = sql.slice(0, s.stmtLocation).split('\n').length;
    return { ...s, lock, line };
  });
  const violations = runRules(allRules, statements, pgVersion);
  return autoFix(sql, violations);
}

describe('isFixable', () => {
  it('returns true for fixable rules', () => {
    expect(isFixable('MP001')).toBe(true);
    expect(isFixable('MP004')).toBe(true);
    expect(isFixable('MP009')).toBe(true);
    expect(isFixable('MP020')).toBe(true);
  });

  it('returns false for non-fixable rules', () => {
    expect(isFixable('MP002')).toBe(false);
    expect(isFixable('MP003')).toBe(false);
    expect(isFixable('MP005')).toBe(false);
    expect(isFixable('MP007')).toBe(false);
    expect(isFixable('MP013')).toBe(false);
  });
});

describe('autoFix', () => {
  it('returns unchanged SQL when no violations', () => {
    const sql = "SET lock_timeout = '5s'; CREATE INDEX CONCURRENTLY idx ON users (email);";
    const result = autoFix(sql, []);
    expect(result.fixedSql).toBe(sql);
    expect(result.fixedCount).toBe(0);
  });

  it('returns unchanged SQL when only unfixable violations', () => {
    const result = autoFix('ALTER TABLE users ALTER COLUMN email TYPE varchar(255);', [
      { ruleId: 'MP007', ruleName: 'no-column-type-change', severity: 'critical', message: 'test', line: 1 },
    ]);
    expect(result.fixedCount).toBe(0);
    expect(result.unfixable).toHaveLength(1);
  });
});

describe('MP001 auto-fix: CREATE INDEX → CONCURRENTLY', () => {
  it('adds CONCURRENTLY to CREATE INDEX', async () => {
    const sql = 'CREATE INDEX idx_email ON users (email);';
    const result = await analyzeAndFix(sql);
    expect(result.fixedSql).toContain('CREATE INDEX CONCURRENTLY');
    expect(result.fixedCount).toBeGreaterThan(0);
  });

  it('adds CONCURRENTLY to CREATE UNIQUE INDEX', async () => {
    const sql = 'CREATE UNIQUE INDEX idx_email ON users (email);';
    const result = await analyzeAndFix(sql);
    expect(result.fixedSql).toContain('CREATE UNIQUE INDEX CONCURRENTLY');
  });

  it('does not double-add CONCURRENTLY', async () => {
    const sql = 'CREATE INDEX CONCURRENTLY idx_email ON users (email);';
    const result = await analyzeAndFix(sql);
    const matches = result.fixedSql.match(/CONCURRENTLY/g);
    expect(matches?.length).toBe(1);
  });
});

describe('MP004 auto-fix: prepend SET lock_timeout', () => {
  it('prepends lock_timeout for ALTER TABLE', async () => {
    const sql = 'ALTER TABLE users ADD COLUMN bio text;';
    const result = await analyzeAndFix(sql);
    expect(result.fixedSql).toContain("SET lock_timeout = '5s';");
    const lines = result.fixedSql.split('\n');
    const lockIdx = lines.findIndex(l => l.includes('lock_timeout'));
    const alterIdx = lines.findIndex(l => l.includes('ALTER TABLE'));
    expect(lockIdx).toBeLessThan(alterIdx);
  });

  it('does not add duplicate lock_timeout', async () => {
    const sql = `SET lock_timeout = '5s';
ALTER TABLE users ADD COLUMN bio text;`;
    const result = await analyzeAndFix(sql);
    const matches = result.fixedSql.match(/lock_timeout/g);
    expect(matches?.length).toBe(1);
  });
});

describe('MP009 auto-fix: DROP INDEX → CONCURRENTLY', () => {
  it('adds CONCURRENTLY to DROP INDEX', async () => {
    const sql = 'DROP INDEX idx_users_email;';
    const result = await analyzeAndFix(sql);
    expect(result.fixedSql).toContain('DROP INDEX CONCURRENTLY');
  });

  it('handles DROP INDEX IF EXISTS', async () => {
    const sql = 'DROP INDEX IF EXISTS idx_users_email;';
    const result = await analyzeAndFix(sql);
    expect(result.fixedSql).toContain('DROP INDEX CONCURRENTLY IF EXISTS');
  });
});

describe('MP020 auto-fix: prepend SET statement_timeout', () => {
  it('prepends statement_timeout for VACUUM FULL', async () => {
    const sql = 'VACUUM FULL users;';
    const result = await analyzeAndFix(sql);
    expect(result.fixedSql).toContain("SET statement_timeout = '30s';");
  });

  it('does not add duplicate statement_timeout', async () => {
    const sql = `SET statement_timeout = '30s';
VACUUM FULL users;`;
    const result = await analyzeAndFix(sql);
    const matches = result.fixedSql.match(/statement_timeout/g);
    expect(matches?.length).toBe(1);
  });
});

describe('mixed violations', () => {
  it('fixes fixable and reports unfixable', async () => {
    const sql = 'CREATE INDEX idx ON users (email);';
    const result = await analyzeAndFix(sql);
    // Should fix MP001 (CONCURRENTLY), MP004 (lock_timeout), MP020 (statement_timeout)
    expect(result.fixedCount).toBeGreaterThanOrEqual(2);
    expect(result.fixedSql).toContain('CONCURRENTLY');
  });

  it('handles multi-statement migrations', async () => {
    const sql = `CREATE INDEX idx_a ON users (email);
ALTER TABLE orders ADD COLUMN total numeric;`;
    const result = await analyzeAndFix(sql);
    expect(result.fixedSql).toContain('CONCURRENTLY');
    expect(result.fixedSql).toContain("lock_timeout");
  });
});
