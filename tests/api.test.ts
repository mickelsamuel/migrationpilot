import { describe, it, expect } from 'vitest';
import { analyzeSQL, AnalysisError } from '../src/analysis/analyze.js';
import { allRules } from '../src/rules/index.js';
import { parseMigration } from '../src/parser/parse.js';
import { classifyLock } from '../src/locks/classify.js';
import { calculateRisk } from '../src/scoring/score.js';

describe('analyzeSQL (shared)', () => {
  it('returns AnalysisOutput for valid SQL', async () => {
    const result = await analyzeSQL(
      'CREATE INDEX idx_users_email ON users (email);',
      'test.sql',
      17,
      allRules,
    );

    expect(result.file).toBe('test.sql');
    expect(result.statements).toHaveLength(1);
    expect(result.overallRisk.level).toBeDefined();
    expect(result.violations.length).toBeGreaterThan(0);
  });

  it('throws AnalysisError for invalid SQL', async () => {
    await expect(
      analyzeSQL('NOT VALID SQL ???', 'bad.sql', 17, allRules),
    ).rejects.toThrow(AnalysisError);
  });

  it('AnalysisError contains file and parseErrors', async () => {
    try {
      await analyzeSQL('SELECTT * FROMM;', 'bad.sql', 17, allRules);
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AnalysisError);
      const ae = err as AnalysisError;
      expect(ae.file).toBe('bad.sql');
      expect(ae.parseErrors.length).toBeGreaterThan(0);
    }
  });

  it('returns GREEN for safe migration', async () => {
    const result = await analyzeSQL(
      "SET lock_timeout = '5s';\nSET statement_timeout = '30s';\nCREATE INDEX CONCURRENTLY IF NOT EXISTS idx_test ON users (email);",
      'clean.sql',
      17,
      allRules,
    );

    expect(result.overallRisk.level).toBe('GREEN');
  });

  it('detects violations with correct rule IDs', async () => {
    const result = await analyzeSQL(
      'CREATE INDEX idx_test ON users (email);',
      'test.sql',
      17,
      allRules,
    );

    const ruleIds = result.violations.map(v => v.ruleId);
    expect(ruleIds).toContain('MP001'); // require-concurrent-index
  });
});

describe('allRules', () => {
  it('contains 48 rules', () => {
    expect(allRules).toHaveLength(48);
  });

  it('all rules have required metadata', () => {
    for (const rule of allRules) {
      expect(rule.id).toMatch(/^MP\d{3}$/);
      expect(rule.name).toBeTruthy();
      expect(rule.whyItMatters).toBeTruthy();
      expect(rule.docsUrl).toContain('migrationpilot.dev/rules');
    }
  });
});

describe('parseMigration', () => {
  it('parses simple DDL', async () => {
    const result = await parseMigration('CREATE TABLE users (id SERIAL PRIMARY KEY);');
    expect(result.statements).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
  });
});

describe('classifyLock', () => {
  it('returns correct lock for CREATE TABLE', async () => {
    const parsed = await parseMigration('CREATE TABLE test (id INT);');
    const stmt = parsed.statements[0]!.stmt;
    const lock = classifyLock(stmt, 17);
    expect(lock.lockType).toBe('ACCESS EXCLUSIVE');
  });
});

describe('calculateRisk', () => {
  it('returns GREEN for ACCESS SHARE', () => {
    const risk = calculateRisk({ lockType: 'ACCESS SHARE', blocksReads: false, blocksWrites: false, longHeld: false });
    expect(risk.level).toBe('GREEN');
  });
});
