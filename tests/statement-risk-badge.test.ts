/**
 * One meaning for the Risk column, whichever report you are reading.
 *
 * `calculateRisk` scores a statement's blast radius, and blast radius alone
 * cannot reach RED without a database connection — lock severity caps at 40.
 * So a statement carrying a CRITICAL violation used to render YELLOW under a
 * RED headline, and readers took the row at its word and concluded nothing was
 * urgent. The row now shows the worse of the two things known about that
 * statement: what its lock does, and what the rules found in it.
 *
 * The badge moves; the score does not. `--format json` still reports the
 * blast-radius level per statement, because that is data rather than a signal
 * to a reader, and something downstream may be counting on it.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import chalk from 'chalk';
import { formatCliOutput } from '../src/output/cli.js';
import { formatMarkdown } from '../src/output/markdown.js';
import { formatJson } from '../src/output/json.js';
import { buildPRComment } from '../src/output/pr-comment.js';
import { calculateRisk, calculateOverallRisk } from '../src/scoring/score.js';
import type { AnalysisOutput } from '../src/output/cli.js';
import type { LockClassification } from '../src/locks/classify.js';
import type { RuleViolation } from '../src/rules/engine.js';

beforeAll(() => {
  chalk.level = 0;
});

/** SHARE held for the length of the build: 15 + 15 = 30, which is YELLOW. */
const SHARE_LOCK: LockClassification = {
  lockType: 'SHARE',
  blocksReads: false,
  blocksWrites: true,
  longHeld: true,
};

/** Takes no meaningful lock: 10, which is GREEN. */
const CONCURRENT_LOCK: LockClassification = {
  lockType: 'SHARE UPDATE EXCLUSIVE',
  blocksReads: false,
  blocksWrites: false,
  longHeld: false,
};

function violation(severity: 'critical' | 'warning'): RuleViolation {
  return {
    ruleId: severity === 'critical' ? 'MP001' : 'MP004',
    ruleName: severity === 'critical' ? 'require-concurrent-index' : 'require-lock-timeout',
    severity,
    message: 'something the rules object to',
    line: 1,
    statementIndex: 0,
  };
}

function report(lock: LockClassification, violations: RuleViolation[]): AnalysisOutput {
  const risk = calculateRisk(lock);
  return {
    file: 'migrations/002_dangerous.sql',
    statements: [
      { sql: 'CREATE INDEX idx_users_email ON users (email);', line: 1, lock, risk, violations },
    ],
    overallRisk: calculateOverallRisk([risk], violations),
    violations,
  };
}

/** The Risk cell of the first statement row, as the CLI table prints it. */
function cliRiskCell(analysis: AnalysisOutput): string {
  const row = formatCliOutput(analysis).split('\n').find(l => l.startsWith('│ 1 '));
  expect(row, 'no statement row in the CLI table').toBeDefined();
  // │ # │ Statement │ Lock Type │ Risk │ Long lock? │
  return row!.split('│')[4]!.trim();
}

/** The Risk cell of the first statement row, as the markdown report prints it. */
function markdownRiskCell(analysis: AnalysisOutput): string {
  const row = formatMarkdown(analysis).split('\n').find(l => l.startsWith('| 1 |'));
  expect(row, 'no statement row in the markdown table').toBeDefined();
  return row!.split('|').map(c => c.trim()).at(-2)!;
}

/** The Risk cell of the first statement row, as the PR comment prints it. */
function prCommentRiskCell(analysis: AnalysisOutput): string {
  const row = buildPRComment(analysis).split('\n').find(l => l.startsWith('| 1 |'));
  expect(row, 'no statement row in the PR comment').toBeDefined();
  return row!.split('|').map(c => c.trim()).at(-2)!;
}

describe('a statement carrying a critical violation', () => {
  const analysis = report(SHARE_LOCK, [violation('critical')]);

  it('scores YELLOW on blast radius under a RED headline — the reason the badge exists', () => {
    expect(analysis.statements[0]!.risk.level).toBe('YELLOW');
    expect(analysis.overallRisk.level).toBe('RED');
  });

  it('shows red in the CLI table', () => {
    expect(cliRiskCell(analysis)).toContain('RED');
  });

  it('shows RED in the markdown report', () => {
    expect(markdownRiskCell(analysis)).toBe('RED');
  });

  it('shows 🔴 in the PR comment', () => {
    expect(prCommentRiskCell(analysis)).toBe('🔴');
  });
});

describe('a statement carrying only warnings', () => {
  it('lifts a GREEN lock to yellow, everywhere', () => {
    const analysis = report(CONCURRENT_LOCK, [violation('warning')]);
    expect(analysis.statements[0]!.risk.level).toBe('GREEN');

    expect(cliRiskCell(analysis)).toContain('YELL');
    expect(markdownRiskCell(analysis)).toBe('YELLOW');
    expect(prCommentRiskCell(analysis)).toBe('🟡');
  });

  it('never de-escalates a worse lock', () => {
    const analysis = report(SHARE_LOCK, [violation('warning')]);
    expect(analysis.statements[0]!.risk.level).toBe('YELLOW');

    expect(cliRiskCell(analysis)).toContain('YELL');
    expect(markdownRiskCell(analysis)).toBe('YELLOW');
    expect(prCommentRiskCell(analysis)).toBe('🟡');
  });
});

describe('a clean statement', () => {
  it('keeps its lock risk, everywhere', () => {
    const analysis = report(CONCURRENT_LOCK, []);

    expect(cliRiskCell(analysis)).toContain('GREE');
    expect(markdownRiskCell(analysis)).toBe('GREEN');
    expect(prCommentRiskCell(analysis)).toBe('🟢');
  });
});

describe('--format json', () => {
  it('keeps reporting the blast-radius level, because that is data and not a badge', () => {
    const analysis = report(SHARE_LOCK, [violation('critical')]);
    const parsed = JSON.parse(formatJson(analysis)) as {
      riskLevel: string;
      statements: Array<{ riskLevel: string; riskScore: number }>;
    };

    expect(parsed.statements[0]!.riskLevel).toBe('YELLOW');
    expect(parsed.statements[0]!.riskScore).toBe(30);
    expect(parsed.riskLevel).toBe('RED');
  });
});
