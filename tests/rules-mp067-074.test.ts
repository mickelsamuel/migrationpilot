import { describe, it, expect } from 'vitest';
import { parseMigration } from '../src/parser/parse.js';
import { warnBackfillNoBatching } from '../src/rules/MP067-warn-backfill-no-batching.js';
import { warnIntegerPkCapacity } from '../src/rules/MP068-warn-integer-pk-capacity.js';
import { warnFkLockBothTables } from '../src/rules/MP069-warn-fk-lock-both-tables.js';
import { warnConcurrentIndexInvalid } from '../src/rules/MP070-warn-concurrent-index-invalid.js';
import { banRenameInUseColumn } from '../src/rules/MP071-ban-rename-in-use-column.js';
import { warnPartitionDefaultScan } from '../src/rules/MP072-warn-partition-default-scan.js';
import { banSuperuserRole } from '../src/rules/MP073-ban-superuser-role.js';
import { requireDeferrableFk } from '../src/rules/MP074-require-deferrable-fk.js';
import type { Rule } from '../src/rules/engine.js';

async function checkRule(rule: Rule, sql: string, pgVersion = 17) {
  const { statements } = await parseMigration(sql);
  const results = [];
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i]!;
    const v = rule.check(stmt.stmt, {
      originalSql: stmt.originalSql,
      line: 1,
      pgVersion,
      lock: { lockType: 'ACCESS EXCLUSIVE', blocksReads: true, blocksWrites: true },
      allStatements: statements.map(s => ({ stmt: s.stmt, originalSql: s.originalSql })),
      statementIndex: i,
    });
    if (v) results.push(v);
  }
  return results.length === 1 ? results[0] : results.length === 0 ? null : results;
}

describe('MP067: warn-backfill-no-batching', () => {
  it('flags DELETE without WHERE clause', async () => {
    const v = await checkRule(warnBackfillNoBatching, 'DELETE FROM users;');
    expect(v).not.toBeNull();
    expect(v!.ruleId).toBe('MP067');
    expect(v!.message).toContain('users');
    expect(v!.message).toContain('DELETE');
  });

  it('ignores DELETE with WHERE clause', async () => {
    const v = await checkRule(warnBackfillNoBatching, 'DELETE FROM users WHERE id > 100;');
    expect(v).toBeNull();
  });

  it('ignores UPDATE statements (handled by MP011)', async () => {
    const v = await checkRule(warnBackfillNoBatching, 'UPDATE users SET name = \'test\';');
    expect(v).toBeNull();
  });

  it('ignores non-DML statements', async () => {
    const v = await checkRule(warnBackfillNoBatching, 'CREATE TABLE users (id INT);');
    expect(v).toBeNull();
  });
});

describe('MP068: warn-integer-pk-capacity', () => {
  it('flags CREATE SEQUENCE AS integer', async () => {
    const v = await checkRule(warnIntegerPkCapacity, 'CREATE SEQUENCE user_id_seq AS integer;');
    expect(v).not.toBeNull();
    expect(v!.ruleId).toBe('MP068');
    expect(v!.message).toContain('user_id_seq');
  });

  it('flags CREATE SEQUENCE AS smallint', async () => {
    const v = await checkRule(warnIntegerPkCapacity, 'CREATE SEQUENCE counter_seq AS smallint;');
    expect(v).not.toBeNull();
    expect(v!.ruleId).toBe('MP068');
  });

  it('ignores CREATE SEQUENCE AS bigint', async () => {
    const v = await checkRule(warnIntegerPkCapacity, 'CREATE SEQUENCE user_id_seq AS bigint;');
    expect(v).toBeNull();
  });

  it('ignores CREATE SEQUENCE without type spec', async () => {
    const v = await checkRule(warnIntegerPkCapacity, 'CREATE SEQUENCE user_id_seq;');
    expect(v).toBeNull();
  });
});

describe('MP069: warn-fk-lock-both-tables', () => {
  it('flags FK creation locking both tables', async () => {
    const v = await checkRule(warnFkLockBothTables, 'ALTER TABLE orders ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users (id);');
    expect(v).not.toBeNull();
    expect(v!.ruleId).toBe('MP069');
    expect(v!.message).toContain('orders');
    expect(v!.message).toContain('users');
  });

  it('still warns with NOT VALID (dual lock still happens)', async () => {
    const v = await checkRule(warnFkLockBothTables, 'ALTER TABLE orders ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users (id) NOT VALID;');
    expect(v).not.toBeNull();
    expect(v!.ruleId).toBe('MP069');
  });

  it('ignores non-FK constraints', async () => {
    const v = await checkRule(warnFkLockBothTables, 'ALTER TABLE users ADD CONSTRAINT chk_age CHECK (age > 0);');
    expect(v).toBeNull();
  });
});

describe('MP070: warn-concurrent-index-invalid', () => {
  it('flags CONCURRENTLY without preceding DROP IF EXISTS', async () => {
    const v = await checkRule(warnConcurrentIndexInvalid, 'CREATE INDEX CONCURRENTLY idx_users_email ON users (email);');
    expect(v).not.toBeNull();
    expect(v!.ruleId).toBe('MP070');
    expect(v!.message).toContain('idx_users_email');
  });

  it('passes when preceded by DROP INDEX IF EXISTS', async () => {
    const sql = 'DROP INDEX IF EXISTS idx_users_email;\nCREATE INDEX CONCURRENTLY idx_users_email ON users (email);';
    const v = await checkRule(warnConcurrentIndexInvalid, sql);
    expect(v).toBeNull();
  });

  it('ignores non-CONCURRENTLY indexes', async () => {
    const v = await checkRule(warnConcurrentIndexInvalid, 'CREATE INDEX idx_users_email ON users (email);');
    expect(v).toBeNull();
  });
});

describe('MP071: ban-rename-in-use-column', () => {
  it('flags column rename without dependent object updates', async () => {
    const v = await checkRule(banRenameInUseColumn, 'ALTER TABLE users RENAME COLUMN name TO full_name;');
    expect(v).not.toBeNull();
    expect(v!.ruleId).toBe('MP071');
    expect(v!.message).toContain('name');
    expect(v!.message).toContain('full_name');
  });

  it('passes when views are updated in same migration', async () => {
    const sql = `ALTER TABLE users RENAME COLUMN name TO full_name;
CREATE OR REPLACE VIEW user_view AS SELECT full_name FROM users;`;
    const v = await checkRule(banRenameInUseColumn, sql);
    expect(v).toBeNull();
  });

  it('ignores table rename (not column)', async () => {
    const v = await checkRule(banRenameInUseColumn, 'ALTER TABLE users RENAME TO customers;');
    expect(v).toBeNull();
  });
});

describe('MP072: warn-partition-default-scan', () => {
  it('flags ATTACH PARTITION', async () => {
    const v = await checkRule(warnPartitionDefaultScan, 'ALTER TABLE events ATTACH PARTITION events_2024 FOR VALUES FROM (\'2024-01-01\') TO (\'2025-01-01\');');
    expect(v).not.toBeNull();
    expect(v!.ruleId).toBe('MP072');
    expect(v!.message).toContain('events_2024');
    expect(v!.message).toContain('events');
  });

  it('ignores DETACH PARTITION', async () => {
    const v = await checkRule(warnPartitionDefaultScan, 'ALTER TABLE events DETACH PARTITION events_2020;');
    expect(v).toBeNull();
  });

  it('ignores regular ALTER TABLE', async () => {
    const v = await checkRule(warnPartitionDefaultScan, 'ALTER TABLE events ADD COLUMN source TEXT;');
    expect(v).toBeNull();
  });
});

describe('MP073: ban-superuser-role', () => {
  it('flags ALTER SYSTEM', async () => {
    const v = await checkRule(banSuperuserRole, "ALTER SYSTEM SET max_connections = '200';");
    expect(v).not.toBeNull();
    expect(v!.ruleId).toBe('MP073');
    expect(v!.message).toContain('ALTER SYSTEM');
  });

  it('flags CREATE ROLE WITH SUPERUSER', async () => {
    const v = await checkRule(banSuperuserRole, 'CREATE ROLE admin WITH SUPERUSER;');
    expect(v).not.toBeNull();
    expect(v!.ruleId).toBe('MP073');
    expect(v!.message).toContain('admin');
  });

  it('ignores regular CREATE ROLE', async () => {
    const v = await checkRule(banSuperuserRole, 'CREATE ROLE reader WITH LOGIN;');
    expect(v).toBeNull();
  });

  it('ignores ALTER DATABASE SET', async () => {
    const v = await checkRule(banSuperuserRole, "ALTER DATABASE mydb SET work_mem = '256MB';");
    expect(v).toBeNull();
  });
});

describe('MP074: require-deferrable-fk', () => {
  it('flags non-deferrable FK in ALTER TABLE', async () => {
    const v = await checkRule(requireDeferrableFk, 'ALTER TABLE orders ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users (id);');
    expect(v).not.toBeNull();
    expect(v!.ruleId).toBe('MP074');
    expect(v!.message).toContain('fk_user');
  });

  it('passes DEFERRABLE FK', async () => {
    const v = await checkRule(requireDeferrableFk, 'ALTER TABLE orders ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users (id) DEFERRABLE;');
    expect(v).toBeNull();
  });

  it('passes DEFERRABLE INITIALLY DEFERRED FK', async () => {
    const v = await checkRule(requireDeferrableFk, 'ALTER TABLE orders ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users (id) DEFERRABLE INITIALLY DEFERRED;');
    expect(v).toBeNull();
  });

  it('ignores non-FK constraints', async () => {
    const v = await checkRule(requireDeferrableFk, 'ALTER TABLE users ADD CONSTRAINT chk_age CHECK (age > 0);');
    expect(v).toBeNull();
  });
});
