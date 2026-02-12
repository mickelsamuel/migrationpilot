import { describe, it, expect } from 'vitest';
import { parseMigration } from '../src/parser/parse.js';
import { classifyLock } from '../src/locks/classify.js';
import { allRules, runRules } from '../src/rules/index.js';

async function analyze(sql: string, pgVersion = 17) {
  const parsed = await parseMigration(sql);
  expect(parsed.errors).toHaveLength(0);

  const statements = parsed.statements.map((s, i) => {
    const lock = classifyLock(s.stmt, pgVersion);
    const line = sql.slice(0, s.stmtLocation).split('\n').length;
    return { ...s, lock, line };
  });

  return runRules(allRules, statements, pgVersion);
}

describe('MP001: require-concurrent-index', () => {
  it('flags CREATE INDEX without CONCURRENTLY', async () => {
    const violations = await analyze('CREATE INDEX idx ON users (email);');
    expect(violations).toHaveLength(2); // MP001 + MP004 (no lock_timeout)
    expect(violations.find(v => v.ruleId === 'MP001')).toBeDefined();
  });

  it('passes CREATE INDEX CONCURRENTLY', async () => {
    const violations = await analyze('CREATE INDEX CONCURRENTLY idx ON users (email);');
    expect(violations.find(v => v.ruleId === 'MP001')).toBeUndefined();
  });

  it('provides safe alternative', async () => {
    const violations = await analyze('CREATE INDEX idx ON users (email);');
    const v = violations.find(v => v.ruleId === 'MP001');
    expect(v?.safeAlternative).toContain('CONCURRENTLY');
  });
});

describe('MP002: require-check-not-null', () => {
  it('flags SET NOT NULL without CHECK pattern', async () => {
    const violations = await analyze('ALTER TABLE users ALTER COLUMN email SET NOT NULL;');
    expect(violations.find(v => v.ruleId === 'MP002')).toBeDefined();
  });

  it('provides safe alternative with CHECK pattern', async () => {
    const violations = await analyze('ALTER TABLE users ALTER COLUMN email SET NOT NULL;');
    const v = violations.find(v => v.ruleId === 'MP002');
    expect(v?.safeAlternative).toContain('NOT VALID');
    expect(v?.safeAlternative).toContain('VALIDATE CONSTRAINT');
  });
});

describe('MP003: volatile-default-table-rewrite', () => {
  it('flags ADD COLUMN with now() default as critical on PG10', async () => {
    const violations = await analyze(
      "SET lock_timeout = '5s'; ALTER TABLE users ADD COLUMN created_at timestamptz DEFAULT now();",
      10
    );
    const v = violations.find(v => v.ruleId === 'MP003');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('critical');
  });

  it('flags ADD COLUMN with now() default as warning on PG17', async () => {
    const violations = await analyze(
      "SET lock_timeout = '5s'; ALTER TABLE users ADD COLUMN created_at timestamptz DEFAULT now();",
      17
    );
    const v = violations.find(v => v.ruleId === 'MP003');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('warning');
  });

  it('passes ADD COLUMN without default', async () => {
    const violations = await analyze(
      "SET lock_timeout = '5s'; ALTER TABLE users ADD COLUMN email text;"
    );
    expect(violations.find(v => v.ruleId === 'MP003')).toBeUndefined();
  });

  it('passes ADD COLUMN with non-volatile default', async () => {
    const violations = await analyze(
      "SET lock_timeout = '5s'; ALTER TABLE users ADD COLUMN status text DEFAULT 'active';"
    );
    expect(violations.find(v => v.ruleId === 'MP003')).toBeUndefined();
  });

  it('detects gen_random_uuid() as volatile', async () => {
    const violations = await analyze(
      "SET lock_timeout = '5s'; ALTER TABLE users ADD COLUMN id uuid DEFAULT gen_random_uuid();",
      17
    );
    const v = violations.find(v => v.ruleId === 'MP003');
    expect(v).toBeDefined();
  });
});

describe('MP004: require-lock-timeout', () => {
  it('flags DDL without preceding lock_timeout', async () => {
    const violations = await analyze('ALTER TABLE users ADD COLUMN email text;');
    expect(violations.find(v => v.ruleId === 'MP004')).toBeDefined();
  });

  it('passes when lock_timeout is set first', async () => {
    const sql = `SET lock_timeout = '5s';
ALTER TABLE users ADD COLUMN email text;`;
    const violations = await analyze(sql);
    expect(violations.find(v => v.ruleId === 'MP004')).toBeUndefined();
  });

  it('does not flag CREATE TABLE (new table, no contention)', async () => {
    const violations = await analyze('CREATE TABLE orders (id serial PRIMARY KEY);');
    expect(violations.find(v => v.ruleId === 'MP004')).toBeUndefined();
  });

  it('does not flag CREATE INDEX CONCURRENTLY (takes SUE lock)', async () => {
    const violations = await analyze('CREATE INDEX CONCURRENTLY idx ON users (email);');
    expect(violations.find(v => v.ruleId === 'MP004')).toBeUndefined();
  });

  it('does not flag SET statements themselves', async () => {
    const violations = await analyze("SET lock_timeout = '5s';");
    expect(violations.find(v => v.ruleId === 'MP004')).toBeUndefined();
  });
});

describe('MP005: require-not-valid-foreign-key', () => {
  it('flags FK without NOT VALID', async () => {
    const sql = `SET lock_timeout = '5s';
ALTER TABLE orders ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users (id);`;
    const violations = await analyze(sql);
    const v = violations.find(v => v.ruleId === 'MP005');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('critical');
  });

  it('passes FK with NOT VALID', async () => {
    const sql = `SET lock_timeout = '5s';
ALTER TABLE orders ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users (id) NOT VALID;`;
    const violations = await analyze(sql);
    expect(violations.find(v => v.ruleId === 'MP005')).toBeUndefined();
  });

  it('provides safe alternative with NOT VALID + VALIDATE', async () => {
    const sql = `SET lock_timeout = '5s';
ALTER TABLE orders ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users (id);`;
    const violations = await analyze(sql);
    const v = violations.find(v => v.ruleId === 'MP005');
    expect(v?.safeAlternative).toContain('NOT VALID');
    expect(v?.safeAlternative).toContain('VALIDATE CONSTRAINT');
  });

  it('ignores non-FK constraints', async () => {
    const sql = `SET lock_timeout = '5s';
ALTER TABLE users ADD CONSTRAINT chk_age CHECK (age > 0);`;
    const violations = await analyze(sql);
    expect(violations.find(v => v.ruleId === 'MP005')).toBeUndefined();
  });
});

describe('MP006: no-vacuum-full', () => {
  it('flags VACUUM FULL', async () => {
    const violations = await analyze('VACUUM FULL users;');
    const v = violations.find(v => v.ruleId === 'MP006');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('critical');
  });

  it('passes regular VACUUM', async () => {
    const violations = await analyze('VACUUM users;');
    expect(violations.find(v => v.ruleId === 'MP006')).toBeUndefined();
  });

  it('provides pg_repack alternative', async () => {
    const violations = await analyze('VACUUM FULL users;');
    const v = violations.find(v => v.ruleId === 'MP006');
    expect(v?.safeAlternative).toBeDefined();
  });
});

describe('MP007: no-column-type-change', () => {
  it('flags ALTER COLUMN TYPE', async () => {
    const violations = await analyze('ALTER TABLE users ALTER COLUMN email TYPE varchar(255);');
    expect(violations.find(v => v.ruleId === 'MP007')).toBeDefined();
  });

  it('provides expand-contract alternative', async () => {
    const violations = await analyze('ALTER TABLE users ALTER COLUMN email TYPE varchar(255);');
    const v = violations.find(v => v.ruleId === 'MP007');
    expect(v?.safeAlternative).toContain('expand-contract');
  });
});

describe('MP008: no-multi-ddl-transaction', () => {
  it('flags multiple DDL in BEGIN...COMMIT', async () => {
    const sql = `BEGIN;
ALTER TABLE users ADD COLUMN a text;
ALTER TABLE users ADD COLUMN b text;
COMMIT;`;
    const violations = await analyze(sql);
    const v = violations.find(v => v.ruleId === 'MP008');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('critical');
  });

  it('passes single DDL in transaction', async () => {
    const sql = `BEGIN;
ALTER TABLE users ADD COLUMN a text;
COMMIT;`;
    const violations = await analyze(sql);
    expect(violations.find(v => v.ruleId === 'MP008')).toBeUndefined();
  });

  it('passes DDL outside transaction', async () => {
    const violations = await analyze('ALTER TABLE users ADD COLUMN a text;');
    expect(violations.find(v => v.ruleId === 'MP008')).toBeUndefined();
  });
});

describe('Integration: safe migration produces zero violations', () => {
  it('SET lock_timeout + CREATE INDEX CONCURRENTLY = clean', async () => {
    const sql = `SET lock_timeout = '5s'; CREATE INDEX CONCURRENTLY idx_users_email ON users (email);`;
    const violations = await analyze(sql);
    expect(violations).toHaveLength(0);
  });

  it('CREATE TABLE has no violations', async () => {
    const violations = await analyze('CREATE TABLE orders (id serial PRIMARY KEY, total numeric);');
    expect(violations).toHaveLength(0);
  });
});
