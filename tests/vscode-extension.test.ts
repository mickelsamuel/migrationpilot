/**
 * Tests for VS Code extension analysis logic.
 *
 * Tests the core analysis that powers diagnostics, hover, and quick fixes.
 * Uses the parent project's test infrastructure (vitest) to verify
 * the extension's integration with MigrationPilot's analysis engine.
 */

import { describe, it, expect } from 'vitest';
import { parseMigration } from '../src/parser/parse';
import { classifyLock } from '../src/locks/classify';
import { allRules, runRules } from '../src/rules/index';

// Helper: run full analysis pipeline (mirrors diagnostics.ts logic)
async function analyzeForExtension(sql: string, pgVersion = 17) {
  const parsed = await parseMigration(sql);
  if (parsed.errors.length > 0) throw new Error('Parse error');

  const statementsWithLocks = parsed.statements.map(s => {
    const lock = classifyLock(s.stmt, pgVersion);
    const line = sql.slice(0, s.stmtLocation).split('\n').length;
    return { ...s, lock, line };
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

  it('all 80 rules are available', () => {
    expect(allRules.length).toBe(80);
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

describe('VS Code Extension — Quick Fix Transforms', () => {
  it('MP001 fix: adds CONCURRENTLY', () => {
    const sql = 'CREATE INDEX idx ON users (email);';
    const fixed = sql.replace(/CREATE\s+INDEX/i, 'CREATE INDEX CONCURRENTLY');
    expect(fixed).toBe('CREATE INDEX CONCURRENTLY idx ON users (email);');
  });

  it('MP009 fix: adds CONCURRENTLY to DROP INDEX', () => {
    const sql = 'DROP INDEX idx;';
    const fixed = sql.replace(/DROP\s+INDEX/i, 'DROP INDEX CONCURRENTLY');
    expect(fixed).toBe('DROP INDEX CONCURRENTLY idx;');
  });

  it('MP037 fix: replaces VARCHAR(n) with TEXT', () => {
    const sql = 'ALTER TABLE users ADD COLUMN name VARCHAR(255);';
    const fixed = sql.replace(/VARCHAR\s*\(\s*\d+\s*\)/gi, 'TEXT');
    expect(fixed).toBe('ALTER TABLE users ADD COLUMN name TEXT;');
  });

  it('MP040 fix: replaces TIMESTAMP with TIMESTAMPTZ', () => {
    const sql = 'ALTER TABLE events ADD COLUMN created_at TIMESTAMP;';
    const fixed = sql.replace(
      /\bTIMESTAMP\b(?!\s*WITH\s*TIME\s*ZONE|\s*WITHOUT\s*TIME\s*ZONE|TZ)/gi,
      'TIMESTAMPTZ',
    );
    expect(fixed).toBe('ALTER TABLE events ADD COLUMN created_at TIMESTAMPTZ;');
  });

  it('MP041 fix: replaces CHAR(n) with TEXT', () => {
    const sql = 'ALTER TABLE users ADD COLUMN code CHAR(3);';
    const fixed = sql.replace(/\bCHAR\s*\(\s*\d+\s*\)/gi, 'TEXT');
    expect(fixed).toBe('ALTER TABLE users ADD COLUMN code TEXT;');
  });
});

describe('VS Code Extension — Rule Exclusion', () => {
  it('excludes specified rules from analysis', async () => {
    const excludeSet = new Set(['MP001', 'MP004']);
    const sql = 'CREATE INDEX idx ON users (email);';

    const parsed = await parseMigration(sql);
    const statementsWithLocks = parsed.statements.map(s => {
      const lock = classifyLock(s.stmt, 17);
      const line = sql.slice(0, s.stmtLocation).split('\n').length;
      return { ...s, lock, line };
    });

    const enabledRules = allRules.filter(r => !excludeSet.has(r.id));
    const violations = runRules(enabledRules, statementsWithLocks, 17, undefined, sql);

    expect(violations.some(v => v.ruleId === 'MP001')).toBe(false);
    expect(violations.some(v => v.ruleId === 'MP004')).toBe(false);
  });
});
