import { describe, it, expect } from 'vitest';
import { parseMigration } from '../src/parser/parse.js';
import { classifyLock } from '../src/locks/classify.js';
import { allRules, runRules } from '../src/rules/index.js';
import type { ProductionContext } from '../src/production/context.js';

async function analyze(sql: string, pgVersion = 17, prodCtx?: ProductionContext) {
  const parsed = await parseMigration(sql);
  expect(parsed.errors).toHaveLength(0);

  const statements = parsed.statements.map((s) => {
    const lock = classifyLock(s.stmt, pgVersion);
    const line = sql.slice(0, s.stmtLocation).split('\n').length;
    return { ...s, lock, line };
  });

  return runRules(allRules, statements, pgVersion, prodCtx);
}

describe('MP015: no-add-column-serial', () => {
  it('flags ADD COLUMN with SERIAL type', async () => {
    const sql = "SET lock_timeout = '5s'; ALTER TABLE users ADD COLUMN id serial;";
    const violations = await analyze(sql);
    const v = violations.find(v => v.ruleId === 'MP015');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('warning');
    expect(v?.message).toContain('SERIAL');
    expect(v?.message).toContain('implicit sequence');
  });

  it('flags ADD COLUMN with BIGSERIAL type', async () => {
    const sql = "SET lock_timeout = '5s'; ALTER TABLE orders ADD COLUMN order_id bigserial;";
    const violations = await analyze(sql);
    const v = violations.find(v => v.ruleId === 'MP015');
    expect(v).toBeDefined();
    expect(v?.message).toContain('BIGSERIAL');
  });

  it('flags ADD COLUMN with SMALLSERIAL type', async () => {
    const sql = "SET lock_timeout = '5s'; ALTER TABLE logs ADD COLUMN log_id smallserial;";
    const violations = await analyze(sql);
    const v = violations.find(v => v.ruleId === 'MP015');
    expect(v).toBeDefined();
  });

  it('passes ADD COLUMN with INTEGER type', async () => {
    const sql = "SET lock_timeout = '5s'; ALTER TABLE users ADD COLUMN count integer;";
    const violations = await analyze(sql);
    expect(violations.find(v => v.ruleId === 'MP015')).toBeUndefined();
  });

  it('passes ADD COLUMN with TEXT type', async () => {
    const sql = "SET lock_timeout = '5s'; ALTER TABLE users ADD COLUMN name text;";
    const violations = await analyze(sql);
    expect(violations.find(v => v.ruleId === 'MP015')).toBeUndefined();
  });

  it('provides safe alternative with IDENTITY on PG 10+', async () => {
    const sql = "SET lock_timeout = '5s'; ALTER TABLE users ADD COLUMN id serial;";
    const violations = await analyze(sql);
    const v = violations.find(v => v.ruleId === 'MP015');
    expect(v?.safeAlternative).toContain('GENERATED ALWAYS AS IDENTITY');
  });

  it('provides safe alternative with sequence steps on PG 9', async () => {
    const sql = "SET lock_timeout = '5s'; ALTER TABLE users ADD COLUMN id serial;";
    const violations = await analyze(sql, 9);
    const v = violations.find(v => v.ruleId === 'MP015');
    expect(v?.safeAlternative).toContain('CREATE SEQUENCE');
    expect(v?.safeAlternative).toContain('nextval');
  });
});

describe('MP016: require-index-on-fk', () => {
  it('flags FK without an accompanying index', async () => {
    const sql = "SET lock_timeout = '5s'; ALTER TABLE orders ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users (id) NOT VALID;";
    const violations = await analyze(sql);
    const v = violations.find(v => v.ruleId === 'MP016');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('warning');
    expect(v?.message).toContain('user_id');
    expect(v?.message).toContain('no matching index');
  });

  it('passes when CREATE INDEX on FK column exists in same migration', async () => {
    const sql = `SET lock_timeout = '5s';
CREATE INDEX idx_orders_user_id ON orders (user_id);
ALTER TABLE orders ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users (id) NOT VALID;`;
    const violations = await analyze(sql);
    expect(violations.find(v => v.ruleId === 'MP016')).toBeUndefined();
  });

  it('passes when CONCURRENTLY index on FK column exists', async () => {
    const sql = `CREATE INDEX CONCURRENTLY idx_orders_user_id ON orders (user_id);
SET lock_timeout = '5s';
ALTER TABLE orders ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users (id) NOT VALID;`;
    const violations = await analyze(sql);
    expect(violations.find(v => v.ruleId === 'MP016')).toBeUndefined();
  });

  it('provides safe alternative with CONCURRENTLY index', async () => {
    const sql = "SET lock_timeout = '5s'; ALTER TABLE orders ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users (id) NOT VALID;";
    const violations = await analyze(sql);
    const v = violations.find(v => v.ruleId === 'MP016');
    expect(v?.safeAlternative).toContain('CONCURRENTLY');
    expect(v?.safeAlternative).toContain('user_id');
  });

  it('ignores non-FK constraints', async () => {
    const sql = "SET lock_timeout = '5s'; ALTER TABLE users ADD CONSTRAINT chk_age CHECK (age > 0);";
    const violations = await analyze(sql);
    expect(violations.find(v => v.ruleId === 'MP016')).toBeUndefined();
  });
});

describe('MP017: no-drop-column', () => {
  it('flags DROP COLUMN', async () => {
    const sql = "SET lock_timeout = '5s'; ALTER TABLE users DROP COLUMN email;";
    const violations = await analyze(sql);
    const v = violations.find(v => v.ruleId === 'MP017');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('warning');
    expect(v?.message).toContain('email');
    expect(v?.message).toContain('ACCESS EXCLUSIVE');
  });

  it('provides safe multi-deploy alternative', async () => {
    const sql = "SET lock_timeout = '5s'; ALTER TABLE users DROP COLUMN email;";
    const violations = await analyze(sql);
    const v = violations.find(v => v.ruleId === 'MP017');
    expect(v?.safeAlternative).toContain('Deploy 1');
    expect(v?.safeAlternative).toContain('Deploy 2');
    expect(v?.safeAlternative).toContain('lock_timeout');
  });

  it('does not flag ADD COLUMN', async () => {
    const sql = "SET lock_timeout = '5s'; ALTER TABLE users ADD COLUMN bio text;";
    const violations = await analyze(sql);
    expect(violations.find(v => v.ruleId === 'MP017')).toBeUndefined();
  });
});

describe('MP018: no-force-set-not-null', () => {
  it('flags SET NOT NULL without preceding CHECK', async () => {
    const sql = "SET lock_timeout = '5s'; ALTER TABLE users ALTER COLUMN email SET NOT NULL;";
    const violations = await analyze(sql);
    const v = violations.find(v => v.ruleId === 'MP018');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('warning');
    expect(v?.message).toContain('email');
    expect(v?.message).toContain('scans the entire table');
  });

  it('provides PG 12+ safe alternative with CHECK pattern', async () => {
    const sql = "SET lock_timeout = '5s'; ALTER TABLE users ALTER COLUMN email SET NOT NULL;";
    const violations = await analyze(sql, 17);
    const v = violations.find(v => v.ruleId === 'MP018');
    expect(v?.safeAlternative).toContain('NOT VALID');
    expect(v?.safeAlternative).toContain('VALIDATE CONSTRAINT');
    expect(v?.safeAlternative).toContain('IS NOT NULL');
  });

  it('provides lock_timeout alternative for PG < 12', async () => {
    const sql = "SET lock_timeout = '5s'; ALTER TABLE users ALTER COLUMN email SET NOT NULL;";
    const violations = await analyze(sql, 11);
    const v = violations.find(v => v.ruleId === 'MP018');
    expect(v?.safeAlternative).toContain('lock_timeout');
    expect(v?.safeAlternative).not.toContain('NOT VALID');
  });

  it('does not flag SET DEFAULT', async () => {
    const sql = "SET lock_timeout = '5s'; ALTER TABLE users ALTER COLUMN status SET DEFAULT 'active';";
    const violations = await analyze(sql);
    expect(violations.find(v => v.ruleId === 'MP018')).toBeUndefined();
  });
});

describe('MP019: no-exclusive-lock-high-connections (production context)', () => {
  const highConnCtx: ProductionContext = {
    tableStats: new Map([['users', { tableName: 'users', rowCount: 100000, totalBytes: 50_000_000, indexCount: 3 }]]),
    affectedQueries: new Map(),
    activeConnections: new Map([['users', 50]]),
  };

  it('flags ACCESS EXCLUSIVE with high active connections', async () => {
    const violations = await analyze(
      "SET lock_timeout = '5s'; ALTER TABLE users ADD COLUMN bio text;",
      17,
      highConnCtx
    );
    const v = violations.find(v => v.ruleId === 'MP019');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('warning');
    expect(v?.message).toContain('50 active connections');
  });

  it('does not fire without production context', async () => {
    const violations = await analyze(
      "SET lock_timeout = '5s'; ALTER TABLE users ADD COLUMN bio text;"
    );
    expect(violations.find(v => v.ruleId === 'MP019')).toBeUndefined();
  });

  it('does not fire for low connection count', async () => {
    const lowConnCtx: ProductionContext = {
      tableStats: new Map([['users', { tableName: 'users', rowCount: 100, totalBytes: 8192, indexCount: 1 }]]),
      affectedQueries: new Map(),
      activeConnections: new Map([['users', 3]]),
    };
    const violations = await analyze(
      "SET lock_timeout = '5s'; ALTER TABLE users ADD COLUMN bio text;",
      17,
      lowConnCtx
    );
    expect(violations.find(v => v.ruleId === 'MP019')).toBeUndefined();
  });

  it('does not fire for CREATE TABLE', async () => {
    const violations = await analyze(
      'CREATE TABLE users (id serial PRIMARY KEY);',
      17,
      highConnCtx
    );
    expect(violations.find(v => v.ruleId === 'MP019')).toBeUndefined();
  });

  it('provides low-traffic window alternative', async () => {
    const violations = await analyze(
      "SET lock_timeout = '5s'; ALTER TABLE users ADD COLUMN bio text;",
      17,
      highConnCtx
    );
    const v = violations.find(v => v.ruleId === 'MP019');
    expect(v?.safeAlternative).toContain('low-traffic');
    expect(v?.safeAlternative).toContain('lock_timeout');
  });
});

describe('MP020: require-statement-timeout', () => {
  it('flags VACUUM FULL without statement_timeout', async () => {
    const violations = await analyze('VACUUM FULL users;');
    const v = violations.find(v => v.ruleId === 'MP020');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('warning');
    expect(v?.message).toContain('statement_timeout');
  });

  it('flags CLUSTER without statement_timeout', async () => {
    const violations = await analyze('CLUSTER users USING idx_users_email;');
    const v = violations.find(v => v.ruleId === 'MP020');
    expect(v).toBeDefined();
  });

  it('flags REINDEX without statement_timeout', async () => {
    const violations = await analyze('REINDEX INDEX idx_users_email;');
    const v = violations.find(v => v.ruleId === 'MP020');
    expect(v).toBeDefined();
  });

  it('flags non-concurrent CREATE INDEX without statement_timeout', async () => {
    const violations = await analyze('CREATE INDEX idx ON users (email);');
    const v = violations.find(v => v.ruleId === 'MP020');
    expect(v).toBeDefined();
  });

  it('passes when statement_timeout is set', async () => {
    const sql = `SET statement_timeout = '30s';
VACUUM FULL users;`;
    const violations = await analyze(sql);
    expect(violations.find(v => v.ruleId === 'MP020')).toBeUndefined();
  });

  it('does not flag CREATE INDEX CONCURRENTLY (no long lock)', async () => {
    const violations = await analyze('CREATE INDEX CONCURRENTLY idx ON users (email);');
    expect(violations.find(v => v.ruleId === 'MP020')).toBeUndefined();
  });

  it('provides statement_timeout alternative', async () => {
    const violations = await analyze('VACUUM FULL users;');
    const v = violations.find(v => v.ruleId === 'MP020');
    expect(v?.safeAlternative).toContain('statement_timeout');
  });

  it('flags SET NOT NULL without statement_timeout', async () => {
    const sql = "SET lock_timeout = '5s'; ALTER TABLE users ALTER COLUMN email SET NOT NULL;";
    const violations = await analyze(sql);
    const v = violations.find(v => v.ruleId === 'MP020');
    expect(v).toBeDefined();
  });

  it('passes SET NOT NULL when statement_timeout set', async () => {
    const sql = `SET statement_timeout = '30s';
SET lock_timeout = '5s';
ALTER TABLE users ALTER COLUMN email SET NOT NULL;`;
    const violations = await analyze(sql);
    expect(violations.find(v => v.ruleId === 'MP020')).toBeUndefined();
  });
});
