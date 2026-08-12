import { describe, it, expect } from 'vitest';
import { parseMigration } from '../src/parser/parse.js';
import { classifyLock } from '../src/locks/classify.js';
import { allRules, runRules } from '../src/rules/index.js';

async function analyze(sql: string, pgVersion = 17) {
  const parsed = await parseMigration(sql);
  const statements = parsed.statements.map((s) => {
    const lock = classifyLock(s.stmt, pgVersion);
    return { ...s, lock };
  });
  return runRules(allRules, statements, pgVersion, undefined, sql);
}

describe('MP052: warn-dependent-objects', () => {
  it('warns on DROP COLUMN', async () => {
    const violations = await analyze('ALTER TABLE users DROP COLUMN email;');
    const mp052 = violations.filter(v => v.ruleId === 'MP052');
    expect(mp052.length).toBe(1);
    expect(mp052[0]!.message).toContain('email');
    expect(mp052[0]!.message).toContain('views, functions, or triggers');
  });

  it('warns on ALTER COLUMN TYPE', async () => {
    const violations = await analyze('ALTER TABLE users ALTER COLUMN email TYPE varchar(255);');
    const mp052 = violations.filter(v => v.ruleId === 'MP052');
    expect(mp052.length).toBe(1);
    expect(mp052[0]!.message).toContain('type');
  });

  it('does not fire on ADD COLUMN', async () => {
    const violations = await analyze('ALTER TABLE users ADD COLUMN bio text;');
    const mp052 = violations.filter(v => v.ruleId === 'MP052');
    expect(mp052.length).toBe(0);
  });

  it('includes safe alternative with dependency query', async () => {
    const violations = await analyze('ALTER TABLE users DROP COLUMN email;');
    const mp052 = violations.find(v => v.ruleId === 'MP052');
    expect(mp052?.safeAlternative).toContain('pg_depend');
  });

  // ALTER TABLE ... RENAME COLUMN parses as a RenameStmt, not an AlterTableStmt,
  // and the parser labels it with the string 'OBJECT_COLUMN'.
  it('warns on RENAME COLUMN', async () => {
    const violations = await analyze('ALTER TABLE users RENAME COLUMN email TO email_address;');
    const mp052 = violations.filter(v => v.ruleId === 'MP052');
    expect(mp052.length).toBe(1);
    expect(mp052[0]!.message).toContain('email');
    expect(mp052[0]!.message).toContain('email_address');
    expect(mp052[0]!.message).toContain('views, functions, or triggers');
    expect(mp052[0]!.safeAlternative).toContain('multi-step');
  });

  it('does not fire on RENAME TABLE', async () => {
    const violations = await analyze('ALTER TABLE users RENAME TO people;');
    const mp052 = violations.filter(v => v.ruleId === 'MP052');
    expect(mp052.length).toBe(0);
  });

  it('does not fire on RENAME CONSTRAINT', async () => {
    const violations = await analyze('ALTER TABLE users RENAME CONSTRAINT chk_age TO chk_age_positive;');
    const mp052 = violations.filter(v => v.ruleId === 'MP052');
    expect(mp052.length).toBe(0);
  });

  it('does not fire on RENAME INDEX', async () => {
    const violations = await analyze('ALTER INDEX idx_users_email RENAME TO idx_users_email_v2;');
    const mp052 = violations.filter(v => v.ruleId === 'MP052');
    expect(mp052.length).toBe(0);
  });
});

describe('MP053: ban-uncommitted-transaction', () => {
  it('flags BEGIN without COMMIT', async () => {
    const sql = `BEGIN;
ALTER TABLE users ADD COLUMN bio text;`;
    const violations = await analyze(sql);
    const mp053 = violations.filter(v => v.ruleId === 'MP053');
    expect(mp053.length).toBe(1);
    expect(mp053[0]!.message).toContain('BEGIN without a matching COMMIT');
  });

  it('does not flag BEGIN with COMMIT', async () => {
    const sql = `BEGIN;
ALTER TABLE users ADD COLUMN bio text;
COMMIT;`;
    const violations = await analyze(sql);
    const mp053 = violations.filter(v => v.ruleId === 'MP053');
    expect(mp053.length).toBe(0);
  });

  it('does not flag when no BEGIN', async () => {
    const sql = 'ALTER TABLE users ADD COLUMN bio text;';
    const violations = await analyze(sql);
    const mp053 = violations.filter(v => v.ruleId === 'MP053');
    expect(mp053.length).toBe(0);
  });

  it('flags nested unmatched BEGIN', async () => {
    const sql = `BEGIN;
COMMIT;
BEGIN;
ALTER TABLE users ADD COLUMN name text;`;
    const violations = await analyze(sql);
    const mp053 = violations.filter(v => v.ruleId === 'MP053');
    expect(mp053.length).toBe(1);
  });
});

describe('MP054: alter-type-add-value-in-transaction', () => {
  it('flags INSERT after ALTER TYPE ADD VALUE in same transaction', async () => {
    const sql = `BEGIN;
ALTER TYPE status ADD VALUE 'archived';
INSERT INTO events (status) VALUES ('archived');
COMMIT;`;
    const violations = await analyze(sql);
    const mp054 = violations.filter(v => v.ruleId === 'MP054');
    expect(mp054.length).toBe(1);
    expect(mp054[0]!.message).toContain('not visible until COMMIT');
  });

  it('does not flag INSERT in separate transaction', async () => {
    const sql = `ALTER TYPE status ADD VALUE 'archived';
INSERT INTO events (status) VALUES ('archived');`;
    const violations = await analyze(sql);
    const mp054 = violations.filter(v => v.ruleId === 'MP054');
    expect(mp054.length).toBe(0);
  });

  it('does not flag when no ALTER TYPE ADD VALUE', async () => {
    const sql = `BEGIN;
INSERT INTO events (status) VALUES ('active');
COMMIT;`;
    const violations = await analyze(sql);
    const mp054 = violations.filter(v => v.ruleId === 'MP054');
    expect(mp054.length).toBe(0);
  });

  it('flags UPDATE after ALTER TYPE ADD VALUE in same transaction', async () => {
    const sql = `BEGIN;
ALTER TYPE role ADD VALUE 'admin';
UPDATE users SET role = 'admin' WHERE id = 1;
COMMIT;`;
    const violations = await analyze(sql);
    const mp054 = violations.filter(v => v.ruleId === 'MP054');
    expect(mp054.length).toBe(1);
  });
});
