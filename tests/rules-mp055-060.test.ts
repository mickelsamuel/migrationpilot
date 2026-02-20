import { describe, it, expect } from 'vitest';
import { parseMigration } from '../src/parser/parse.js';
import { classifyLock } from '../src/locks/classify.js';
import { allRules, runRules } from '../src/rules/index.js';

async function analyze(sql: string, pgVersion = 17) {
  const parsed = await parseMigration(sql);
  const statements = parsed.statements.map((s) => {
    const lock = classifyLock(s.stmt, pgVersion);
    const line = sql.slice(0, s.stmtLocation).split('\n').length;
    return { ...s, lock, line };
  });
  return runRules(allRules, statements, pgVersion, undefined, sql);
}

describe('MP055: drop-pk-replica-identity-break', () => {
  it('flags DROP CONSTRAINT on primary key', async () => {
    const violations = await analyze('ALTER TABLE users DROP CONSTRAINT users_pkey;');
    const mp055 = violations.filter(v => v.ruleId === 'MP055');
    expect(mp055.length).toBe(1);
    expect(mp055[0]!.message).toContain('replica');
    expect(mp055[0]!.message).toContain('users_pkey');
  });

  it('does not flag when REPLICA IDENTITY is set', async () => {
    const sql = `ALTER TABLE users REPLICA IDENTITY FULL;
ALTER TABLE users DROP CONSTRAINT users_pkey;`;
    const violations = await analyze(sql);
    const mp055 = violations.filter(v => v.ruleId === 'MP055');
    expect(mp055.length).toBe(0);
  });

  it('does not flag dropping non-PK constraint', async () => {
    const violations = await analyze('ALTER TABLE users DROP CONSTRAINT users_email_check;');
    const mp055 = violations.filter(v => v.ruleId === 'MP055');
    expect(mp055.length).toBe(0);
  });

  it('includes safe alternative with REPLICA IDENTITY', async () => {
    const violations = await analyze('ALTER TABLE orders DROP CONSTRAINT orders_pkey;');
    const mp055 = violations.find(v => v.ruleId === 'MP055');
    expect(mp055?.safeAlternative).toContain('REPLICA IDENTITY');
  });
});

describe('MP056: gin-index-on-jsonb-without-expression', () => {
  it('flags plain GIN index on bare column', async () => {
    const violations = await analyze('CREATE INDEX idx_events_data ON events USING GIN (data);');
    const mp056 = violations.filter(v => v.ruleId === 'MP056');
    expect(mp056.length).toBe(1);
    expect(mp056[0]!.message).toContain('GIN index');
    expect(mp056[0]!.message).toContain('->>');
  });

  it('does not flag GIN with jsonb_path_ops', async () => {
    const violations = await analyze('CREATE INDEX idx_events_data ON events USING GIN (data jsonb_path_ops);');
    const mp056 = violations.filter(v => v.ruleId === 'MP056');
    expect(mp056.length).toBe(0);
  });

  it('does not flag BTREE index', async () => {
    const violations = await analyze('CREATE INDEX idx_users_email ON users (email);');
    const mp056 = violations.filter(v => v.ruleId === 'MP056');
    expect(mp056.length).toBe(0);
  });

  it('does not flag GIN with expression', async () => {
    const violations = await analyze("CREATE INDEX idx_events_status ON events USING GIN ((data->>'status'));");
    const mp056 = violations.filter(v => v.ruleId === 'MP056');
    expect(mp056.length).toBe(0);
  });
});

describe('MP057: rls-enabled-without-policy', () => {
  it('flags ENABLE RLS without CREATE POLICY', async () => {
    const violations = await analyze('ALTER TABLE users ENABLE ROW LEVEL SECURITY;');
    const mp057 = violations.filter(v => v.ruleId === 'MP057');
    expect(mp057.length).toBe(1);
    expect(mp057[0]!.message).toContain('ROW LEVEL SECURITY');
    expect(mp057[0]!.message).toContain('zero rows');
  });

  it('does not flag when CREATE POLICY exists', async () => {
    const sql = `ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_select ON users FOR SELECT USING (true);`;
    const violations = await analyze(sql);
    const mp057 = violations.filter(v => v.ruleId === 'MP057');
    expect(mp057.length).toBe(0);
  });

  it('does not fire on non-RLS ALTER TABLE', async () => {
    const violations = await analyze('ALTER TABLE users ADD COLUMN bio text;');
    const mp057 = violations.filter(v => v.ruleId === 'MP057');
    expect(mp057.length).toBe(0);
  });
});

describe('MP058: multi-alter-table-same-table', () => {
  it('flags multiple ALTER TABLE on same table', async () => {
    const sql = `ALTER TABLE users ADD COLUMN bio text;
ALTER TABLE users ADD COLUMN avatar text;`;
    const violations = await analyze(sql);
    const mp058 = violations.filter(v => v.ruleId === 'MP058');
    expect(mp058.length).toBe(1);
    expect(mp058[0]!.message).toContain('2 separate ALTER TABLE');
    expect(mp058[0]!.message).toContain('users');
  });

  it('does not flag single ALTER TABLE', async () => {
    const violations = await analyze('ALTER TABLE users ADD COLUMN bio text;');
    const mp058 = violations.filter(v => v.ruleId === 'MP058');
    expect(mp058.length).toBe(0);
  });

  it('does not flag ALTER TABLE on different tables', async () => {
    const sql = `ALTER TABLE users ADD COLUMN bio text;
ALTER TABLE orders ADD COLUMN note text;`;
    const violations = await analyze(sql);
    const mp058 = violations.filter(v => v.ruleId === 'MP058');
    expect(mp058.length).toBe(0);
  });

  it('flags 3 ALTER TABLE on same table', async () => {
    const sql = `ALTER TABLE users ADD COLUMN bio text;
ALTER TABLE users ADD COLUMN avatar text;
ALTER TABLE users ALTER COLUMN bio SET NOT NULL;`;
    const violations = await analyze(sql);
    const mp058 = violations.filter(v => v.ruleId === 'MP058');
    expect(mp058.length).toBe(1);
    expect(mp058[0]!.message).toContain('3 separate');
  });
});

describe('MP059: sequence-not-reset-after-data-migration', () => {
  it('flags INSERT with explicit integer IDs', async () => {
    const violations = await analyze("INSERT INTO users (id, name) VALUES (1, 'Alice');");
    const mp059 = violations.filter(v => v.ruleId === 'MP059');
    expect(mp059.length).toBe(1);
    expect(mp059[0]!.message).toContain('sequence');
  });

  it('does not flag when setval is present', async () => {
    const sql = `INSERT INTO users (id, name) VALUES (1, 'Alice');
SELECT setval(pg_get_serial_sequence('users', 'id'), COALESCE(MAX(id), 1)) FROM users;`;
    const violations = await analyze(sql);
    const mp059 = violations.filter(v => v.ruleId === 'MP059');
    expect(mp059.length).toBe(0);
  });

  it('does not flag INSERT without explicit integer IDs', async () => {
    const violations = await analyze("INSERT INTO users (name) VALUES ('Alice');");
    const mp059 = violations.filter(v => v.ruleId === 'MP059');
    expect(mp059.length).toBe(0);
  });
});

describe('MP060: alter-type-rename-value', () => {
  it('flags ALTER TYPE RENAME VALUE', async () => {
    const violations = await analyze("ALTER TYPE status RENAME VALUE 'active' TO 'enabled';");
    const mp060 = violations.filter(v => v.ruleId === 'MP060');
    expect(mp060.length).toBe(1);
    expect(mp060[0]!.message).toContain('logical replication');
  });

  it('does not flag ALTER TYPE ADD VALUE', async () => {
    const violations = await analyze("ALTER TYPE status ADD VALUE 'archived';");
    const mp060 = violations.filter(v => v.ruleId === 'MP060');
    expect(mp060.length).toBe(0);
  });

  it('includes safe alternative with add-migrate-drop', async () => {
    const violations = await analyze("ALTER TYPE role RENAME VALUE 'admin' TO 'superadmin';");
    const mp060 = violations.find(v => v.ruleId === 'MP060');
    expect(mp060?.safeAlternative).toContain('ADD VALUE');
  });
});
