/**
 * Snapshot tests for all MigrationPilot output formats.
 *
 * These tests ensure output format stability. If output intentionally changes,
 * update snapshots with: pnpm vitest run --update
 */

import { describe, it, expect, beforeAll } from 'vitest';
import chalk from 'chalk';
import { formatCliOutput, formatCheckSummary, formatVerboseOutput, formatQuietOutput } from '../src/output/cli.js';
import { formatMarkdown } from '../src/output/markdown.js';
import { formatJson, formatJsonMulti } from '../src/output/json.js';
import { buildSarifLog } from '../src/output/sarif.js';
import { buildPRComment } from '../src/output/pr-comment.js';
import { allRules } from '../src/rules/index.js';
import type { AnalysisOutput } from '../src/output/cli.js';
import type { RuleViolation } from '../src/rules/engine.js';

// Disable colors for deterministic snapshot output
beforeAll(() => {
  chalk.level = 0;
});

const violations: RuleViolation[] = [
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
    message: 'No lock_timeout set before DDL statement.',
    line: 1,
  },
];

const analysisWithViolations: AnalysisOutput = {
  file: 'migrations/001_add_index.sql',
  statements: [
    {
      sql: 'CREATE INDEX idx_users_email ON users (email);',
      lock: { lockType: 'SHARE', blocksReads: false, blocksWrites: true, longHeld: true },
      risk: { level: 'RED', score: 80, factors: [{ name: 'Lock Type', weight: 40, value: 40, detail: 'SHARE lock blocks writes' }] },
      violations,
    },
  ],
  overallRisk: {
    level: 'RED',
    score: 80,
    factors: [{ name: 'Lock Type', weight: 40, value: 40, detail: 'SHARE lock blocks writes' }],
  },
  violations,
};

const cleanAnalysis: AnalysisOutput = {
  file: 'migrations/002_safe.sql',
  statements: [
    {
      sql: "SET lock_timeout = '5s';",
      lock: { lockType: 'ACCESS SHARE', blocksReads: false, blocksWrites: false, longHeld: false },
      risk: { level: 'GREEN', score: 0, factors: [] },
      violations: [],
    },
  ],
  overallRisk: { level: 'GREEN', score: 0, factors: [] },
  violations: [],
};

describe('Output Snapshots', () => {
  it('CLI output with violations', () => {
    const output = formatCliOutput(analysisWithViolations, { rules: allRules });
    expect(output).toMatchSnapshot();
  });

  it('CLI output clean', () => {
    const output = formatCliOutput(cleanAnalysis);
    expect(output).toMatchSnapshot();
  });

  it('Markdown output with violations', () => {
    const output = formatMarkdown(analysisWithViolations, allRules);
    expect(output).toMatchSnapshot();
  });

  it('PR comment with violations', () => {
    const output = buildPRComment(analysisWithViolations, allRules);
    expect(output).toMatchSnapshot();
  });

  it('PR comment clean', () => {
    const output = buildPRComment(cleanAnalysis);
    expect(output).toMatchSnapshot();
  });

  it('JSON output with violations', () => {
    const output = formatJson(analysisWithViolations, allRules);
    expect(output).toMatchSnapshot();
  });

  it('JSON multi-file output', () => {
    const output = formatJsonMulti([analysisWithViolations, cleanAnalysis], allRules);
    expect(output).toMatchSnapshot();
  });

  it('SARIF log structure', () => {
    const log = buildSarifLog(violations, 'test.sql', allRules, '1.1.0');
    // Snapshot the structure minus volatile fields
    const snapshot = {
      version: log.version,
      $schema: log.$schema,
      rulesCount: log.runs[0].tool.driver.rules.length,
      resultsCount: log.runs[0].results.length,
      firstResult: log.runs[0].results[0],
    };
    expect(snapshot).toMatchSnapshot();
  });

  it('Quiet output', () => {
    const output = formatQuietOutput(analysisWithViolations);
    expect(output).toMatchSnapshot();
  });

  it('Verbose output', () => {
    const output = formatVerboseOutput(analysisWithViolations, allRules);
    expect(output).toMatchSnapshot();
  });

  it('Check summary for multiple files', () => {
    const output = formatCheckSummary(
      [analysisWithViolations, cleanAnalysis],
      { ruleCount: 25, elapsedMs: 42.5 },
    );
    expect(output).toMatchSnapshot();
  });
});
