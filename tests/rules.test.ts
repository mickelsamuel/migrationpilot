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

describe('MP001: require-concurrent-index', () => {
  it('flags CREATE INDEX without CONCURRENTLY', async () => {
    const violations = await analyze('CREATE INDEX idx ON users (email);');
    expect(violations.find(v => v.ruleId === 'MP001')).toBeDefined();
    expect(violations.find(v => v.ruleId === 'MP004')).toBeDefined(); // no lock_timeout
    expect(violations.find(v => v.ruleId === 'MP020')).toBeDefined(); // no statement_timeout
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

describe('MP009: require-drop-index-concurrently', () => {
  it('flags DROP INDEX without CONCURRENTLY', async () => {
    const violations = await analyze('DROP INDEX idx_users_email;');
    const v = violations.find(v => v.ruleId === 'MP009');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('warning');
  });

  it('passes DROP INDEX CONCURRENTLY', async () => {
    const violations = await analyze('DROP INDEX CONCURRENTLY idx_users_email;');
    expect(violations.find(v => v.ruleId === 'MP009')).toBeUndefined();
  });

  it('provides safe alternative with CONCURRENTLY', async () => {
    const violations = await analyze('DROP INDEX idx_users_email;');
    const v = violations.find(v => v.ruleId === 'MP009');
    expect(v?.safeAlternative).toContain('CONCURRENTLY');
  });

  it('does not flag DROP TABLE', async () => {
    const violations = await analyze('DROP TABLE users;');
    expect(violations.find(v => v.ruleId === 'MP009')).toBeUndefined();
  });
});

describe('MP010: no-rename-column', () => {
  it('flags RENAME COLUMN', async () => {
    const violations = await analyze('ALTER TABLE users RENAME COLUMN email TO email_address;');
    const v = violations.find(v => v.ruleId === 'MP010');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('warning');
    expect(v?.message).toContain('email');
    expect(v?.message).toContain('email_address');
  });

  it('provides safe alternative with expand-contract', async () => {
    const violations = await analyze('ALTER TABLE users RENAME COLUMN email TO email_address;');
    const v = violations.find(v => v.ruleId === 'MP010');
    expect(v?.safeAlternative).toContain('ADD COLUMN');
    expect(v?.safeAlternative).toContain('DROP COLUMN');
  });

  it('does not flag RENAME TABLE', async () => {
    const violations = await analyze('ALTER TABLE users RENAME TO customers;');
    expect(violations.find(v => v.ruleId === 'MP010')).toBeUndefined();
  });
});

describe('MP011: unbatched-data-backfill', () => {
  it('flags UPDATE without WHERE clause', async () => {
    const violations = await analyze("UPDATE users SET status = 'active';");
    const v = violations.find(v => v.ruleId === 'MP011');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('warning');
  });

  it('passes UPDATE with WHERE clause', async () => {
    const violations = await analyze("UPDATE users SET status = 'active' WHERE status IS NULL;");
    expect(violations.find(v => v.ruleId === 'MP011')).toBeUndefined();
  });

  it('provides batched alternative', async () => {
    const violations = await analyze("UPDATE users SET status = 'active';");
    const v = violations.find(v => v.ruleId === 'MP011');
    expect(v?.safeAlternative).toContain('batch');
  });
});

describe('MP012: no-enum-add-value-in-transaction', () => {
  it('flags ALTER TYPE ADD VALUE in transaction on PG < 12', async () => {
    const sql = `BEGIN;
ALTER TYPE status_type ADD VALUE 'archived';
COMMIT;`;
    const violations = await analyze(sql, 11);
    const v = violations.find(v => v.ruleId === 'MP012');
    expect(v).toBeDefined();
    expect(v?.message).toContain('will fail');
  });

  it('warns ALTER TYPE ADD VALUE in transaction on PG 12+', async () => {
    const sql = `BEGIN;
ALTER TYPE status_type ADD VALUE 'archived';
COMMIT;`;
    const violations = await analyze(sql, 17);
    const v = violations.find(v => v.ruleId === 'MP012');
    expect(v).toBeDefined();
    expect(v?.message).toContain('ACCESS EXCLUSIVE');
  });

  it('passes ALTER TYPE ADD VALUE outside transaction', async () => {
    const violations = await analyze("ALTER TYPE status_type ADD VALUE 'archived';");
    expect(violations.find(v => v.ruleId === 'MP012')).toBeUndefined();
  });
});

describe('MP013: high-traffic-table-ddl (production context)', () => {
  const highTrafficCtx: ProductionContext = {
    tableStats: new Map([['users', { tableName: 'users', rowCount: 100000, totalBytes: 50_000_000, indexCount: 3 }]]),
    affectedQueries: new Map([['users', [
      { queryId: '1', normalizedQuery: 'SELECT * FROM users WHERE id = $1', calls: 50000, meanExecTime: 1.2 },
      { queryId: '2', normalizedQuery: 'UPDATE users SET last_login = $1 WHERE id = $2', calls: 20000, meanExecTime: 2.5 },
    ]]]),
    activeConnections: new Map([['users', 5]]),
  };

  it('flags DDL on high-traffic table when context available', async () => {
    const violations = await analyze(
      "SET lock_timeout = '5s'; ALTER TABLE users ADD COLUMN bio text;",
      17,
      highTrafficCtx
    );
    const v = violations.find(v => v.ruleId === 'MP013');
    expect(v).toBeDefined();
    expect(v?.message).toContain('70,000');
  });

  it('does not fire without production context', async () => {
    const violations = await analyze(
      "SET lock_timeout = '5s'; ALTER TABLE users ADD COLUMN bio text;"
    );
    expect(violations.find(v => v.ruleId === 'MP013')).toBeUndefined();
  });

  it('does not fire for low-traffic tables', async () => {
    const lowTrafficCtx: ProductionContext = {
      tableStats: new Map([['users', { tableName: 'users', rowCount: 100, totalBytes: 8192, indexCount: 1 }]]),
      affectedQueries: new Map([['users', [
        { queryId: '1', normalizedQuery: 'SELECT * FROM users', calls: 50, meanExecTime: 0.5 },
      ]]]),
      activeConnections: new Map(),
    };
    const violations = await analyze(
      "SET lock_timeout = '5s'; ALTER TABLE users ADD COLUMN bio text;",
      17,
      lowTrafficCtx
    );
    expect(violations.find(v => v.ruleId === 'MP013')).toBeUndefined();
  });
});

describe('MP014: large-table-ddl (production context)', () => {
  const largeTableCtx: ProductionContext = {
    tableStats: new Map([['orders', { tableName: 'orders', rowCount: 5_000_000, totalBytes: 2_000_000_000, indexCount: 8 }]]),
    affectedQueries: new Map(),
    activeConnections: new Map(),
  };

  it('flags long-held lock on large table when context available', async () => {
    const violations = await analyze(
      "SET lock_timeout = '5s'; ALTER TABLE orders ALTER COLUMN total TYPE numeric(12,2);",
      17,
      largeTableCtx
    );
    const v = violations.find(v => v.ruleId === 'MP014');
    expect(v).toBeDefined();
    expect(v?.message).toContain('5,000,000');
    expect(v?.message).toContain('2.0 GB');
  });

  it('does not fire without production context', async () => {
    const violations = await analyze(
      "SET lock_timeout = '5s'; ALTER TABLE orders ALTER COLUMN total TYPE numeric(12,2);"
    );
    expect(violations.find(v => v.ruleId === 'MP014')).toBeUndefined();
  });

  it('does not fire for small tables', async () => {
    const smallCtx: ProductionContext = {
      tableStats: new Map([['orders', { tableName: 'orders', rowCount: 500, totalBytes: 40960, indexCount: 2 }]]),
      affectedQueries: new Map(),
      activeConnections: new Map(),
    };
    const violations = await analyze(
      "SET lock_timeout = '5s'; ALTER TABLE orders ALTER COLUMN total TYPE numeric(12,2);",
      17,
      smallCtx
    );
    expect(violations.find(v => v.ruleId === 'MP014')).toBeUndefined();
  });

  it('does not fire for brief locks', async () => {
    const violations = await analyze(
      "SET lock_timeout = '5s'; ALTER TABLE orders ADD COLUMN note text;",
      17,
      largeTableCtx
    );
    // ADD COLUMN without default is brief (longHeld: false) on PG11+
    expect(violations.find(v => v.ruleId === 'MP014')).toBeUndefined();
  });
});

describe('Rule metadata: whyItMatters and docsUrl', () => {
  it('every rule has whyItMatters with at least 20 characters', () => {
    for (const rule of allRules) {
      expect(rule.whyItMatters, `${rule.id} missing whyItMatters`).toBeDefined();
      expect(rule.whyItMatters.length, `${rule.id} whyItMatters too short`).toBeGreaterThanOrEqual(20);
    }
  });

  it('every rule has a valid docsUrl matching the pattern', () => {
    for (const rule of allRules) {
      expect(rule.docsUrl, `${rule.id} missing docsUrl`).toBeDefined();
      expect(rule.docsUrl, `${rule.id} docsUrl wrong format`).toMatch(
        /^https:\/\/migrationpilot\.dev\/rules\/mp\d{3}$/
      );
    }
  });

  it('docsUrl matches the rule ID', () => {
    for (const rule of allRules) {
      const expected = `https://migrationpilot.dev/rules/${rule.id.toLowerCase()}`;
      expect(rule.docsUrl, `${rule.id} docsUrl mismatch`).toBe(expected);
    }
  });
});

describe('Integration: safe migration produces zero violations', () => {
  it('SET lock_timeout + CREATE INDEX CONCURRENTLY IF NOT EXISTS = clean', async () => {
    const sql = `SET lock_timeout = '5s'; CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email ON users (email);`;
    const violations = await analyze(sql);
    expect(violations).toHaveLength(0);
  });

  it('CREATE TABLE IF NOT EXISTS has no violations', async () => {
    const violations = await analyze('CREATE TABLE IF NOT EXISTS orders (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, total numeric);');
    expect(violations).toHaveLength(0);
  });
});
