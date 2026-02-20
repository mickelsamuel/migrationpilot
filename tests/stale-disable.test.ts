import { describe, it, expect } from 'vitest';
import { parseDisableDirectives, findStaleDirectives } from '../src/rules/disable.js';
import type { RuleViolation } from '../src/rules/engine.js';

function makeViolation(ruleId: string, line: number): RuleViolation {
  return {
    ruleId,
    ruleName: 'test',
    severity: 'warning',
    message: 'test',
    line,
    statement: 'test',
  };
}

describe('stale disable directive detection', () => {
  it('detects stale statement-level disable with no matching violation', () => {
    const sql = '-- migrationpilot-disable MP001\nCREATE TABLE users (id INT);';
    const directives = parseDisableDirectives(sql);
    const violations: RuleViolation[] = []; // No violations at all
    const stale = findStaleDirectives(directives, violations, [2]);

    expect(stale).toHaveLength(1);
    expect(stale[0]?.ruleIds).toEqual(['MP001']);
    expect(stale[0]?.line).toBe(1);
  });

  it('does not flag active disable that suppresses a violation', () => {
    const sql = '-- migrationpilot-disable MP001\nCREATE INDEX idx ON users (email);';
    const directives = parseDisableDirectives(sql);
    const violations = [makeViolation('MP001', 2)];
    const stale = findStaleDirectives(directives, violations, [2]);

    expect(stale).toHaveLength(0);
  });

  it('detects stale file-level disable', () => {
    const sql = '-- migrationpilot-disable-file MP037\nCREATE TABLE users (id INT);';
    const directives = parseDisableDirectives(sql);
    const violations: RuleViolation[] = []; // No MP037 violations
    const stale = findStaleDirectives(directives, violations, [2]);

    expect(stale).toHaveLength(1);
    expect(stale[0]?.ruleIds).toEqual(['MP037']);
  });

  it('detects partially stale disable (one rule used, one not)', () => {
    const sql = '-- migrationpilot-disable MP001, MP004\nCREATE INDEX idx ON users (email);';
    const directives = parseDisableDirectives(sql);
    const violations = [makeViolation('MP001', 2)]; // MP001 fires but not MP004
    const stale = findStaleDirectives(directives, violations, [2]);

    expect(stale).toHaveLength(1);
    expect(stale[0]?.ruleIds).toEqual(['MP004']);
  });

  it('skips blanket disable-all comments', () => {
    const sql = '-- migrationpilot-disable\nCREATE INDEX idx ON users (email);';
    const directives = parseDisableDirectives(sql);
    const violations: RuleViolation[] = [];
    const stale = findStaleDirectives(directives, violations, [2]);

    expect(stale).toHaveLength(0);
  });

  it('detects disable with no following statement', () => {
    const sql = 'CREATE TABLE users (id INT);\n-- migrationpilot-disable MP001';
    const directives = parseDisableDirectives(sql);
    const violations: RuleViolation[] = [];
    const stale = findStaleDirectives(directives, violations, [1]);

    expect(stale).toHaveLength(1);
    expect(stale[0]?.reason).toContain('no following SQL statement');
  });

  it('handles multiple stale directives', () => {
    const sql = `-- migrationpilot-disable MP001
CREATE TABLE users (id INT);
-- migrationpilot-disable MP037
ALTER TABLE users ADD COLUMN name TEXT;`;
    const directives = parseDisableDirectives(sql);
    const violations: RuleViolation[] = []; // No violations
    const stale = findStaleDirectives(directives, violations, [2, 4]);

    expect(stale).toHaveLength(2);
  });
});
