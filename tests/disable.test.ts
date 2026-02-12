import { describe, it, expect } from 'vitest';
import { parseDisableDirectives, filterDisabledViolations } from '../src/rules/disable.js';
import { runRules } from '../src/rules/engine.js';
import { allRules } from '../src/rules/index.js';
import { parseMigration } from '../src/parser/parse.js';
import { classifyLock } from '../src/locks/classify.js';
import type { RuleViolation } from '../src/rules/engine.js';

describe('parseDisableDirectives', () => {
  it('parses statement-level disable for single rule', () => {
    const sql = '-- migrationpilot-disable MP001\nCREATE INDEX idx ON users (email);';
    const directives = parseDisableDirectives(sql);
    expect(directives).toHaveLength(1);
    expect(directives[0].type).toBe('statement');
    expect(directives[0].ruleIds).toEqual(['MP001']);
    expect(directives[0].line).toBe(1);
  });

  it('parses statement-level disable for multiple rules', () => {
    const sql = '-- migrationpilot-disable MP001, MP004\nCREATE INDEX idx ON users (email);';
    const directives = parseDisableDirectives(sql);
    expect(directives).toHaveLength(1);
    expect(directives[0].ruleIds).toEqual(['MP001', 'MP004']);
  });

  it('parses statement-level disable-all', () => {
    const sql = '-- migrationpilot-disable\nCREATE INDEX idx ON users (email);';
    const directives = parseDisableDirectives(sql);
    expect(directives).toHaveLength(1);
    expect(directives[0].ruleIds).toBe('all');
  });

  it('parses file-level disable', () => {
    const sql = '-- migrationpilot-disable-file\nCREATE INDEX idx ON users (email);';
    const directives = parseDisableDirectives(sql);
    expect(directives).toHaveLength(1);
    expect(directives[0].type).toBe('file');
    expect(directives[0].ruleIds).toBe('all');
  });

  it('parses file-level disable for specific rule', () => {
    const sql = '-- migrationpilot-disable-file MP001\nCREATE INDEX idx ON users (email);';
    const directives = parseDisableDirectives(sql);
    expect(directives).toHaveLength(1);
    expect(directives[0].type).toBe('file');
    expect(directives[0].ruleIds).toEqual(['MP001']);
  });

  it('parses block comment disable', () => {
    const sql = '/* migrationpilot-disable MP001 */\nCREATE INDEX idx ON users (email);';
    const directives = parseDisableDirectives(sql);
    expect(directives).toHaveLength(1);
    expect(directives[0].ruleIds).toEqual(['MP001']);
  });

  it('is case-insensitive', () => {
    const sql = '-- MigrationPilot-Disable MP001\nCREATE INDEX idx ON users (email);';
    const directives = parseDisableDirectives(sql);
    expect(directives).toHaveLength(1);
    expect(directives[0].ruleIds).toEqual(['MP001']);
  });

  it('parses multiple directives', () => {
    const sql = `-- migrationpilot-disable MP001
CREATE INDEX idx ON users (email);
-- migrationpilot-disable MP004
ALTER TABLE users ADD COLUMN name text;`;
    const directives = parseDisableDirectives(sql);
    expect(directives).toHaveLength(2);
    expect(directives[0].line).toBe(1);
    expect(directives[1].line).toBe(3);
  });

  it('returns empty for no directives', () => {
    const sql = 'CREATE INDEX CONCURRENTLY idx ON users (email);';
    const directives = parseDisableDirectives(sql);
    expect(directives).toHaveLength(0);
  });
});

describe('filterDisabledViolations', () => {
  const violations: RuleViolation[] = [
    { ruleId: 'MP001', ruleName: 'test', severity: 'critical', message: 'test', line: 2 },
    { ruleId: 'MP004', ruleName: 'test', severity: 'critical', message: 'test', line: 2 },
    { ruleId: 'MP001', ruleName: 'test', severity: 'critical', message: 'test', line: 5 },
  ];
  const stmtLines = [2, 5];

  it('filters nothing with no directives', () => {
    const result = filterDisabledViolations(violations, [], stmtLines);
    expect(result).toHaveLength(3);
  });

  it('filters specific rule for specific statement', () => {
    const directives = [{ type: 'statement' as const, ruleIds: ['MP001'] as string[], line: 1 }];
    const result = filterDisabledViolations(violations, directives, stmtLines);
    // MP001 at line 2 should be filtered, MP004 at line 2 and MP001 at line 5 should remain
    expect(result).toHaveLength(2);
    expect(result[0].ruleId).toBe('MP004');
    expect(result[1].ruleId).toBe('MP001');
    expect(result[1].line).toBe(5);
  });

  it('filters all rules for specific statement', () => {
    const directives = [{ type: 'statement' as const, ruleIds: 'all' as const, line: 1 }];
    const result = filterDisabledViolations(violations, directives, stmtLines);
    // Both violations at line 2 filtered, line 5 remains
    expect(result).toHaveLength(1);
    expect(result[0].line).toBe(5);
  });

  it('filters all violations with file-level disable-all', () => {
    const directives = [{ type: 'file' as const, ruleIds: 'all' as const, line: 1 }];
    const result = filterDisabledViolations(violations, directives, stmtLines);
    expect(result).toHaveLength(0);
  });

  it('filters specific rule file-wide', () => {
    const directives = [{ type: 'file' as const, ruleIds: ['MP001'] as string[], line: 1 }];
    const result = filterDisabledViolations(violations, directives, stmtLines);
    // All MP001 violations removed, MP004 remains
    expect(result).toHaveLength(1);
    expect(result[0].ruleId).toBe('MP004');
  });
});

describe('inline disable integration with runRules', () => {
  async function analyze(sql: string) {
    const parsed = await parseMigration(sql);
    const stmts = parsed.statements.map(s => {
      const lock = classifyLock(s.stmt, 17);
      const line = sql.slice(0, s.stmtLocation).split('\n').length;
      return { ...s, lock, line };
    });
    return runRules(allRules, stmts, 17, undefined, sql);
  }

  it('suppresses MP001 with inline disable', async () => {
    const sql = `-- migrationpilot-disable MP001
CREATE INDEX idx_email ON users (email);`;
    const violations = await analyze(sql);
    expect(violations.find(v => v.ruleId === 'MP001')).toBeUndefined();
  });

  it('still reports MP004 when only MP001 is disabled', async () => {
    const sql = `-- migrationpilot-disable MP001
CREATE INDEX idx_email ON users (email);`;
    const violations = await analyze(sql);
    expect(violations.find(v => v.ruleId === 'MP004')).toBeDefined();
  });

  it('suppresses all rules with blanket disable', async () => {
    const sql = `-- migrationpilot-disable
CREATE INDEX idx_email ON users (email);`;
    const violations = await analyze(sql);
    expect(violations).toHaveLength(0);
  });

  it('suppresses entire file with disable-file', async () => {
    const sql = `-- migrationpilot-disable-file
CREATE INDEX idx_email ON users (email);
ALTER TABLE users ADD COLUMN name text;`;
    const violations = await analyze(sql);
    expect(violations).toHaveLength(0);
  });

  it('does not suppress violations without disable comment', async () => {
    const sql = 'CREATE INDEX idx_email ON users (email);';
    const violations = await analyze(sql);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.find(v => v.ruleId === 'MP001')).toBeDefined();
  });
});
