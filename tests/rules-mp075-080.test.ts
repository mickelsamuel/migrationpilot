import { describe, it, expect } from 'vitest';
import { parseMigration } from '../src/parser/parse.js';
import { warnToastBloatRisk } from '../src/rules/MP075-warn-toast-bloat-risk.js';
import { warnXidConsumingRetry } from '../src/rules/MP076-warn-xid-consuming-retry.js';
import { preferLz4ToastCompression } from '../src/rules/MP077-prefer-lz4-toast-compression.js';
import { warnExtensionVersionPin } from '../src/rules/MP078-warn-extension-version-pin.js';
import { warnRlsPolicyCompleteness } from '../src/rules/MP079-warn-rls-policy-completeness.js';
import { banDataInMigration } from '../src/rules/MP080-ban-data-in-migration.js';
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

describe('MP075: warn-toast-bloat-risk', () => {
  it('flags UPDATE with jsonb_set', async () => {
    const v = await checkRule(warnToastBloatRisk, "UPDATE users SET metadata = jsonb_set(metadata, '{key}', '\"value\"');");
    expect(v).not.toBeNull();
    expect(v!.ruleId).toBe('MP075');
    expect(v!.message).toContain('TOAST');
  });

  it('flags UPDATE on common TOAST column names', async () => {
    const v = await checkRule(warnToastBloatRisk, "UPDATE events SET payload = '{\"type\": \"click\"}';");
    expect(v).not.toBeNull();
    expect(v!.ruleId).toBe('MP075');
  });

  it('ignores UPDATE on non-TOAST columns', async () => {
    const v = await checkRule(warnToastBloatRisk, "UPDATE users SET age = 25;");
    expect(v).toBeNull();
  });

  it('ignores non-UPDATE statements', async () => {
    const v = await checkRule(warnToastBloatRisk, 'CREATE TABLE users (id INT);');
    expect(v).toBeNull();
  });
});

describe('MP076: warn-xid-consuming-retry', () => {
  it('flags SAVEPOINT statements', async () => {
    const v = await checkRule(warnXidConsumingRetry, 'SAVEPOINT my_savepoint;');
    expect(v).not.toBeNull();
    expect(v!.ruleId).toBe('MP076');
    expect(v!.message).toContain('my_savepoint');
    expect(v!.message).toContain('XID');
  });

  it('ignores BEGIN', async () => {
    const v = await checkRule(warnXidConsumingRetry, 'BEGIN;');
    expect(v).toBeNull();
  });

  it('ignores COMMIT', async () => {
    const v = await checkRule(warnXidConsumingRetry, 'COMMIT;');
    expect(v).toBeNull();
  });

  it('ignores RELEASE SAVEPOINT', async () => {
    const v = await checkRule(warnXidConsumingRetry, 'RELEASE SAVEPOINT my_savepoint;');
    expect(v).toBeNull();
  });
});

describe('MP077: prefer-lz4-toast-compression', () => {
  it('flags SET COMPRESSION pglz on PG 14+', async () => {
    const v = await checkRule(preferLz4ToastCompression, 'ALTER TABLE users ALTER COLUMN bio SET COMPRESSION pglz;', 14);
    expect(v).not.toBeNull();
    expect(v!.ruleId).toBe('MP077');
    expect(v!.message).toContain('pglz');
    expect(v!.message).toContain('lz4');
  });

  it('ignores SET COMPRESSION lz4', async () => {
    const v = await checkRule(preferLz4ToastCompression, 'ALTER TABLE users ALTER COLUMN bio SET COMPRESSION lz4;', 14);
    expect(v).toBeNull();
  });

  it('ignores pglz on PG 13 (lz4 not available)', async () => {
    const v = await checkRule(preferLz4ToastCompression, 'ALTER TABLE users ALTER COLUMN bio SET COMPRESSION pglz;', 13);
    expect(v).toBeNull();
  });

  it('ignores non-compression ALTER TABLE', async () => {
    const v = await checkRule(preferLz4ToastCompression, 'ALTER TABLE users ADD COLUMN bio TEXT;', 14);
    expect(v).toBeNull();
  });
});

describe('MP078: warn-extension-version-pin', () => {
  it('flags CREATE EXTENSION without VERSION', async () => {
    const v = await checkRule(warnExtensionVersionPin, 'CREATE EXTENSION IF NOT EXISTS pgcrypto;');
    expect(v).not.toBeNull();
    expect(v!.ruleId).toBe('MP078');
    expect(v!.message).toContain('pgcrypto');
    expect(v!.message).toContain('VERSION');
  });

  it('passes CREATE EXTENSION WITH VERSION', async () => {
    const v = await checkRule(warnExtensionVersionPin, "CREATE EXTENSION IF NOT EXISTS pgcrypto VERSION '1.3';");
    expect(v).toBeNull();
  });

  it('ignores non-extension statements', async () => {
    const v = await checkRule(warnExtensionVersionPin, 'CREATE TABLE users (id INT);');
    expect(v).toBeNull();
  });
});

describe('MP079: warn-rls-policy-completeness', () => {
  it('flags RLS with incomplete policies (only SELECT)', async () => {
    const sql = `ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY posts_select ON posts FOR SELECT USING (true);`;
    const v = await checkRule(warnRlsPolicyCompleteness, sql);
    expect(v).not.toBeNull();
    expect(v!.ruleId).toBe('MP079');
    expect(v!.message).toContain('insert');
  });

  it('passes RLS with ALL policy', async () => {
    const sql = `ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY posts_all ON posts FOR ALL USING (true);`;
    const v = await checkRule(warnRlsPolicyCompleteness, sql);
    expect(v).toBeNull();
  });

  it('ignores RLS without any policies (MP057 handles that)', async () => {
    const v = await checkRule(warnRlsPolicyCompleteness, 'ALTER TABLE posts ENABLE ROW LEVEL SECURITY;');
    expect(v).toBeNull();
  });

  it('ignores non-RLS ALTER TABLE', async () => {
    const v = await checkRule(warnRlsPolicyCompleteness, 'ALTER TABLE posts ADD COLUMN title TEXT;');
    expect(v).toBeNull();
  });
});

describe('MP080: ban-data-in-migration', () => {
  it('flags INSERT in DDL migration', async () => {
    const sql = `CREATE TABLE settings (key TEXT, value TEXT);
INSERT INTO settings (key, value) VALUES ('version', '1.0');`;
    const v = await checkRule(banDataInMigration, sql);
    expect(v).not.toBeNull();
    // v could be an array since multiple statements might match
    const violation = Array.isArray(v) ? v.find((r: { ruleId: string }) => r.ruleId === 'MP080') : v;
    expect(violation).not.toBeNull();
    expect(violation!.ruleId).toBe('MP080');
    expect(violation!.message).toContain('INSERT');
  });

  it('flags UPDATE in DDL migration', async () => {
    const sql = `ALTER TABLE users ADD COLUMN email TEXT;
UPDATE users SET email = 'unknown@test.com';`;
    const v = await checkRule(banDataInMigration, sql);
    expect(v).not.toBeNull();
    const violation = Array.isArray(v) ? v.find((r: { ruleId: string }) => r.ruleId === 'MP080') : v;
    expect(violation).not.toBeNull();
    expect(violation!.ruleId).toBe('MP080');
    expect(violation!.message).toContain('UPDATE');
  });

  it('ignores pure DML file (no DDL)', async () => {
    const v = await checkRule(banDataInMigration, "INSERT INTO settings (key, value) VALUES ('version', '1.0');");
    expect(v).toBeNull();
  });

  it('ignores pure DDL file (no DML)', async () => {
    const v = await checkRule(banDataInMigration, 'CREATE TABLE users (id INT);');
    expect(v).toBeNull();
  });
});
