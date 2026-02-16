import { describe, it, expect } from 'vitest';
import { applySeverityOverrides } from '../src/rules/engine.js';
import type { RuleViolation } from '../src/rules/engine.js';

const violations: RuleViolation[] = [
  {
    ruleId: 'MP001',
    ruleName: 'require-concurrent-index',
    severity: 'critical',
    message: 'CREATE INDEX blocks writes.',
    line: 1,
  },
  {
    ruleId: 'MP004',
    ruleName: 'require-lock-timeout',
    severity: 'warning',
    message: 'No lock_timeout set.',
    line: 2,
  },
];

describe('applySeverityOverrides', () => {
  it('downgrades critical to warning', () => {
    const result = applySeverityOverrides(violations, {
      MP001: { severity: 'warning' },
    });
    expect(result[0]!.severity).toBe('warning');
    expect(result[1]!.severity).toBe('warning'); // unchanged
  });

  it('upgrades warning to critical', () => {
    const result = applySeverityOverrides(violations, {
      MP004: { severity: 'critical' },
    });
    expect(result[0]!.severity).toBe('critical'); // unchanged
    expect(result[1]!.severity).toBe('critical'); // upgraded
  });

  it('leaves violations unchanged when no matching override', () => {
    const result = applySeverityOverrides(violations, {
      MP099: { severity: 'warning' },
    });
    expect(result[0]!.severity).toBe('critical');
    expect(result[1]!.severity).toBe('warning');
  });

  it('returns violations unchanged when no overrides provided', () => {
    const result = applySeverityOverrides(violations, undefined);
    expect(result).toBe(violations); // same reference
  });

  it('returns violations unchanged for empty config', () => {
    const result = applySeverityOverrides(violations, {});
    expect(result[0]!.severity).toBe('critical');
    expect(result[1]!.severity).toBe('warning');
  });

  it('handles empty violations array', () => {
    const result = applySeverityOverrides([], { MP001: { severity: 'warning' } });
    expect(result).toHaveLength(0);
  });

  it('ignores boolean rule configs', () => {
    const result = applySeverityOverrides(violations, {
      MP001: true,
      MP004: false,
    });
    expect(result[0]!.severity).toBe('critical');
    expect(result[1]!.severity).toBe('warning');
  });
});
