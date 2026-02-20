import { describe, it, expect } from 'vitest';
import { parseMigration } from '../src/parser/parse.js';
import { banDisableTrigger } from '../src/rules/MP064-ban-disable-trigger.js';
import { banLockTable } from '../src/rules/MP065-ban-lock-table.js';
import { warnAutovacuumDisabled } from '../src/rules/MP066-warn-autovacuum-disabled.js';

async function checkRule(rule: typeof banDisableTrigger, sql: string) {
  const { statements } = await parseMigration(sql);
  const stmt = statements[0];
  if (!stmt) return null;
  return rule.check(stmt.stmt, {
    originalSql: stmt.originalSql,
    line: 1,
    pgVersion: 17,
    lock: { lockType: 'ACCESS EXCLUSIVE', blocksReads: true, blocksWrites: true },
    allStatements: statements.map(s => ({ stmt: s.stmt, originalSql: s.originalSql })),
    statementIndex: 0,
  });
}

describe('MP064: ban-disable-trigger', () => {
  it('flags DISABLE TRIGGER ALL', async () => {
    const v = await checkRule(banDisableTrigger, 'ALTER TABLE users DISABLE TRIGGER ALL;');
    expect(v).not.toBeNull();
    expect(v!.ruleId).toBe('MP064');
    expect(v!.message).toContain('ALL');
    expect(v!.message).toContain('users');
  });

  it('flags DISABLE TRIGGER USER', async () => {
    const v = await checkRule(banDisableTrigger, 'ALTER TABLE orders DISABLE TRIGGER USER;');
    expect(v).not.toBeNull();
    expect(v!.message).toContain('USER');
  });

  it('ignores ENABLE TRIGGER ALL', async () => {
    const v = await checkRule(banDisableTrigger, 'ALTER TABLE users ENABLE TRIGGER ALL;');
    expect(v).toBeNull();
  });

  it('ignores regular ALTER TABLE', async () => {
    const v = await checkRule(banDisableTrigger, 'ALTER TABLE users ADD COLUMN age INTEGER;');
    expect(v).toBeNull();
  });
});

describe('MP065: ban-lock-table', () => {
  it('flags LOCK TABLE IN ACCESS EXCLUSIVE MODE', async () => {
    const v = await checkRule(banLockTable, 'LOCK TABLE users IN ACCESS EXCLUSIVE MODE;');
    expect(v).not.toBeNull();
    expect(v!.ruleId).toBe('MP065');
    expect(v!.message).toContain('ACCESS EXCLUSIVE');
    expect(v!.message).toContain('users');
  });

  it('flags LOCK TABLE with no explicit mode', async () => {
    const v = await checkRule(banLockTable, 'LOCK TABLE users;');
    expect(v).not.toBeNull();
    expect(v!.ruleId).toBe('MP065');
  });

  it('flags LOCK TABLE IN SHARE MODE', async () => {
    const v = await checkRule(banLockTable, 'LOCK TABLE users IN SHARE MODE;');
    expect(v).not.toBeNull();
    expect(v!.message).toContain('SHARE');
  });

  it('ignores non-LOCK statements', async () => {
    const v = await checkRule(banLockTable, 'CREATE TABLE users (id INT);');
    expect(v).toBeNull();
  });
});

describe('MP066: warn-autovacuum-disabled', () => {
  it('flags CREATE TABLE WITH (autovacuum_enabled = false)', async () => {
    const v = await checkRule(warnAutovacuumDisabled, 'CREATE TABLE users (id INT) WITH (autovacuum_enabled = false);');
    expect(v).not.toBeNull();
    expect(v!.ruleId).toBe('MP066');
    expect(v!.message).toContain('users');
    expect(v!.message).toContain('autovacuum');
  });

  it('flags ALTER TABLE SET (autovacuum_enabled = false)', async () => {
    const v = await checkRule(warnAutovacuumDisabled, 'ALTER TABLE users SET (autovacuum_enabled = false);');
    expect(v).not.toBeNull();
    expect(v!.ruleId).toBe('MP066');
  });

  it('ignores autovacuum_enabled = true', async () => {
    const v = await checkRule(warnAutovacuumDisabled, 'ALTER TABLE users SET (autovacuum_enabled = true);');
    expect(v).toBeNull();
  });

  it('ignores tables with other storage params', async () => {
    const v = await checkRule(warnAutovacuumDisabled, 'ALTER TABLE users SET (fillfactor = 70);');
    expect(v).toBeNull();
  });

  it('ignores regular CREATE TABLE without options', async () => {
    const v = await checkRule(warnAutovacuumDisabled, 'CREATE TABLE users (id INT);');
    expect(v).toBeNull();
  });
});
