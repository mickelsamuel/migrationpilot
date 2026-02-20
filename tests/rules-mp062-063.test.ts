import { describe, it, expect } from 'vitest';
import { parseMigration } from '../src/parser/parse.js';
import { banAddGeneratedStored } from '../src/rules/MP062-ban-add-generated-stored.js';
import { warnDoBlockDdl } from '../src/rules/MP063-warn-do-block-ddl.js';

async function checkRule(rule: typeof banAddGeneratedStored, sql: string) {
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

describe('MP062: ban-add-generated-stored-column', () => {
  it('flags stored generated column', async () => {
    const result = await checkRule(
      banAddGeneratedStored,
      'ALTER TABLE orders ADD COLUMN total NUMERIC GENERATED ALWAYS AS (quantity * price) STORED;',
    );
    expect(result).not.toBeNull();
    expect(result?.ruleId).toBe('MP062');
    expect(result?.severity).toBe('critical');
  });

  it('ok for regular ADD COLUMN', async () => {
    const result = await checkRule(
      banAddGeneratedStored,
      'ALTER TABLE orders ADD COLUMN total NUMERIC DEFAULT 0;',
    );
    expect(result).toBeNull();
  });

  it('ok for CREATE TABLE with generated column', async () => {
    const result = await checkRule(
      banAddGeneratedStored,
      'CREATE TABLE orders (quantity INT, price NUMERIC, total NUMERIC GENERATED ALWAYS AS (quantity * price) STORED);',
    );
    expect(result).toBeNull();
  });
});

describe('MP063: warn-do-block-ddl', () => {
  it('flags DO block with ALTER TABLE', async () => {
    const result = await checkRule(
      warnDoBlockDdl,
      `DO $$ BEGIN ALTER TABLE users ADD COLUMN email TEXT; END $$;`,
    );
    expect(result).not.toBeNull();
    expect(result?.ruleId).toBe('MP063');
    expect(result?.message).toContain('ALTER TABLE');
  });

  it('flags DO block with CREATE INDEX', async () => {
    const result = await checkRule(
      warnDoBlockDdl,
      `DO $$ BEGIN CREATE INDEX idx ON users (email); END $$;`,
    );
    expect(result).not.toBeNull();
    expect(result?.message).toContain('CREATE INDEX');
  });

  it('flags DO block with multiple DDL types', async () => {
    const result = await checkRule(
      warnDoBlockDdl,
      `DO $$ BEGIN ALTER TABLE users ADD COLUMN email TEXT; DROP TABLE old_users; END $$;`,
    );
    expect(result).not.toBeNull();
    expect(result?.message).toContain('ALTER TABLE');
    expect(result?.message).toContain('DROP TABLE');
  });

  it('ok for DO block without DDL', async () => {
    const result = await checkRule(
      warnDoBlockDdl,
      `DO $$ BEGIN RAISE NOTICE 'hello'; END $$;`,
    );
    expect(result).toBeNull();
  });

  it('ok for DO block with only DML', async () => {
    const result = await checkRule(
      warnDoBlockDdl,
      `DO $$ BEGIN UPDATE users SET active = true; END $$;`,
    );
    expect(result).toBeNull();
  });

  it('ignores non-DO statements', async () => {
    const result = await checkRule(
      warnDoBlockDdl,
      'ALTER TABLE users ADD COLUMN email TEXT;',
    );
    expect(result).toBeNull();
  });
});
