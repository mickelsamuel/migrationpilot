/**
 * In → out fixtures for the mechanical fixes added beyond the original twelve,
 * plus the statement splitter they all rely on.
 *
 * Every case asserts the exact SQL that comes out, not just that a keyword
 * appears somewhere: a fix that produces the right token in the wrong place is
 * still broken SQL.
 */

import { describe, it, expect } from 'vitest';
import { autoFix, isFixable, fixableRuleIds, FIXABLE_RULE_COUNT } from '../src/fixer/fix.js';
import { splitStatements } from '../src/fixer/statements.js';
import {
  FIX_CLASSIFICATIONS,
  MECHANICAL_RULE_IDS,
  PLAN_ONLY_RULE_IDS,
  UNFIXABLE_RULE_IDS,
  fixClassOf,
} from '../src/fixer/classification.js';
import { parseMigration } from '../src/parser/parse.js';
import { classifyLock } from '../src/locks/classify.js';
import { allRules, runRules } from '../src/rules/index.js';

/** Analyze then fix, exactly as `analyze --fix` does. */
async function fix(sql: string, pgVersion = 17) {
  const parsed = await parseMigration(sql);
  expect(parsed.errors).toEqual([]);
  const statements = parsed.statements.map(s => ({
    ...s,
    lock: classifyLock(s.stmt, pgVersion),
    line: sql.slice(0, s.stmtLocation).split('\n').length,
  }));
  const violations = runRules(allRules, statements, pgVersion, undefined, sql);
  return autoFix(sql, violations);
}

/** Fix, and assert the whole file comes out as expected. */
async function expectFix(input: string, expected: string, pgVersion = 17) {
  const result = await fix(input, pgVersion);
  expect(result.fixedSql).toBe(expected);
  return result;
}

/** The fixed SQL must still parse. */
async function expectParses(sql: string) {
  const parsed = await parseMigration(sql);
  expect(parsed.errors).toEqual([]);
}

describe('statement splitter', () => {
  it('splits on top-level semicolons only', () => {
    const spans = splitStatements("SELECT 1; SELECT ';'; SELECT 3;");
    expect(spans.map(s => s.text)).toEqual(["SELECT 1;", "SELECT ';';", 'SELECT 3;']);
  });

  it('keeps dollar-quoted bodies intact', () => {
    const sql = 'DO $$ BEGIN PERFORM 1; PERFORM 2; END $$;\nSELECT 1;';
    const spans = splitStatements(sql);
    expect(spans).toHaveLength(2);
    expect(spans[0]!.text).toBe('DO $$ BEGIN PERFORM 1; PERFORM 2; END $$;');
  });

  it('does not mistake a positional parameter for a dollar quote', () => {
    const spans = splitStatements('SELECT $1; SELECT 2;');
    expect(spans).toHaveLength(2);
  });

  it('ignores semicolons inside comments', () => {
    const sql = '-- drop this; really\nCREATE INDEX i ON t (c);\n/* and; this */\nSELECT 1;';
    const spans = splitStatements(sql);
    expect(spans.map(s => s.text)).toEqual(['CREATE INDEX i ON t (c);', 'SELECT 1;']);
  });

  it('records the line rules report, not just the start line', () => {
    // Rules derive the line from the previous statement's terminating `;`.
    const sql = 'CREATE INDEX a ON t (c);\n\n\nALTER TABLE t ADD COLUMN x int;';
    const spans = splitStatements(sql);
    expect(spans[1]!.startLine).toBe(4);
    expect(spans[1]!.reportedLine).toBe(1);
  });

  it('handles a trailing statement with no semicolon', () => {
    const spans = splitStatements('SELECT 1;\nSELECT 2');
    expect(spans.map(s => s.text)).toEqual(['SELECT 1;', 'SELECT 2']);
  });
});

describe('MP005 auto-fix: FK constraint gets NOT VALID', () => {
  it('appends NOT VALID to a single-line FK', async () => {
    const result = await expectFix(
      "SET lock_timeout = '5s';\nALTER TABLE orders ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users (id);",
      "SET lock_timeout = '5s';\nALTER TABLE orders ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users (id) DEFERRABLE INITIALLY IMMEDIATE NOT VALID;",
    );
    await expectParses(result.fixedSql);
  });

  it('appends NOT VALID to an FK spanning several lines', async () => {
    const result = await expectFix(
      `SET lock_timeout = '5s';
ALTER TABLE orders
  ADD CONSTRAINT fk_user
  FOREIGN KEY (user_id)
  REFERENCES users (id);`,
      `SET lock_timeout = '5s';
ALTER TABLE orders
  ADD CONSTRAINT fk_user
  FOREIGN KEY (user_id)
  REFERENCES users (id) DEFERRABLE INITIALLY IMMEDIATE NOT VALID;`,
    );
    await expectParses(result.fixedSql);
  });

  it('leaves an FK that is already NOT VALID alone', async () => {
    const sql = "SET lock_timeout = '5s';\nALTER TABLE orders ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users (id) DEFERRABLE NOT VALID;";
    const result = await fix(sql);
    expect(result.fixedSql).toBe(sql);
  });

  it('keeps NOT VALID last when DEFERRABLE is added too', async () => {
    const result = await fix(
      "SET lock_timeout = '5s';\nALTER TABLE orders ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users (id);",
    );
    expect(result.fixedSql).toMatch(/DEFERRABLE INITIALLY IMMEDIATE NOT VALID;$/);
  });
});

describe('MP074 auto-fix: FK becomes DEFERRABLE', () => {
  it('uses INITIALLY IMMEDIATE so check timing does not change', async () => {
    const result = await fix(
      "SET lock_timeout = '5s';\nALTER TABLE orders ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users (id) NOT VALID;",
    );
    expect(result.fixedSql).toContain('DEFERRABLE INITIALLY IMMEDIATE NOT VALID;');
    expect(result.fixedSql).not.toContain('INITIALLY DEFERRED');
    await expectParses(result.fixedSql);
  });

  it('leaves an inline FK in CREATE TABLE for a human', async () => {
    const result = await fix('CREATE TABLE IF NOT EXISTS orders (id bigint PRIMARY KEY, user_id bigint REFERENCES users (id));');
    expect(result.fixedSql).not.toContain('DEFERRABLE');
    expect(result.unfixable.map(v => v.ruleId)).toContain('MP074');
  });
});

describe('MP038 auto-fix: INT key column becomes BIGINT', () => {
  it('widens a PRIMARY KEY column', async () => {
    await expectFix(
      'CREATE TABLE IF NOT EXISTS accounts (id integer PRIMARY KEY, label text);',
      'CREATE TABLE IF NOT EXISTS accounts (id BIGINT PRIMARY KEY, label text);',
    );
  });

  it('widens a REFERENCES column', async () => {
    await expectFix(
      'CREATE TABLE IF NOT EXISTS accounts (id bigint PRIMARY KEY, owner_id int REFERENCES users (id));',
      'CREATE TABLE IF NOT EXISTS accounts (id bigint PRIMARY KEY, owner_id BIGINT REFERENCES users (id));',
    );
  });

  it('leaves non-key integer columns alone', async () => {
    const result = await fix('CREATE TABLE IF NOT EXISTS accounts (id bigint PRIMARY KEY, hit_count int);');
    expect(result.fixedSql).toContain('hit_count int');
  });

  it('never touches an existing column, where the change would rewrite the table', async () => {
    const sql = "SET lock_timeout = '5s';\nSET statement_timeout = '30s';\nALTER TABLE accounts ALTER COLUMN id TYPE integer;";
    const result = await fix(sql);
    expect(result.fixedSql).toBe(sql);
  });
});

describe('MP039 auto-fix: SERIAL becomes IDENTITY', () => {
  it('maps serial to INTEGER GENERATED BY DEFAULT AS IDENTITY', async () => {
    const result = await expectFix(
      'CREATE TABLE IF NOT EXISTS accounts (id serial PRIMARY KEY, label text);',
      'CREATE TABLE IF NOT EXISTS accounts (id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, label text);',
    );
    await expectParses(result.fixedSql);
  });

  it('maps bigserial to BIGINT', async () => {
    await expectFix(
      'CREATE TABLE IF NOT EXISTS events (id bigserial PRIMARY KEY);',
      'CREATE TABLE IF NOT EXISTS events (id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY);',
    );
  });

  it('maps smallserial to SMALLINT', async () => {
    await expectFix(
      'CREATE TABLE IF NOT EXISTS flags (id smallserial PRIMARY KEY);',
      'CREATE TABLE IF NOT EXISTS flags (id SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY);',
    );
  });

  it('uses BY DEFAULT, not ALWAYS, so explicit inserts keep working', async () => {
    const result = await fix('CREATE TABLE IF NOT EXISTS accounts (id serial PRIMARY KEY);');
    expect(result.fixedSql).not.toContain('GENERATED ALWAYS');
  });
});

describe('MP042 auto-fix: unnamed index gets a name', () => {
  it('uses the name PostgreSQL would have generated', async () => {
    const result = await expectFix(
      "SET statement_timeout = '30s';\nCREATE INDEX CONCURRENTLY ON events (occurred_at);",
      "SET statement_timeout = '30s';\nCREATE INDEX CONCURRENTLY IF NOT EXISTS events_occurred_at_idx ON events (occurred_at);",
    );
    await expectParses(result.fixedSql);
  });

  it('joins every column of a composite index', async () => {
    const result = await fix("SET statement_timeout = '30s';\nCREATE INDEX CONCURRENTLY ON events (kind, occurred_at);");
    expect(result.fixedSql).toContain('events_kind_occurred_at_idx');
    await expectParses(result.fixedSql);
  });

  it('drops the schema qualifier from the name, as PostgreSQL does', async () => {
    const result = await fix("SET statement_timeout = '30s';\nCREATE INDEX CONCURRENTLY ON audit.events (kind);");
    expect(result.fixedSql).toContain('CREATE INDEX CONCURRENTLY IF NOT EXISTS events_kind_idx ON audit.events (kind)');
  });

  it('leaves expression indexes unnamed rather than guessing', async () => {
    const result = await fix("SET statement_timeout = '30s';\nCREATE INDEX CONCURRENTLY ON events (lower(kind));");
    expect(result.fixedSql).toContain('ON events (lower(kind))');
    expect(result.unfixable.map(v => v.ruleId)).toContain('MP042');
  });

  it('withholds IF NOT EXISTS when the index stays unnamed, which would not parse', async () => {
    // `CREATE INDEX CONCURRENTLY IF NOT EXISTS ON t (...)` is a syntax error —
    // the clause has no name to attach to.
    const result = await fix("SET statement_timeout = '30s';\nCREATE INDEX CONCURRENTLY ON events (lower(kind));");
    expect(result.fixedSql).not.toContain('IF NOT EXISTS');
    expect(result.unfixable.map(v => v.ruleId)).toContain('MP023');
    await expectParses(result.fixedSql);
  });
});

describe('MP077 auto-fix: pglz becomes lz4', () => {
  it('rewrites SET COMPRESSION', async () => {
    await expectFix(
      "SET lock_timeout = '5s';\nALTER TABLE docs ALTER COLUMN body SET COMPRESSION pglz;",
      "SET lock_timeout = '5s';\nALTER TABLE docs ALTER COLUMN body SET COMPRESSION lz4;",
    );
  });

  it('handles default_toast_compression, though MP077 never reports it', async () => {
    // Known gap in the rule, not the fixer: MP077 reads args[0].String.sval
    // while the parser wraps the value in an A_Const, so the GUC form is never
    // flagged and nothing reaches the fixer. The transform itself is correct.
    const sql = "SET default_toast_compression = 'pglz';";
    expect((await fix(sql)).fixedSql).toBe(sql);

    const direct = autoFix(sql, [
      { ruleId: 'MP077', ruleName: 'prefer-lz4-toast-compression', severity: 'warning', message: '', line: 1 },
    ]);
    expect(direct.fixedSql).toBe("SET default_toast_compression = 'lz4';");
  });

  it('does nothing on PostgreSQL 13, where lz4 does not exist', async () => {
    const sql = "SET lock_timeout = '5s';\nALTER TABLE docs ALTER COLUMN body SET COMPRESSION pglz;";
    const result = await fix(sql, 13);
    expect(result.fixedSql).toBe(sql);
  });
});

describe('MP025 auto-fix: CONCURRENTLY lifted out of its transaction', () => {
  it('drops the wrapper when the block holds nothing else', async () => {
    const result = await expectFix(
      'BEGIN;\nCREATE INDEX CONCURRENTLY IF NOT EXISTS idx_a ON t (c);\nCOMMIT;',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_a ON t (c);',
    );
    expect(result.fixedCount).toBeGreaterThan(0);
    await expectParses(result.fixedSql);
  });

  it('moves BEGIN below a leading concurrent statement', async () => {
    const result = await expectFix(
      "BEGIN;\nCREATE INDEX CONCURRENTLY IF NOT EXISTS idx_a ON t (c);\nSET lock_timeout = '5s';\nALTER TABLE t ADD COLUMN x int;\nCOMMIT;",
      "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_a ON t (c);\nBEGIN;\nSET lock_timeout = '5s';\nALTER TABLE t ADD COLUMN x int;\nCOMMIT;",
    );
    await expectParses(result.fixedSql);
  });

  it('moves COMMIT above a trailing concurrent statement', async () => {
    const result = await expectFix(
      "BEGIN;\nSET lock_timeout = '5s';\nALTER TABLE t ADD COLUMN x int;\nCREATE INDEX CONCURRENTLY IF NOT EXISTS idx_a ON t (c);\nCOMMIT;",
      "BEGIN;\nSET lock_timeout = '5s';\nALTER TABLE t ADD COLUMN x int;\nCOMMIT;\nCREATE INDEX CONCURRENTLY IF NOT EXISTS idx_a ON t (c);",
    );
    await expectParses(result.fixedSql);
  });

  it('refuses to split the block when the statement sits in the middle', async () => {
    const sql = "BEGIN;\nSET lock_timeout = '5s';\nALTER TABLE t ADD COLUMN x int;\nCREATE INDEX CONCURRENTLY IF NOT EXISTS idx_a ON t (c);\nALTER TABLE t ADD COLUMN y int;\nCOMMIT;";
    const result = await fix(sql);
    expect(result.fixedSql).toContain('BEGIN;');
    expect(result.unfixable.map(v => v.ruleId)).toContain('MP025');
  });

  it('leaves a concurrent statement that is already outside a transaction', async () => {
    const sql = 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_a ON t (c);';
    const result = await fix(sql);
    expect(result.fixedSql).toBe(sql);
  });
});

describe('MP012 auto-fix: ALTER TYPE ADD VALUE lifted out of its transaction', () => {
  it('drops the wrapper when the block holds nothing else', async () => {
    const result = await expectFix(
      "BEGIN;\nALTER TYPE mood ADD VALUE 'excited';\nCOMMIT;",
      "SET lock_timeout = '5s';\nALTER TYPE mood ADD VALUE 'excited';",
      11,
    );
    await expectParses(result.fixedSql);
  });

  it('moves COMMIT above a trailing ADD VALUE', async () => {
    await expectFix(
      "BEGIN;\nSET lock_timeout = '5s';\nALTER TABLE t ADD COLUMN x int;\nALTER TYPE mood ADD VALUE 'excited';\nCOMMIT;",
      "BEGIN;\nSET lock_timeout = '5s';\nALTER TABLE t ADD COLUMN x int;\nCOMMIT;\nALTER TYPE mood ADD VALUE 'excited';",
      11,
    );
  });
});

describe('fix placement across statements', () => {
  it('fixes the right statement when blank lines separate them', async () => {
    const result = await expectFix(
      'CREATE TABLE IF NOT EXISTS t (id bigint PRIMARY KEY);\n\n\nCREATE INDEX idx_a ON t (id);',
      "CREATE TABLE IF NOT EXISTS t (id bigint PRIMARY KEY);\n\n\nSET lock_timeout = '5s';\nSET statement_timeout = '30s';\nCREATE INDEX CONCURRENTLY IF NOT EXISTS idx_a ON t (id);",
    );
    await expectParses(result.fixedSql);
  });

  it('fixes both statements when two share one line', async () => {
    const result = await fix('CREATE INDEX idx_a ON t (c); CREATE INDEX idx_b ON t (d);');
    expect(result.fixedSql).toContain('CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_a');
    expect(result.fixedSql).toContain('CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_b');
  });

  it('preserves indentation when prepending a timeout', async () => {
    const result = await fix('  ALTER TABLE t ADD COLUMN x int;');
    expect(result.fixedSql).toBe("  SET lock_timeout = '5s';\n  ALTER TABLE t ADD COLUMN x int;");
  });

  it('leaves comments and spacing untouched where nothing changed', async () => {
    const sql = '-- migration header\n\nSET lock_timeout = \'5s\';\n\n-- add the column\nALTER TABLE t ADD COLUMN x int;\n';
    const result = await fix(sql);
    expect(result.fixedSql).toBe(sql);
  });
});

describe('plan-only violations are reported, never rewritten', () => {
  it('routes SET NOT NULL to the planner instead of fixing it', async () => {
    // Already carries both timeout guards, so nothing mechanical is left to do.
    const sql = "SET lock_timeout = '5s';\nSET statement_timeout = '30s';\nALTER TABLE users ALTER COLUMN email SET NOT NULL;";
    const result = await fix(sql);
    expect(result.fixedSql).toBe(sql);
    expect(result.fixedCount).toBe(0);
    expect(result.planOnly.map(v => v.ruleId)).toContain('MP002');
    // plan-only violations are also unfixed, so callers counting leftovers see them.
    expect(result.unfixable.map(v => v.ruleId)).toContain('MP002');
  });

  it('routes a column type change to the planner', async () => {
    const sql = "SET lock_timeout = '5s';\nSET statement_timeout = '30s';\nALTER TABLE orders ALTER COLUMN amount TYPE numeric(12,2);";
    const result = await fix(sql);
    expect(result.fixedSql).toBe(sql);
    expect(result.planOnly.map(v => v.ruleId)).toContain('MP007');
  });

  it('routes an unbatched backfill to the planner', async () => {
    const sql = "SET lock_timeout = '5s';\nUPDATE users SET status = 'active';";
    const result = await fix(sql);
    expect(result.fixedSql).toBe(sql);
    expect(result.planOnly.map(v => v.ruleId)).toContain('MP011');
  });
});

describe('fixed SQL always parses', () => {
  it('round-trips every SQL fixture in the repo on PG 11, 13, 17 and 18', async () => {
    const { readFile } = await import('node:fs/promises');
    const { glob } = await import('node:fs/promises');

    const files: string[] = [];
    // Framework fixtures are adapter inputs (structure dumps, extraction bait),
    // not fix targets — some are deliberately outside plain-migration dialect.
    for await (const f of glob(['examples/**/*.sql', 'tests/fixtures/**/*.sql'])) {
      if (!f.replace(/\\/g, '/').includes('tests/fixtures/frameworks/')) files.push(f);
    }
    expect(files.length).toBeGreaterThan(0);

    let checked = 0;
    for (const file of files) {
      const sql = await readFile(file, 'utf-8');
      const parsed = await parseMigration(sql);
      if (parsed.errors.length > 0) continue; // input is meant to be invalid

      for (const pgVersion of [11, 13, 17, 18]) {
        const statements = parsed.statements.map(s => ({
          ...s,
          lock: classifyLock(s.stmt, pgVersion),
          line: sql.slice(0, s.stmtLocation).split('\n').length,
        }));
        const violations = runRules(allRules, statements, pgVersion, undefined, sql);
        const { fixedSql } = autoFix(sql, violations);
        const reparsed = await parseMigration(fixedSql);
        expect(reparsed.errors, `${file} on PG${pgVersion}`).toEqual([]);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('fix classification table', () => {
  it('covers every rule exactly once', () => {
    expect(FIX_CLASSIFICATIONS).toHaveLength(allRules.length);
    const ids = FIX_CLASSIFICATIONS.map(c => c.ruleId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const rule of allRules) {
      expect(FIX_CLASSIFICATIONS.find(c => c.ruleId === rule.id), rule.id).toBeDefined();
    }
  });

  it('splits into 20 mechanical, 10 plan-only, and the rest unfixable', () => {
    expect(MECHANICAL_RULE_IDS.size).toBe(20);
    expect(PLAN_ONLY_RULE_IDS.size).toBe(10);
    expect(UNFIXABLE_RULE_IDS.size).toBe(allRules.length - 30);
    expect(MECHANICAL_RULE_IDS.size + PLAN_ONLY_RULE_IDS.size + UNFIXABLE_RULE_IDS.size).toBe(83);
  });

  it('gives every rule a reason', () => {
    for (const entry of FIX_CLASSIFICATIONS) {
      expect(entry.reason.length, entry.ruleId).toBeGreaterThan(20);
    }
  });

  it('agrees with isFixable and the exported count', () => {
    expect(FIXABLE_RULE_COUNT).toBe(20);
    expect(fixableRuleIds()).toEqual([...MECHANICAL_RULE_IDS].sort());
    for (const entry of FIX_CLASSIFICATIONS) {
      expect(isFixable(entry.ruleId), entry.ruleId).toBe(entry.fixClass === 'mechanical');
      expect(fixClassOf(entry.ruleId)).toBe(entry.fixClass);
    }
  });

  it('treats an unknown rule as unfixable', () => {
    expect(fixClassOf('MP999')).toBe('unfixable');
    expect(isFixable('MP999')).toBe(false);
  });
});
