import { describe, it, expect } from 'vitest';
import { analyzeSQL } from '../src/analysis/analyze.js';
import { freeRules } from '../src/rules/index.js';
import { classifyLock } from '../src/locks/classify.js';
import { parseMigration } from '../src/parser/parse.js';
import { extractTargets } from '../src/parser/extract.js';
import { isFixable, autoFix } from '../src/fixer/fix.js';

/**
 * Tests for MCP server tool logic.
 * We test the underlying functions that the MCP tools call
 * rather than starting an actual MCP server.
 */

describe('MCP: analyze_migration', () => {
  it('returns violations for unsafe SQL', async () => {
    const sql = 'CREATE INDEX idx_users_email ON users (email);';
    const result = await analyzeSQL(sql, '<mcp>', 17, freeRules);

    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.violations.some(v => v.ruleId === 'MP001')).toBe(true);
    expect(result.overallRisk.level).toBeDefined();
    expect(result.overallRisk.score).toBeGreaterThan(0);
  });

  it('returns clean result for safe SQL', async () => {
    const sql = 'SET lock_timeout = \'5s\';\nCREATE INDEX CONCURRENTLY idx_users_email ON users (email);';
    const result = await analyzeSQL(sql, '<mcp>', 17, freeRules);

    const criticalViolations = result.violations.filter(v => v.severity === 'critical');
    expect(criticalViolations.length).toBe(0);
  });

  it('includes statement lock analysis', async () => {
    const sql = 'ALTER TABLE users ADD COLUMN age integer;';
    const result = await analyzeSQL(sql, '<mcp>', 17, freeRules);

    expect(result.statements.length).toBeGreaterThan(0);
    expect(result.statements[0]!.lock.lockType).toBeDefined();
    expect(typeof result.statements[0]!.lock.blocksReads).toBe('boolean');
    expect(typeof result.statements[0]!.lock.blocksWrites).toBe('boolean');
  });

  it('respects pg_version parameter', async () => {
    const sql = 'ALTER TABLE users ALTER COLUMN name SET DEFAULT now();';
    const resultPg10 = await analyzeSQL(sql, '<mcp>', 10, freeRules);
    const resultPg17 = await analyzeSQL(sql, '<mcp>', 17, freeRules);

    // PG 10 and PG 17 may produce different violations for volatile defaults
    expect(resultPg10.violations).toBeDefined();
    expect(resultPg17.violations).toBeDefined();
  });

  it('throws on empty SQL', async () => {
    await expect(analyzeSQL('', '<mcp>', 17, freeRules)).rejects.toThrow();
  });

  it('throws on invalid SQL', async () => {
    await expect(analyzeSQL('NOT VALID SQL AT ALL !!!', '<mcp>', 17, freeRules)).rejects.toThrow();
  });
});

describe('MCP: suggest_fix', () => {
  it('fixes CREATE INDEX without CONCURRENTLY', async () => {
    const sql = 'CREATE INDEX idx_test ON users (email);';
    const result = await analyzeSQL(sql, '<mcp>', 17, freeRules);
    const fixResult = autoFix(sql, result.violations);

    expect(fixResult.fixedSql).toContain('CONCURRENTLY');
    expect(fixResult.fixedCount).toBeGreaterThan(0);
  });

  it('reports unfixable violations', async () => {
    const sql = 'ALTER TABLE users ALTER COLUMN name TYPE varchar(50);';
    const result = await analyzeSQL(sql, '<mcp>', 17, freeRules);

    if (result.violations.length > 0) {
      const fixResult = autoFix(sql, result.violations);
      // MP007 (no-column-type-change) is not auto-fixable
      const unfixableIds = fixResult.unfixable.map(v => v.ruleId);
      expect(unfixableIds.includes('MP007')).toBe(true);
    }
  });

  it('returns original SQL when no violations', async () => {
    const sql = 'SET lock_timeout = \'5s\';\nSET statement_timeout = \'30s\';\nCREATE INDEX CONCURRENTLY IF NOT EXISTS idx_test ON users (email);';
    const result = await analyzeSQL(sql, '<mcp>', 17, freeRules);
    const fixResult = autoFix(sql, result.violations);
    expect(fixResult.fixedCount).toBe(0);
  });

  it('identifies fixable rules correctly', () => {
    expect(isFixable('MP001')).toBe(true);
    expect(isFixable('MP004')).toBe(true);
    expect(isFixable('MP009')).toBe(true);
    expect(isFixable('MP020')).toBe(true);
    expect(isFixable('MP007')).toBe(false);
    expect(isFixable('MP010')).toBe(false);
  });
});

describe('MCP: explain_lock', () => {
  it('classifies CREATE INDEX lock', async () => {
    const parsed = await parseMigration('CREATE INDEX idx_test ON users (email);');
    expect(parsed.errors.length).toBe(0);

    const stmt = parsed.statements[0]!;
    const lock = classifyLock(stmt.stmt, 17);

    expect(lock.lockType).toBe('SHARE');
    expect(lock.blocksReads).toBe(false);
    expect(lock.blocksWrites).toBe(true);
  });

  it('classifies ALTER TABLE lock as AccessExclusiveLock', async () => {
    const parsed = await parseMigration('ALTER TABLE users ADD COLUMN age integer;');
    const stmt = parsed.statements[0]!;
    const lock = classifyLock(stmt.stmt, 17);

    expect(lock.lockType).toBe('ACCESS EXCLUSIVE');
    expect(lock.blocksReads).toBe(true);
    expect(lock.blocksWrites).toBe(true);
  });

  it('classifies CREATE INDEX CONCURRENTLY as ShareUpdateExclusiveLock', async () => {
    const parsed = await parseMigration('CREATE INDEX CONCURRENTLY idx_test ON users (email);');
    const stmt = parsed.statements[0]!;
    const lock = classifyLock(stmt.stmt, 17);

    expect(lock.lockType).toBe('SHARE UPDATE EXCLUSIVE');
    expect(lock.blocksReads).toBe(false);
    expect(lock.blocksWrites).toBe(false);
  });

  it('extracts target tables', async () => {
    const parsed = await parseMigration('ALTER TABLE public.users ADD COLUMN age integer;');
    const stmt = parsed.statements[0]!;
    const targets = extractTargets(stmt.stmt);

    expect(targets.length).toBeGreaterThan(0);
    expect(targets[0]!.tableName).toBe('users');
  });

  it('handles parse errors', async () => {
    const parsed = await parseMigration('INVALID SQL !!!');
    expect(parsed.errors.length).toBeGreaterThan(0);
  });
});

describe('MCP: list_rules', () => {
  it('returns all free rules', () => {
    expect(freeRules.length).toBe(77);
  });

  it('each rule has required metadata', () => {
    for (const rule of freeRules) {
      expect(rule.id).toMatch(/^MP\d{3}$/);
      expect(rule.name).toBeTruthy();
      expect(rule.severity).toMatch(/^(critical|warning)$/);
      expect(rule.description).toBeTruthy();
      expect(typeof rule.check).toBe('function');
    }
  });

  it('does not include Pro rules', () => {
    const ruleIds = freeRules.map(r => r.id);
    expect(ruleIds).not.toContain('MP013');
    expect(ruleIds).not.toContain('MP014');
    expect(ruleIds).not.toContain('MP019');
  });

  it('includes auto-fix metadata', () => {
    const fixableRules = freeRules.filter(r => isFixable(r.id));
    expect(fixableRules.length).toBeGreaterThan(0);

    // Known fixable rules
    expect(isFixable('MP001')).toBe(true);
    expect(isFixable('MP030')).toBe(true);
    expect(isFixable('MP033')).toBe(true);
  });

  it('each rule has docsUrl', () => {
    for (const rule of freeRules) {
      expect(rule.docsUrl).toMatch(/^https:\/\/migrationpilot\.dev\/rules\/mp\d{3}$/);
    }
  });
});
