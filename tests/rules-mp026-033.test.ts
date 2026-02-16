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

// --- MP026: ban-drop-table ---

describe('MP026: ban-drop-table', () => {
  it('flags DROP TABLE', async () => {
    const violations = await analyze('DROP TABLE users;');
    const v = violations.find(v => v.ruleId === 'MP026');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('critical');
    expect(v?.message).toContain('users');
    expect(v?.message).toContain('permanently removes');
  });

  it('flags DROP TABLE IF EXISTS', async () => {
    const violations = await analyze('DROP TABLE IF EXISTS users;');
    const v = violations.find(v => v.ruleId === 'MP026');
    expect(v).toBeDefined();
    expect(v?.message).toContain('users');
  });

  it('does not flag DROP INDEX', async () => {
    const violations = await analyze('DROP INDEX idx_users_email;');
    expect(violations.find(v => v.ruleId === 'MP026')).toBeUndefined();
  });

  it('does not flag DROP VIEW', async () => {
    const violations = await analyze('DROP VIEW active_users;');
    expect(violations.find(v => v.ruleId === 'MP026')).toBeUndefined();
  });

  it('provides safe alternative with rename pattern', async () => {
    const violations = await analyze('DROP TABLE users;');
    const v = violations.find(v => v.ruleId === 'MP026');
    expect(v?.safeAlternative).toContain('RENAME TO');
    expect(v?.safeAlternative).toContain('_deprecated');
  });
});

// --- MP027: disallowed-unique-constraint ---

describe('MP027: disallowed-unique-constraint', () => {
  it('flags ADD CONSTRAINT UNIQUE', async () => {
    const violations = await analyze(
      'ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE (email);'
    );
    const v = violations.find(v => v.ruleId === 'MP027');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('critical');
    expect(v?.message).toContain('users_email_unique');
    expect(v?.message).toContain('USING INDEX');
  });

  it('passes ADD CONSTRAINT UNIQUE USING INDEX', async () => {
    const violations = await analyze(
      'ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE USING INDEX users_email_idx;'
    );
    expect(violations.find(v => v.ruleId === 'MP027')).toBeUndefined();
  });

  it('does not flag ADD CONSTRAINT FOREIGN KEY', async () => {
    const violations = await analyze(
      'ALTER TABLE orders ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users (id) NOT VALID;'
    );
    expect(violations.find(v => v.ruleId === 'MP027')).toBeUndefined();
  });

  it('provides safe alternative with CONCURRENTLY + USING INDEX pattern', async () => {
    const violations = await analyze(
      'ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE (email);'
    );
    const v = violations.find(v => v.ruleId === 'MP027');
    expect(v?.safeAlternative).toContain('CREATE UNIQUE INDEX CONCURRENTLY');
    expect(v?.safeAlternative).toContain('USING INDEX');
  });
});

// --- MP028: no-rename-table ---

describe('MP028: no-rename-table', () => {
  it('flags ALTER TABLE RENAME TO', async () => {
    const violations = await analyze('ALTER TABLE users RENAME TO customers;');
    const v = violations.find(v => v.ruleId === 'MP028');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('warning');
    expect(v?.message).toContain('users');
    expect(v?.message).toContain('customers');
  });

  it('does not flag RENAME COLUMN', async () => {
    const violations = await analyze('ALTER TABLE users RENAME COLUMN name TO full_name;');
    // MP028 should not fire — that's MP010's domain
    expect(violations.find(v => v.ruleId === 'MP028')).toBeUndefined();
  });

  it('provides safe alternative with view pattern', async () => {
    const violations = await analyze('ALTER TABLE users RENAME TO customers;');
    const v = violations.find(v => v.ruleId === 'MP028');
    expect(v?.safeAlternative).toContain('VIEW');
  });
});

// --- MP029: ban-drop-not-null ---

describe('MP029: ban-drop-not-null', () => {
  it('flags ALTER TABLE DROP NOT NULL', async () => {
    const violations = await analyze('ALTER TABLE users ALTER COLUMN email DROP NOT NULL;');
    const v = violations.find(v => v.ruleId === 'MP029');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('warning');
    expect(v?.message).toContain('email');
    expect(v?.message).toContain('NULL');
  });

  it('does not flag ALTER TABLE SET NOT NULL', async () => {
    const violations = await analyze('ALTER TABLE users ALTER COLUMN email SET NOT NULL;');
    expect(violations.find(v => v.ruleId === 'MP029')).toBeUndefined();
  });

  it('does not flag ADD COLUMN', async () => {
    const violations = await analyze('ALTER TABLE users ADD COLUMN bio text;');
    expect(violations.find(v => v.ruleId === 'MP029')).toBeUndefined();
  });

  it('provides safe alternative mentioning NULL handling', async () => {
    const violations = await analyze('ALTER TABLE users ALTER COLUMN email DROP NOT NULL;');
    const v = violations.find(v => v.ruleId === 'MP029');
    expect(v?.safeAlternative).toContain('NULL');
  });
});

// --- MP030: require-not-valid-check ---

describe('MP030: require-not-valid-check', () => {
  it('flags ADD CONSTRAINT CHECK without NOT VALID', async () => {
    const violations = await analyze(
      "ALTER TABLE users ADD CONSTRAINT chk_age CHECK (age > 0);"
    );
    const v = violations.find(v => v.ruleId === 'MP030');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('critical');
    expect(v?.message).toContain('chk_age');
    expect(v?.message).toContain('NOT VALID');
  });

  it('passes ADD CONSTRAINT CHECK NOT VALID', async () => {
    const violations = await analyze(
      "ALTER TABLE users ADD CONSTRAINT chk_age CHECK (age > 0) NOT VALID;"
    );
    expect(violations.find(v => v.ruleId === 'MP030')).toBeUndefined();
  });

  it('does not flag ADD CONSTRAINT FOREIGN KEY', async () => {
    const violations = await analyze(
      'ALTER TABLE orders ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users (id) NOT VALID;'
    );
    expect(violations.find(v => v.ruleId === 'MP030')).toBeUndefined();
  });

  it('does not flag VALIDATE CONSTRAINT', async () => {
    const violations = await analyze(
      'ALTER TABLE users VALIDATE CONSTRAINT chk_age;'
    );
    expect(violations.find(v => v.ruleId === 'MP030')).toBeUndefined();
  });

  it('provides safe alternative with NOT VALID + VALIDATE pattern', async () => {
    const violations = await analyze(
      "ALTER TABLE users ADD CONSTRAINT chk_age CHECK (age > 0);"
    );
    const v = violations.find(v => v.ruleId === 'MP030');
    expect(v?.safeAlternative).toContain('NOT VALID');
    expect(v?.safeAlternative).toContain('VALIDATE CONSTRAINT');
  });
});

// --- MP031: ban-exclusion-constraint ---

describe('MP031: ban-exclusion-constraint', () => {
  it('flags ADD EXCLUSION constraint', async () => {
    const violations = await analyze(
      "ALTER TABLE reservations ADD CONSTRAINT no_overlap EXCLUDE USING gist (room WITH =, during WITH &&);"
    );
    const v = violations.find(v => v.ruleId === 'MP031');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('critical');
    expect(v?.message).toContain('no_overlap');
    expect(v?.message).toContain('GiST');
  });

  it('provides safe alternative', async () => {
    const violations = await analyze(
      "ALTER TABLE reservations ADD CONSTRAINT no_overlap EXCLUDE USING gist (room WITH =, during WITH &&);"
    );
    const v = violations.find(v => v.ruleId === 'MP031');
    expect(v?.safeAlternative).toContain('maintenance window');
  });
});

// --- MP032: ban-cluster ---

describe('MP032: ban-cluster', () => {
  it('flags CLUSTER on a table', async () => {
    const violations = await analyze('CLUSTER users USING users_pkey;');
    const v = violations.find(v => v.ruleId === 'MP032');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('critical');
    expect(v?.message).toContain('users');
    expect(v?.message).toContain('ACCESS EXCLUSIVE');
  });

  it('flags CLUSTER without USING', async () => {
    const violations = await analyze('CLUSTER users;');
    const v = violations.find(v => v.ruleId === 'MP032');
    expect(v).toBeDefined();
  });

  it('provides safe alternative with pg_repack', async () => {
    const violations = await analyze('CLUSTER users USING users_pkey;');
    const v = violations.find(v => v.ruleId === 'MP032');
    expect(v?.safeAlternative).toContain('pg_repack');
  });
});

// --- MP033: require-concurrent-refresh-matview ---

describe('MP033: require-concurrent-refresh-matview', () => {
  it('flags REFRESH MATERIALIZED VIEW without CONCURRENTLY', async () => {
    const violations = await analyze('REFRESH MATERIALIZED VIEW sales_summary;');
    const v = violations.find(v => v.ruleId === 'MP033');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('warning');
    expect(v?.message).toContain('sales_summary');
    expect(v?.message).toContain('CONCURRENTLY');
  });

  it('passes REFRESH MATERIALIZED VIEW CONCURRENTLY', async () => {
    const violations = await analyze('REFRESH MATERIALIZED VIEW CONCURRENTLY sales_summary;');
    expect(violations.find(v => v.ruleId === 'MP033')).toBeUndefined();
  });

  it('passes REFRESH MATERIALIZED VIEW WITH NO DATA', async () => {
    const violations = await analyze('REFRESH MATERIALIZED VIEW sales_summary WITH NO DATA;');
    expect(violations.find(v => v.ruleId === 'MP033')).toBeUndefined();
  });

  it('provides safe alternative with CONCURRENTLY', async () => {
    const violations = await analyze('REFRESH MATERIALIZED VIEW sales_summary;');
    const v = violations.find(v => v.ruleId === 'MP033');
    expect(v?.safeAlternative).toContain('CONCURRENTLY');
  });
});
