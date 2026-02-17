import { describe, it, expect } from 'vitest';
import { formatJson, formatJsonMulti } from '../src/output/json.js';
import type { JsonReport, JsonMultiReport } from '../src/output/json.js';
import type { AnalysisOutput } from '../src/output/cli.js';
import { allRules } from '../src/rules/index.js';

function makeAnalysis(overrides?: Partial<AnalysisOutput>): AnalysisOutput {
  return {
    file: 'migrations/001_add_index.sql',
    statements: [
      {
        sql: 'CREATE INDEX idx_users_email ON users (email);',
        lock: { lockType: 'SHARE', blocksReads: false, blocksWrites: true, longHeld: true },
        risk: { level: 'RED', score: 80, factors: [{ name: 'Lock Type', weight: 40, value: 40, detail: 'SHARE lock blocks writes' }] },
        violations: [],
      },
    ],
    overallRisk: {
      level: 'RED',
      score: 80,
      factors: [{ name: 'Lock Type', weight: 40, value: 40, detail: 'SHARE lock blocks writes' }],
    },
    violations: [
      {
        ruleId: 'MP001',
        ruleName: 'require-concurrent-index',
        severity: 'critical',
        message: 'CREATE INDEX blocks writes. Use CREATE INDEX CONCURRENTLY.',
        line: 1,
        safeAlternative: 'CREATE INDEX CONCURRENTLY idx_users_email ON users (email);',
      },
      {
        ruleId: 'MP004',
        ruleName: 'require-lock-timeout',
        severity: 'warning',
        message: 'No lock_timeout set.',
        line: 1,
      },
    ],
    ...overrides,
  };
}

describe('formatJson', () => {
  it('returns valid JSON', () => {
    const json = formatJson(makeAnalysis());
    const parsed = JSON.parse(json);
    expect(parsed).toBeDefined();
  });

  it('includes schema URL and version', () => {
    const report: JsonReport = JSON.parse(formatJson(makeAnalysis()));
    expect(report.$schema).toContain('migrationpilot.dev/schemas');
    expect(report.version).toBe('1.2.0');
  });

  it('includes file and risk info', () => {
    const report: JsonReport = JSON.parse(formatJson(makeAnalysis()));
    expect(report.file).toBe('migrations/001_add_index.sql');
    expect(report.riskLevel).toBe('RED');
    expect(report.riskScore).toBe(80);
  });

  it('includes risk factors', () => {
    const report: JsonReport = JSON.parse(formatJson(makeAnalysis()));
    expect(report.riskFactors).toHaveLength(1);
    expect(report.riskFactors[0].name).toBe('Lock Type');
    expect(report.riskFactors[0].weight).toBe(40);
  });

  it('includes statements with lock info', () => {
    const report: JsonReport = JSON.parse(formatJson(makeAnalysis()));
    expect(report.statements).toHaveLength(1);
    expect(report.statements[0].lockType).toBe('SHARE');
    expect(report.statements[0].blocksWrites).toBe(true);
    expect(report.statements[0].blocksReads).toBe(false);
    expect(report.statements[0].riskLevel).toBe('RED');
  });

  it('includes all violation fields', () => {
    const report: JsonReport = JSON.parse(formatJson(makeAnalysis()));
    expect(report.violations).toHaveLength(2);
    expect(report.violations[0].ruleId).toBe('MP001');
    expect(report.violations[0].severity).toBe('critical');
    expect(report.violations[0].message).toContain('CREATE INDEX');
    expect(report.violations[0].line).toBe(1);
    expect(report.violations[0].safeAlternative).toContain('CONCURRENTLY');
  });

  it('enriches violations with rule metadata when rules provided', () => {
    const report: JsonReport = JSON.parse(formatJson(makeAnalysis(), allRules));
    expect(report.violations[0].whyItMatters).toBeDefined();
    expect(report.violations[0].docsUrl).toContain('migrationpilot.dev/rules/mp001');
  });

  it('omits whyItMatters and docsUrl when no rules provided', () => {
    const report: JsonReport = JSON.parse(formatJson(makeAnalysis()));
    expect(report.violations[0].whyItMatters).toBeUndefined();
    expect(report.violations[0].docsUrl).toBeUndefined();
  });

  it('includes correct summary counts', () => {
    const report: JsonReport = JSON.parse(formatJson(makeAnalysis()));
    expect(report.summary.totalStatements).toBe(1);
    expect(report.summary.totalViolations).toBe(2);
    expect(report.summary.criticalCount).toBe(1);
    expect(report.summary.warningCount).toBe(1);
  });

  it('handles zero violations', () => {
    const report: JsonReport = JSON.parse(formatJson(makeAnalysis({
      violations: [],
      overallRisk: { level: 'GREEN', score: 0, factors: [] },
    })));
    expect(report.violations).toHaveLength(0);
    expect(report.summary.totalViolations).toBe(0);
    expect(report.riskLevel).toBe('GREEN');
  });
});

describe('formatJsonMulti', () => {
  it('wraps multiple files in a multi-report', () => {
    const a1 = makeAnalysis({ file: 'a.sql' });
    const a2 = makeAnalysis({
      file: 'b.sql',
      violations: [],
      overallRisk: { level: 'GREEN', score: 0, factors: [] },
    });

    const multi: JsonMultiReport = JSON.parse(formatJsonMulti([a1, a2]));
    expect(multi.files).toHaveLength(2);
    expect(multi.files[0].file).toBe('a.sql');
    expect(multi.files[1].file).toBe('b.sql');
  });

  it('calculates overall risk from worst file', () => {
    const a1 = makeAnalysis({ overallRisk: { level: 'RED', score: 80, factors: [] } });
    const a2 = makeAnalysis({ overallRisk: { level: 'GREEN', score: 0, factors: [] }, violations: [] });

    const multi: JsonMultiReport = JSON.parse(formatJsonMulti([a1, a2]));
    expect(multi.overallRiskLevel).toBe('RED');
  });

  it('sums total violations across files', () => {
    const a1 = makeAnalysis(); // 2 violations
    const a2 = makeAnalysis(); // 2 violations

    const multi: JsonMultiReport = JSON.parse(formatJsonMulti([a1, a2]));
    expect(multi.totalViolations).toBe(4);
  });

  it('includes schema and version', () => {
    const multi: JsonMultiReport = JSON.parse(formatJsonMulti([makeAnalysis()]));
    expect(multi.$schema).toContain('migrationpilot.dev/schemas');
    expect(multi.version).toBe('1.2.0');
  });
});
