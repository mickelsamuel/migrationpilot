import { describe, it, expect } from 'vitest';
import { parseMigration } from '../src/parser/parse.js';
import { preferPg18NotNullNotValid } from '../src/rules/MP081-prefer-pg18-not-null-not-valid.js';
import { warnNotEnforcedConstraint } from '../src/rules/MP082-warn-not-enforced-constraint.js';
import { warnFkNondeterministicCollation } from '../src/rules/MP083-warn-fk-nondeterministic-collation.js';
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

/**
 * Helper for rules that may need to work on unparseable PG18 syntax.
 * Falls back to calling rule.check() with a fake context containing the raw SQL.
 */
async function checkRuleRaw(rule: Rule, sql: string, pgVersion = 17) {
  const { statements } = await parseMigration(sql);
  if (statements.length > 0) {
    return checkRule(rule, sql, pgVersion);
  }
  // Parser couldn't parse — test rule's regex fallback
  const v = rule.check({}, {
    originalSql: sql,
    line: 1,
    pgVersion,
    lock: { lockType: 'ACCESS EXCLUSIVE', blocksReads: true, blocksWrites: true },
    allStatements: [{ stmt: {}, originalSql: sql }],
    statementIndex: 0,
  });
  return v;
}

// ──────────────────────────────────────────────
// MP081: prefer-pg18-not-null-not-valid
// ──────────────────────────────────────────────

describe('MP081: prefer-pg18-not-null-not-valid', () => {
  it('flags CHECK IS NOT NULL workaround on PG18+', async () => {
    const sql = `ALTER TABLE users ADD CONSTRAINT users_email_nn
  CHECK (email IS NOT NULL) NOT VALID;`;
    const v = await checkRule(preferPg18NotNullNotValid, sql, 18);
    expect(v).not.toBeNull();
    expect(v!.ruleId).toBe('MP081');
    expect(v!.message).toContain('PG18');
  });

  it('ignores CHECK IS NOT NULL workaround on PG17', async () => {
    const sql = `ALTER TABLE users ADD CONSTRAINT users_email_nn
  CHECK (email IS NOT NULL) NOT VALID;`;
    const v = await checkRule(preferPg18NotNullNotValid, sql, 17);
    expect(v).toBeNull();
  });

  it('ignores CHECK constraints unrelated to NOT NULL', async () => {
    const sql = `ALTER TABLE users ADD CONSTRAINT users_age_check
  CHECK (age > 0) NOT VALID;`;
    const v = await checkRule(preferPg18NotNullNotValid, sql, 18);
    expect(v).toBeNull();
  });

  it('ignores non-ALTER statements', async () => {
    const v = await checkRule(preferPg18NotNullNotValid, 'CREATE TABLE t (id INT);', 18);
    expect(v).toBeNull();
  });

  it('suggests native PG18 syntax in safeAlternative', async () => {
    const sql = `ALTER TABLE orders ADD CONSTRAINT orders_total_nn
  CHECK (total IS NOT NULL) NOT VALID;`;
    const v = await checkRule(preferPg18NotNullNotValid, sql, 18);
    expect(v).not.toBeNull();
    expect(v!.safeAlternative).toContain('SET NOT NULL NOT VALID');
    expect(v!.safeAlternative).toContain('VALIDATE NOT NULL');
  });

  it('extracts correct column name from AST', async () => {
    const sql = `ALTER TABLE orders ADD CONSTRAINT orders_amount_nn
  CHECK (amount IS NOT NULL) NOT VALID;`;
    const v = await checkRule(preferPg18NotNullNotValid, sql, 18);
    expect(v).not.toBeNull();
    expect(v!.message).toContain('amount');
  });

  it('ignores CHECK with NOT VALID false (enforced check)', async () => {
    const sql = `ALTER TABLE users ADD CONSTRAINT users_email_nn
  CHECK (email IS NOT NULL);`;
    const v = await checkRule(preferPg18NotNullNotValid, sql, 18);
    expect(v).toBeNull();
  });
});

// ──────────────────────────────────────────────
// MP082: warn-not-enforced-constraint
// ──────────────────────────────────────────────

describe('MP082: warn-not-enforced-constraint', () => {
  it('flags NOT ENFORCED in originalSql on PG18+', async () => {
    const sql = 'ALTER TABLE orders ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id) NOT ENFORCED;';
    const v = await checkRuleRaw(warnNotEnforcedConstraint, sql, 18);
    expect(v).not.toBeNull();
    expect(v!.ruleId).toBe('MP082');
    expect(v!.message).toContain('NOT ENFORCED');
  });

  it('flags NOT ENFORCED CHECK constraint', async () => {
    const sql = 'ALTER TABLE users ADD CONSTRAINT age_check CHECK (age > 0) NOT ENFORCED;';
    const v = await checkRuleRaw(warnNotEnforcedConstraint, sql, 18);
    expect(v).not.toBeNull();
  });

  it('ignores regular constraints', async () => {
    const sql = 'ALTER TABLE users ADD CONSTRAINT age_check CHECK (age > 0);';
    const v = await checkRuleRaw(warnNotEnforcedConstraint, sql, 18);
    expect(v).toBeNull();
  });

  it('ignores NOT ENFORCED on PG17 (syntax not available)', async () => {
    const sql = 'ALTER TABLE orders ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id) NOT ENFORCED;';
    const v = await checkRuleRaw(warnNotEnforcedConstraint, sql, 17);
    expect(v).toBeNull();
  });

  it('includes data integrity warning in message', async () => {
    const sql = 'ALTER TABLE orders ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id) NOT ENFORCED;';
    const v = await checkRuleRaw(warnNotEnforcedConstraint, sql, 18);
    expect(v).not.toBeNull();
    expect(v!.message).toContain('not enforce');
  });

  it('extracts constraint name', async () => {
    const sql = 'ALTER TABLE orders ADD CONSTRAINT my_fk FOREIGN KEY (uid) REFERENCES users(id) NOT ENFORCED;';
    const v = await checkRuleRaw(warnNotEnforcedConstraint, sql, 18);
    expect(v).not.toBeNull();
    expect(v!.message).toContain('my_fk');
  });

  it('extracts table name', async () => {
    const sql = 'ALTER TABLE payments ADD CONSTRAINT fk_order FOREIGN KEY (order_id) REFERENCES orders(id) NOT ENFORCED;';
    const v = await checkRuleRaw(warnNotEnforcedConstraint, sql, 18);
    expect(v).not.toBeNull();
    expect(v!.message).toContain('payments');
  });
});

// ──────────────────────────────────────────────
// MP083: warn-fk-nondeterministic-collation
// ──────────────────────────────────────────────

describe('MP083: warn-fk-nondeterministic-collation', () => {
  it('flags FK when migration has ICU collation on PG18+', async () => {
    const sql = `ALTER TABLE orders ADD COLUMN code TEXT COLLATE "und-x-icu";
ALTER TABLE orders ADD CONSTRAINT fk_code FOREIGN KEY (code) REFERENCES products(code);`;
    const v = await checkRule(warnFkNondeterministicCollation, sql, 18);
    expect(v).not.toBeNull();
    expect((Array.isArray(v) ? v[0] : v)!.ruleId).toBe('MP083');
  });

  it('flags CREATE TABLE with FK and ICU collation', async () => {
    const sql = `CREATE TABLE orders (
  id BIGINT,
  user_email TEXT COLLATE "und-x-icu",
  FOREIGN KEY (user_email) REFERENCES users(email)
);`;
    const v = await checkRule(warnFkNondeterministicCollation, sql, 18);
    expect(v).not.toBeNull();
    const violation = Array.isArray(v) ? v[0] : v;
    expect(violation!.ruleId).toBe('MP083');
    expect(violation!.message).toContain('collation');
  });

  it('ignores FK without non-deterministic collation', async () => {
    const sql = `ALTER TABLE orders ADD CONSTRAINT fk_user
  FOREIGN KEY (user_id) REFERENCES users(id);`;
    const v = await checkRule(warnFkNondeterministicCollation, sql, 18);
    expect(v).toBeNull();
  });

  it('ignores on PG17', async () => {
    const sql = `ALTER TABLE orders ADD COLUMN code TEXT COLLATE "und-x-icu";
ALTER TABLE orders ADD CONSTRAINT fk_code FOREIGN KEY (code) REFERENCES products(code);`;
    const v = await checkRule(warnFkNondeterministicCollation, sql, 17);
    expect(v).toBeNull();
  });

  it('detects locale-specific ICU collation', async () => {
    const sql = `ALTER TABLE orders ADD COLUMN name TEXT COLLATE "en-US-x-icu";
ALTER TABLE orders ADD CONSTRAINT fk_name FOREIGN KEY (name) REFERENCES products(name);`;
    const v = await checkRule(warnFkNondeterministicCollation, sql, 18);
    expect(v).not.toBeNull();
  });

  it('ignores CREATE TABLE without FK', async () => {
    const sql = `CREATE TABLE orders (
  id BIGINT,
  code TEXT COLLATE "und-x-icu"
);`;
    const v = await checkRule(warnFkNondeterministicCollation, sql, 18);
    expect(v).toBeNull();
  });
});
