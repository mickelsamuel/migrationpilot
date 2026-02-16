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

// --- MP034: ban-drop-database ---

describe('MP034: ban-drop-database', () => {
  it('flags DROP DATABASE', async () => {
    const violations = await analyze('DROP DATABASE myapp;');
    const v = violations.find(v => v.ruleId === 'MP034');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('critical');
    expect(v?.message).toContain('myapp');
    expect(v?.message).toContain('permanently destroys');
  });

  it('flags DROP DATABASE IF EXISTS', async () => {
    const violations = await analyze('DROP DATABASE IF EXISTS myapp;');
    const v = violations.find(v => v.ruleId === 'MP034');
    expect(v).toBeDefined();
  });

  it('provides safe alternative', async () => {
    const violations = await analyze('DROP DATABASE myapp;');
    const v = violations.find(v => v.ruleId === 'MP034');
    expect(v?.safeAlternative).toContain('never be in a migration');
  });
});

// --- MP035: ban-drop-schema ---

describe('MP035: ban-drop-schema', () => {
  it('flags DROP SCHEMA', async () => {
    const violations = await analyze('DROP SCHEMA analytics;');
    const v = violations.find(v => v.ruleId === 'MP035');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('critical');
    expect(v?.message).toContain('permanently removes');
  });

  it('flags DROP SCHEMA CASCADE with cascade warning', async () => {
    const violations = await analyze('DROP SCHEMA analytics CASCADE;');
    const v = violations.find(v => v.ruleId === 'MP035');
    expect(v).toBeDefined();
    expect(v?.message).toContain('CASCADE');
    expect(v?.message).toContain('ALL objects');
  });

  it('does not flag DROP TABLE', async () => {
    const violations = await analyze('DROP TABLE users;');
    expect(violations.find(v => v.ruleId === 'MP035')).toBeUndefined();
  });

  it('provides safe alternative with verification queries', async () => {
    const violations = await analyze('DROP SCHEMA analytics;');
    const v = violations.find(v => v.ruleId === 'MP035');
    expect(v?.safeAlternative).toContain('information_schema');
  });
});

// --- MP036: ban-truncate-cascade ---

describe('MP036: ban-truncate-cascade', () => {
  it('flags TRUNCATE CASCADE', async () => {
    const violations = await analyze('TRUNCATE orders CASCADE;');
    const v = violations.find(v => v.ruleId === 'MP036');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('critical');
    expect(v?.message).toContain('orders');
    expect(v?.message).toContain('foreign key references');
  });

  it('passes TRUNCATE without CASCADE', async () => {
    const violations = await analyze('TRUNCATE orders;');
    expect(violations.find(v => v.ruleId === 'MP036')).toBeUndefined();
  });

  it('provides safe alternative', async () => {
    const violations = await analyze('TRUNCATE orders CASCADE;');
    const v = violations.find(v => v.ruleId === 'MP036');
    expect(v?.safeAlternative).toContain('dependency order');
  });
});

// --- MP037: prefer-text-over-varchar ---

describe('MP037: prefer-text-over-varchar', () => {
  it('flags VARCHAR column in CREATE TABLE', async () => {
    const violations = await analyze('CREATE TABLE users (id bigint PRIMARY KEY, name varchar(255));');
    const v = violations.find(v => v.ruleId === 'MP037');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('warning');
    expect(v?.message).toContain('name');
    expect(v?.message).toContain('TEXT');
  });

  it('passes TEXT column', async () => {
    const violations = await analyze('CREATE TABLE users (id bigint PRIMARY KEY, name text);');
    expect(violations.find(v => v.ruleId === 'MP037')).toBeUndefined();
  });

  it('flags VARCHAR in ALTER TABLE ADD COLUMN', async () => {
    const violations = await analyze('ALTER TABLE users ADD COLUMN email varchar(320);');
    const v = violations.find(v => v.ruleId === 'MP037');
    expect(v).toBeDefined();
    expect(v?.message).toContain('email');
  });

  it('provides safe alternative with CHECK suggestion', async () => {
    const violations = await analyze('CREATE TABLE users (id bigint PRIMARY KEY, name varchar(255));');
    const v = violations.find(v => v.ruleId === 'MP037');
    expect(v?.safeAlternative).toContain('TEXT');
    expect(v?.safeAlternative).toContain('CHECK');
  });
});

// --- MP038: prefer-bigint-over-int ---

describe('MP038: prefer-bigint-over-int', () => {
  it('flags INT PRIMARY KEY column', async () => {
    const violations = await analyze('CREATE TABLE users (id integer PRIMARY KEY);');
    const v = violations.find(v => v.ruleId === 'MP038');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('warning');
    expect(v?.message).toContain('BIGINT');
  });

  it('passes BIGINT PRIMARY KEY', async () => {
    const violations = await analyze('CREATE TABLE users (id bigint PRIMARY KEY);');
    expect(violations.find(v => v.ruleId === 'MP038')).toBeUndefined();
  });

  it('does not flag non-PK INT column', async () => {
    const violations = await analyze('CREATE TABLE users (id bigint PRIMARY KEY, age integer);');
    expect(violations.find(v => v.ruleId === 'MP038')).toBeUndefined();
  });

  it('skips temp tables', async () => {
    const violations = await analyze('CREATE TEMP TABLE tmp (id integer PRIMARY KEY);');
    expect(violations.find(v => v.ruleId === 'MP038')).toBeUndefined();
  });
});

// --- MP039: prefer-identity-over-serial ---

describe('MP039: prefer-identity-over-serial', () => {
  it('flags SERIAL column on PG 17', async () => {
    const violations = await analyze('CREATE TABLE users (id serial PRIMARY KEY);');
    const v = violations.find(v => v.ruleId === 'MP039');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('warning');
    expect(v?.message).toContain('IDENTITY');
  });

  it('flags BIGSERIAL column', async () => {
    const violations = await analyze('CREATE TABLE users (id bigserial PRIMARY KEY);');
    const v = violations.find(v => v.ruleId === 'MP039');
    expect(v).toBeDefined();
  });

  it('does not flag on PG 9', async () => {
    const violations = await analyze('CREATE TABLE users (id serial PRIMARY KEY);', 9);
    expect(violations.find(v => v.ruleId === 'MP039')).toBeUndefined();
  });

  it('passes GENERATED ALWAYS AS IDENTITY', async () => {
    const violations = await analyze('CREATE TABLE users (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY);');
    expect(violations.find(v => v.ruleId === 'MP039')).toBeUndefined();
  });
});

// --- MP040: prefer-timestamptz ---

describe('MP040: prefer-timestamptz', () => {
  it('flags TIMESTAMP column in CREATE TABLE', async () => {
    const violations = await analyze('CREATE TABLE events (id bigint PRIMARY KEY, created_at timestamp);');
    const v = violations.find(v => v.ruleId === 'MP040');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('warning');
    expect(v?.message).toContain('TIMESTAMPTZ');
  });

  it('passes TIMESTAMPTZ column', async () => {
    const violations = await analyze('CREATE TABLE events (id bigint PRIMARY KEY, created_at timestamptz);');
    expect(violations.find(v => v.ruleId === 'MP040')).toBeUndefined();
  });

  it('flags TIMESTAMP in ADD COLUMN', async () => {
    const violations = await analyze('ALTER TABLE events ADD COLUMN updated_at timestamp;');
    const v = violations.find(v => v.ruleId === 'MP040');
    expect(v).toBeDefined();
    expect(v?.message).toContain('updated_at');
  });
});
