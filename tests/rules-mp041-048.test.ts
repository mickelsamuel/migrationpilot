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

// --- MP041: ban-char-field ---

describe('MP041: ban-char-field', () => {
  it('flags CHAR(n) column in CREATE TABLE', async () => {
    const violations = await analyze('CREATE TABLE users (id bigint PRIMARY KEY, country char(2));');
    const v = violations.find(v => v.ruleId === 'MP041');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('warning');
    expect(v?.message).toContain('country');
    expect(v?.message).toContain('blank-pads');
  });

  it('does not flag TEXT column', async () => {
    const violations = await analyze('CREATE TABLE users (id bigint PRIMARY KEY, name text);');
    expect(violations.find(v => v.ruleId === 'MP041')).toBeUndefined();
  });

  it('does not flag VARCHAR column', async () => {
    // VARCHAR is flagged by MP037, not MP041
    const violations = await analyze('CREATE TABLE users (id bigint PRIMARY KEY, name varchar(255));');
    expect(violations.find(v => v.ruleId === 'MP041')).toBeUndefined();
  });

  it('flags CHAR in ALTER TABLE ADD COLUMN', async () => {
    const violations = await analyze('ALTER TABLE users ADD COLUMN code char(5);');
    const v = violations.find(v => v.ruleId === 'MP041');
    expect(v).toBeDefined();
  });
});

// --- MP042: require-index-name ---

describe('MP042: require-index-name', () => {
  it('flags CREATE INDEX without explicit name', async () => {
    const violations = await analyze('CREATE INDEX ON users (email);');
    const v = violations.find(v => v.ruleId === 'MP042');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('warning');
    expect(v?.message).toContain('without an explicit name');
  });

  it('passes CREATE INDEX with explicit name', async () => {
    const violations = await analyze('CREATE INDEX idx_users_email ON users (email);');
    expect(violations.find(v => v.ruleId === 'MP042')).toBeUndefined();
  });

  it('passes CREATE INDEX CONCURRENTLY with name', async () => {
    const violations = await analyze('CREATE INDEX CONCURRENTLY idx_users_email ON users (email);');
    expect(violations.find(v => v.ruleId === 'MP042')).toBeUndefined();
  });
});

// --- MP043: ban-domain-constraint ---

describe('MP043: ban-domain-constraint', () => {
  it('flags CREATE DOMAIN with CHECK', async () => {
    const violations = await analyze("CREATE DOMAIN positive_int AS integer CHECK (VALUE > 0);");
    const v = violations.find(v => v.ruleId === 'MP043');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('warning');
    expect(v?.message).toContain('domain');
  });

  it('does not flag CREATE DOMAIN without CHECK', async () => {
    const violations = await analyze('CREATE DOMAIN email_addr AS text;');
    expect(violations.find(v => v.ruleId === 'MP043')).toBeUndefined();
  });

  it('provides safe alternative about individual CHECK constraints', async () => {
    const violations = await analyze("CREATE DOMAIN positive_int AS integer CHECK (VALUE > 0);");
    const v = violations.find(v => v.ruleId === 'MP043');
    expect(v?.safeAlternative).toContain('individual columns');
  });
});

// --- MP044: no-data-loss-type-narrowing ---

describe('MP044: no-data-loss-type-narrowing', () => {
  it('flags ALTER COLUMN TYPE to smaller int', async () => {
    const violations = await analyze('ALTER TABLE users ALTER COLUMN age TYPE smallint;');
    const v = violations.find(v => v.ruleId === 'MP044');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('warning');
    expect(v?.message).toContain('data loss');
  });

  it('flags ALTER COLUMN TYPE from potential bigint to integer', async () => {
    const violations = await analyze('ALTER TABLE users ALTER COLUMN id TYPE integer;');
    const v = violations.find(v => v.ruleId === 'MP044');
    expect(v).toBeDefined();
  });

  it('does not flag widening change (int → bigint)', async () => {
    const violations = await analyze('ALTER TABLE users ALTER COLUMN id TYPE bigint;');
    expect(violations.find(v => v.ruleId === 'MP044')).toBeUndefined();
  });

  it('does not flag TEXT type change', async () => {
    const violations = await analyze('ALTER TABLE users ALTER COLUMN name TYPE text;');
    expect(violations.find(v => v.ruleId === 'MP044')).toBeUndefined();
  });

  it('provides safe alternative with verification query', async () => {
    const violations = await analyze('ALTER TABLE users ALTER COLUMN age TYPE smallint;');
    const v = violations.find(v => v.ruleId === 'MP044');
    expect(v?.safeAlternative).toContain('SELECT COUNT');
  });
});

// --- MP045: require-primary-key ---

describe('MP045: require-primary-key', () => {
  it('flags CREATE TABLE without PRIMARY KEY', async () => {
    const violations = await analyze('CREATE TABLE logs (message text, created_at timestamptz);');
    const v = violations.find(v => v.ruleId === 'MP045');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('warning');
    expect(v?.message).toContain('logs');
    expect(v?.message).toContain('primary key');
  });

  it('passes CREATE TABLE with column PK', async () => {
    const violations = await analyze('CREATE TABLE users (id bigint PRIMARY KEY, name text);');
    expect(violations.find(v => v.ruleId === 'MP045')).toBeUndefined();
  });

  it('passes CREATE TABLE with table-level PK', async () => {
    const violations = await analyze('CREATE TABLE users (id bigint, name text, PRIMARY KEY (id));');
    expect(violations.find(v => v.ruleId === 'MP045')).toBeUndefined();
  });

  it('skips temp tables', async () => {
    const violations = await analyze('CREATE TEMP TABLE tmp (data text);');
    expect(violations.find(v => v.ruleId === 'MP045')).toBeUndefined();
  });
});

// --- MP046: require-concurrent-detach-partition ---

describe('MP046: require-concurrent-detach-partition', () => {
  it('flags DETACH PARTITION without CONCURRENTLY on PG 14+', async () => {
    const violations = await analyze('ALTER TABLE measurements DETACH PARTITION measurements_2023;', 14);
    const v = violations.find(v => v.ruleId === 'MP046');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('critical');
    expect(v?.message).toContain('CONCURRENTLY');
  });

  it('does not flag on PG 13 (CONCURRENTLY not available)', async () => {
    const violations = await analyze('ALTER TABLE measurements DETACH PARTITION measurements_2023;', 13);
    expect(violations.find(v => v.ruleId === 'MP046')).toBeUndefined();
  });

  it('provides safe alternative', async () => {
    const violations = await analyze('ALTER TABLE measurements DETACH PARTITION measurements_2023;', 14);
    const v = violations.find(v => v.ruleId === 'MP046');
    expect(v?.safeAlternative).toContain('CONCURRENTLY');
  });
});

// --- MP047: ban-set-logged-unlogged ---

describe('MP047: ban-set-logged-unlogged', () => {
  it('flags SET UNLOGGED', async () => {
    const violations = await analyze('ALTER TABLE users SET UNLOGGED;');
    const v = violations.find(v => v.ruleId === 'MP047');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('critical');
    expect(v?.message).toContain('UNLOGGED');
    expect(v?.message).toContain('rewrites');
  });

  it('flags SET LOGGED', async () => {
    const violations = await analyze('ALTER TABLE staging SET LOGGED;');
    const v = violations.find(v => v.ruleId === 'MP047');
    expect(v).toBeDefined();
    expect(v?.message).toContain('LOGGED');
  });

  it('does not flag regular ALTER TABLE', async () => {
    const violations = await analyze('ALTER TABLE users ADD COLUMN bio text;');
    expect(violations.find(v => v.ruleId === 'MP047')).toBeUndefined();
  });

  it('mentions crash data loss for UNLOGGED', async () => {
    const violations = await analyze('ALTER TABLE users SET UNLOGGED;');
    const v = violations.find(v => v.ruleId === 'MP047');
    expect(v?.message).toContain('crash');
  });
});

// --- MP048: ban-alter-default-volatile-existing ---

describe('MP048: ban-alter-default-volatile-existing', () => {
  it('flags SET DEFAULT now()', async () => {
    const violations = await analyze("ALTER TABLE users ALTER COLUMN created_at SET DEFAULT now();");
    const v = violations.find(v => v.ruleId === 'MP048');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('warning');
    expect(v?.message).toContain('only affects future');
    expect(v?.message).toContain('backfill');
  });

  it('flags SET DEFAULT gen_random_uuid()', async () => {
    const violations = await analyze("ALTER TABLE users ALTER COLUMN id SET DEFAULT gen_random_uuid();");
    const v = violations.find(v => v.ruleId === 'MP048');
    expect(v).toBeDefined();
  });

  it('does not flag SET DEFAULT with static value', async () => {
    const violations = await analyze("ALTER TABLE users ALTER COLUMN status SET DEFAULT 'active';");
    expect(violations.find(v => v.ruleId === 'MP048')).toBeUndefined();
  });

  it('does not flag SET DEFAULT 0', async () => {
    const violations = await analyze('ALTER TABLE users ALTER COLUMN age SET DEFAULT 0;');
    expect(violations.find(v => v.ruleId === 'MP048')).toBeUndefined();
  });

  it('provides safe alternative with backfill', async () => {
    const violations = await analyze("ALTER TABLE users ALTER COLUMN created_at SET DEFAULT now();");
    const v = violations.find(v => v.ruleId === 'MP048');
    expect(v?.safeAlternative).toContain('UPDATE');
    expect(v?.safeAlternative).toContain('batches');
  });
});
