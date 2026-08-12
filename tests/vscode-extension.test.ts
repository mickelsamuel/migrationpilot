/**
 * Tests for VS Code extension analysis logic.
 *
 * Tests the core analysis that powers diagnostics, hover, and quick fixes.
 * Uses the parent project's test infrastructure (vitest) to verify
 * the extension's integration with MigrationPilot's analysis engine.
 */

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { parseMigration } from '../src/parser/parse';
import { classifyLock } from '../src/locks/classify';
import { allRules, runRules } from '../src/rules/index';
import { autoFix, fixableRuleIds, FIXABLE_RULE_COUNT } from '../src/fixer/fix';
import { FIX_CLASSIFICATIONS } from '../src/fixer/classification';
import {
  computeQuickFix,
  applyQuickFix,
  fixTitle,
} from '../vscode-migrationpilot/src/fix-action';

// Helper: run full analysis pipeline (mirrors diagnostics.ts logic)
async function analyzeForExtension(sql: string, pgVersion = 17) {
  const parsed = await parseMigration(sql);
  if (parsed.errors.length > 0) throw new Error('Parse error');

  const statementsWithLocks = parsed.statements.map(s => {
    const lock = classifyLock(s.stmt, pgVersion);
    return { ...s, lock };
  });

  return runRules(allRules, statementsWithLocks, pgVersion, undefined, sql);
}

describe('VS Code Extension — Analysis Pipeline', () => {
  it('detects CREATE INDEX without CONCURRENTLY (MP001)', async () => {
    const violations = await analyzeForExtension('CREATE INDEX idx ON users (email);');
    expect(violations.some(v => v.ruleId === 'MP001')).toBe(true);
  });

  it('returns no violations for clean SQL', async () => {
    const violations = await analyzeForExtension(
      "SET lock_timeout = '5s';\nSET statement_timeout = '30s';\nCREATE INDEX CONCURRENTLY IF NOT EXISTS idx ON users (email);",
    );
    const critical = violations.filter(v => v.severity === 'critical');
    expect(critical).toHaveLength(0);
  });

  it('provides safe alternative for MP001', async () => {
    const violations = await analyzeForExtension('CREATE INDEX idx ON users (email);');
    const mp001 = violations.find(v => v.ruleId === 'MP001');
    expect(mp001).toBeDefined();
    expect(mp001?.safeAlternative).toBeDefined();
  });

  it('respects inline disable comments', async () => {
    const sql = '-- migrationpilot-disable MP001\nCREATE INDEX idx ON users (email);';
    const violations = await analyzeForExtension(sql);
    expect(violations.some(v => v.ruleId === 'MP001')).toBe(false);
  });

  it('detects multiple violations in one file', async () => {
    const sql = `
      CREATE INDEX idx ON users (email);
      ALTER TABLE orders ALTER COLUMN total TYPE numeric(10,2);
    `;
    const violations = await analyzeForExtension(sql);
    expect(violations.length).toBeGreaterThanOrEqual(2);
  });

  it('handles empty SQL gracefully', async () => {
    const violations = await analyzeForExtension('-- just a comment');
    expect(violations).toHaveLength(0);
  });

  it('includes rule metadata for hover info', async () => {
    const violations = await analyzeForExtension('CREATE INDEX idx ON users (email);');
    const mp001 = violations.find(v => v.ruleId === 'MP001');
    expect(mp001).toBeDefined();
    expect(mp001?.ruleName).toBeDefined();
    expect(mp001?.message).toBeDefined();

    const rule = allRules.find(r => r.id === 'MP001');
    expect(rule?.whyItMatters).toBeDefined();
    expect(rule?.docsUrl).toBeDefined();
  });

  it('the whole rule catalogue is available to the extension', () => {
    expect(allRules.length).toBeGreaterThan(0);
    expect(allRules.every(r => /^MP\d{3}$/.test(r.id))).toBe(true);
  });

  it('correctly maps violation line numbers', async () => {
    const sql = 'SELECT 1;\nCREATE INDEX idx ON users (email);';
    const violations = await analyzeForExtension(sql);
    const mp001 = violations.find(v => v.ruleId === 'MP001');
    expect(mp001).toBeDefined();
    // Line number depends on statement offset in parsed SQL
    expect(mp001?.line).toBeGreaterThanOrEqual(1);
  });

  it('detects MP004 (missing lock_timeout)', async () => {
    const violations = await analyzeForExtension('ALTER TABLE users ADD COLUMN name TEXT;');
    expect(violations.some(v => v.ruleId === 'MP004')).toBe(true);
  });

  it('uses pg version for version-aware rules', async () => {
    // MP003 fires as critical on PG < 11 (table rewrite), warning on PG 11+ (per-row eval)
    const sql = 'ALTER TABLE users ADD COLUMN created_at TIMESTAMP DEFAULT now();';
    const oldPg = await analyzeForExtension(sql, 10);
    const newPg = await analyzeForExtension(sql, 17);
    const oldMP003 = oldPg.find(v => v.ruleId === 'MP003');
    const newMP003 = newPg.find(v => v.ruleId === 'MP003');
    expect(oldMP003).toBeDefined();
    expect(oldMP003?.severity).toBe('critical');
    expect(newMP003).toBeDefined();
    expect(newMP003?.severity).toBe('warning');
  });
});

/**
 * One migration per auto-fixable rule, each written so that rule actually
 * fires. `covers every rule the CLI can fix` asserts this map matches the
 * fixer's registry exactly, so adding a mechanical rule to the engine fails
 * here until the extension is shown to fix it too.
 */
const FIX_SAMPLES: Record<string, { sql: string; pgVersion?: number }> = {
  MP001: { sql: 'CREATE INDEX idx_a ON t (c);' },
  MP004: { sql: 'ALTER TABLE t ADD COLUMN x int;' },
  MP005: { sql: "SET lock_timeout = '5s';\nALTER TABLE orders ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users (id);" },
  MP009: { sql: 'DROP INDEX idx_a;' },
  MP012: { sql: "BEGIN;\nALTER TYPE mood ADD VALUE 'excited';\nCOMMIT;", pgVersion: 11 },
  MP020: { sql: 'CREATE INDEX idx_a ON t (c);' },
  MP021: { sql: 'REINDEX TABLE t;' },
  MP023: { sql: 'CREATE TABLE t (id bigint PRIMARY KEY);' },
  MP025: { sql: 'BEGIN;\nCREATE INDEX CONCURRENTLY IF NOT EXISTS idx_a ON t (c);\nCOMMIT;' },
  MP030: { sql: "SET lock_timeout = '5s';\nALTER TABLE orders ADD CONSTRAINT amount_positive CHECK (amount > 0);" },
  MP033: { sql: 'REFRESH MATERIALIZED VIEW mv_daily;' },
  MP037: { sql: 'CREATE TABLE IF NOT EXISTS t (id bigint PRIMARY KEY, name VARCHAR(255));' },
  MP038: { sql: 'CREATE TABLE IF NOT EXISTS accounts (id integer PRIMARY KEY, label text);' },
  MP039: { sql: 'CREATE TABLE IF NOT EXISTS accounts (id serial PRIMARY KEY, label text);' },
  MP040: { sql: 'CREATE TABLE IF NOT EXISTS events (id bigint PRIMARY KEY, created_at timestamp without time zone);' },
  MP041: { sql: 'CREATE TABLE IF NOT EXISTS t (id bigint PRIMARY KEY, code CHAR(3));' },
  MP042: { sql: "SET statement_timeout = '30s';\nCREATE INDEX CONCURRENTLY ON events (occurred_at);" },
  MP046: { sql: 'ALTER TABLE t DETACH PARTITION t_2024;' },
  MP074: { sql: "SET lock_timeout = '5s';\nALTER TABLE orders ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users (id) NOT VALID;" },
  MP077: { sql: "SET lock_timeout = '5s';\nALTER TABLE docs ALTER COLUMN body SET COMPRESSION pglz;" },
};

describe('VS Code Extension — Quick Fix Parity With The CLI', () => {
  it('covers every rule the CLI can fix, and nothing else', () => {
    expect(Object.keys(FIX_SAMPLES).sort()).toEqual(fixableRuleIds());
  });

  it('gives every fixable rule a menu label, and no other rule one', () => {
    for (const entry of FIX_CLASSIFICATIONS) {
      if (entry.fixClass === 'mechanical') {
        expect(entry.fixTitle, entry.ruleId).toBeDefined();
        expect(fixTitle(entry.ruleId).length, entry.ruleId).toBeLessThanOrEqual(60);
      } else {
        expect(entry.fixTitle, entry.ruleId).toBeUndefined();
      }
    }
  });

  // The parity claim, one rule at a time: the editor's quick fix produces the
  // same bytes `migrationpilot --fix` writes for that violation.
  for (const [ruleId, sample] of Object.entries(FIX_SAMPLES)) {
    it(`${ruleId}: the quick fix writes exactly what --fix writes`, async () => {
      const { sql } = sample;
      const pgVersion = sample.pgVersion ?? 17;

      const violations = await analyzeForExtension(sql, pgVersion);
      const violation = violations.find(v => v.ruleId === ruleId);
      expect(violation, `${ruleId} did not fire on its own sample`).toBeDefined();

      const fix = computeQuickFix(sql, ruleId, violation!.line);
      expect(fix, `${ruleId} produced no quick fix`).not.toBeNull();

      const applied = applyQuickFix(sql, fix!);
      expect(applied).not.toBe(sql);
      expect(applied).toBe(autoFix(sql, [violation!]).fixedSql);

      const reparsed = await parseMigration(applied);
      expect(reparsed.errors, `${ruleId} produced SQL that does not parse`).toEqual([]);
    });
  }

  it('narrows the edit to the span that changed', () => {
    const sql = 'CREATE INDEX idx_a ON t (c);';
    const fix = computeQuickFix(sql, 'MP001', 1);
    // A pure insertion of one keyword, not a rewrite of the whole document.
    expect(fix).toEqual({
      start: 13,
      end: 13,
      newText: 'CONCURRENTLY ',
      title: 'Add CONCURRENTLY to CREATE INDEX',
    });
  });

  it('offers nothing for a rule the CLI cannot fix', () => {
    expect(computeQuickFix('ALTER TABLE users ALTER COLUMN email SET NOT NULL;', 'MP002', 1)).toBeNull();
    expect(computeQuickFix('DROP TABLE users;', 'MP026', 1)).toBeNull();
  });

  it('offers nothing when the rule is already satisfied further up the file', () => {
    // MP004 is per-file: one SET lock_timeout covers the statements below it,
    // so there is no edit left to make on the second one.
    const sql = "SET lock_timeout = '5s';\nALTER TABLE t ADD COLUMN x int;\nALTER TABLE t ADD COLUMN y int;";
    expect(computeQuickFix(sql, 'MP004', 3)).toBeNull();
  });

  it('offers nothing when the fix does not apply to the statement on that line', () => {
    // MP025 only lifts a statement that is first, last, or alone in its block.
    const sql = 'BEGIN;\nALTER TABLE t ADD COLUMN x int;\nCREATE INDEX CONCURRENTLY idx_a ON t (c);\nALTER TABLE t ADD COLUMN y int;\nCOMMIT;';
    expect(computeQuickFix(sql, 'MP025', 3)).toBeNull();
  });

  it('fixes the statement the cursor is on when two rules share a file', async () => {
    const sql = 'CREATE INDEX idx_a ON t (c);\nDROP INDEX idx_b;';
    const violations = await analyzeForExtension(sql);
    const drop = violations.find(v => v.ruleId === 'MP009');
    expect(drop).toBeDefined();

    const fix = computeQuickFix(sql, 'MP009', drop!.line);
    expect(applyQuickFix(sql, fix!)).toBe('CREATE INDEX idx_a ON t (c);\nDROP INDEX CONCURRENTLY idx_b;');
  });
});

describe('VS Code Extension — Rule Exclusion', () => {
  it('excludes specified rules from analysis', async () => {
    const excludeSet = new Set(['MP001', 'MP004']);
    const sql = 'CREATE INDEX idx ON users (email);';

    const parsed = await parseMigration(sql);
    const statementsWithLocks = parsed.statements.map(s => {
      const lock = classifyLock(s.stmt, 17);
      return { ...s, lock };
    });

    const enabledRules = allRules.filter(r => !excludeSet.has(r.id));
    const violations = runRules(enabledRules, statementsWithLocks, 17, undefined, sql);

    expect(violations.some(v => v.ruleId === 'MP001')).toBe(false);
    expect(violations.some(v => v.ruleId === 'MP004')).toBe(false);
  });
});

/**
 * The README states two counts as plain prose, which is the one place the
 * extension can still fall behind the engine without any code changing. These
 * read the numbers back out and compare them to the registries, so adding a
 * rule or a fixer fails here rather than shipping a stale claim to the
 * Marketplace listing.
 */
describe('VS Code Extension — README Counts', () => {
  const readme = readFileSync(
    new URL('../vscode-migrationpilot/README.md', import.meta.url),
    'utf8',
  );

  it('claims the number of auto-fixable rules the fixer actually has', () => {
    const claimed = readme.match(/all (\d+) auto-fixable rules/);
    expect(claimed, 'README no longer states an auto-fixable rule count').not.toBeNull();
    expect(Number(claimed![1])).toBe(FIXABLE_RULE_COUNT);
  });

  it('claims the number of rules the engine actually ships', () => {
    const claimed = readme.match(/All (\d+) Rules/);
    expect(claimed, 'README no longer states a total rule count').not.toBeNull();
    expect(Number(claimed![1])).toBe(allRules.length);
  });
});
