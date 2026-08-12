/**
 * What a reviewer can actually do with the comment the Action posts.
 *
 * Every case here came out of running the Action against a real pull request:
 * violations that named no file and no line, a statement row badged 🟡 under a
 * 🔴 header, a score breakdown that read as arithmetic that does not add up,
 * and a "Long?" column that says No for CONCURRENTLY — which does take longer.
 */

import { describe, it, expect } from 'vitest';
import { buildPRComment } from '../src/output/pr-comment.js';
import { calculateRisk, calculateOverallRisk } from '../src/scoring/score.js';
import type { PRAnalysisResult } from '../src/output/pr-comment.js';
import type { LockClassification } from '../src/locks/classify.js';
import type { RuleViolation } from '../src/rules/engine.js';

/** SHARE, held for the length of the build: 15 + 15 = 30, which is YELLOW. */
const SHARE_LOCK: LockClassification = {
  lockType: 'SHARE',
  blocksReads: false,
  blocksWrites: true,
  longHeld: true,
};

const CONCURRENT_LOCK: LockClassification = {
  lockType: 'SHARE UPDATE EXCLUSIVE',
  blocksReads: false,
  blocksWrites: false,
  longHeld: false,
};

const MP001: RuleViolation = {
  ruleId: 'MP001',
  ruleName: 'require-concurrent-index',
  severity: 'critical',
  message: 'CREATE INDEX blocks writes. Use CREATE INDEX CONCURRENTLY.',
  line: 2,
  statementIndex: 0,
};

/** One CREATE INDEX: a YELLOW lock carrying a CRITICAL violation. */
function criticalIndexReport(): PRAnalysisResult {
  const risk = calculateRisk(SHARE_LOCK);
  return {
    file: 'migrations/002_dangerous.sql',
    statements: [
      { sql: 'CREATE INDEX idx_users_email ON users (email);', line: 2, lock: SHARE_LOCK, risk },
    ],
    overallRisk: calculateOverallRisk([risk], [MP001]),
    violations: [MP001],
  };
}

function rowCells(comment: string, index: number): string[] {
  const row = comment
    .split('\n')
    .filter(l => l.startsWith(`| ${index} |`))[0];
  expect(row, `no statement row ${index} in the comment`).toBeDefined();
  return row!.split('|').map(c => c.trim());
}

describe('violation bullets', () => {
  it('name the file and the line', () => {
    const comment = buildPRComment(criticalIndexReport());
    expect(comment).toContain('`migrations/002_dangerous.sql:2`');
  });

  it('tell apart the same rule firing on byte-identical statements', () => {
    const sql = 'ALTER TABLE users ADD COLUMN nickname text;';
    const violations: RuleViolation[] = [0, 1, 2].map(i => ({
      ruleId: 'MP004',
      ruleName: 'require-lock-timeout',
      severity: 'warning',
      message: 'No lock_timeout set before DDL statement.',
      line: i + 1,
      statementIndex: i,
    }));
    const risk = calculateRisk(CONCURRENT_LOCK);

    const comment = buildPRComment({
      file: 'migrations/003_columns.sql',
      statements: [0, 1, 2].map(i => ({ sql, line: i + 1, lock: CONCURRENT_LOCK, risk })),
      overallRisk: calculateOverallRisk([risk, risk, risk], violations),
      violations,
    });

    const bullets = comment.split('\n').filter(l => l.includes('[`MP004`]'));
    expect(bullets).toHaveLength(3);
    expect(new Set(bullets).size).toBe(3);
    expect(bullets[0]).toContain('migrations/003_columns.sql:1');
    expect(bullets[2]).toContain('migrations/003_columns.sql:3');
  });
});

describe('the statement table', () => {
  it('badges a statement with a critical violation red, whatever its lock scores', () => {
    const report = criticalIndexReport();
    // The defect this covers: the lock alone is YELLOW, the header is RED.
    expect(report.statements[0]!.risk.level).toBe('YELLOW');
    expect(report.overallRisk.level).toBe('RED');

    expect(rowCells(buildPRComment(report), 1).at(-2)).toBe('🔴');
  });

  it('leaves a clean statement at its lock risk', () => {
    const risk = calculateRisk(CONCURRENT_LOCK);
    const comment = buildPRComment({
      file: 'migrations/004_safe.sql',
      statements: [
        { sql: 'CREATE INDEX CONCURRENTLY idx_a ON users (a);', line: 1, lock: CONCURRENT_LOCK, risk },
      ],
      overallRisk: calculateOverallRisk([risk], []),
      violations: [],
    });

    expect(rowCells(comment, 1).at(-2)).toBe('🟢');
  });

  it('never de-escalates a brutal lock because the violation was only a warning', () => {
    const exclusive: LockClassification = {
      lockType: 'ACCESS EXCLUSIVE',
      blocksReads: true,
      blocksWrites: true,
      longHeld: true,
    };
    const warning: RuleViolation = {
      ruleId: 'MP004',
      ruleName: 'require-lock-timeout',
      severity: 'warning',
      message: 'No lock_timeout set before DDL statement.',
      line: 1,
      statementIndex: 0,
    };
    // Lock severity caps at 40, so only production context puts a statement's
    // own blast radius into RED.
    const risk = calculateRisk(exclusive, {
      tableName: 'users',
      rowCount: 40_000_000,
      totalBytes: 9e9,
      indexCount: 4,
    });
    expect(risk.level).toBe('RED');

    const comment = buildPRComment({
      file: 'migrations/005_rewrite.sql',
      statements: [{ sql: 'ALTER TABLE users ALTER COLUMN id TYPE bigint;', line: 1, lock: exclusive, risk }],
      overallRisk: calculateOverallRisk([risk], [warning]),
      violations: [warning],
    });

    expect(rowCells(comment, 1).at(-2)).toBe('🔴');
  });

  it('says which kind of long the column means', () => {
    const comment = buildPRComment(criticalIndexReport());
    expect(comment).toContain('| Long lock? |');
    expect(comment).not.toContain('| Long? |');
  });
});

describe('the risk score breakdown', () => {
  it('says the score is the worse of the two tracks, not their sum', () => {
    const report = criticalIndexReport();
    // 30 from the lock, 70 from one critical, headline 70 — which reads as
    // broken arithmetic until the breakdown explains the max.
    expect(report.overallRisk.score).toBe(70);

    const comment = buildPRComment(report);
    expect(comment).toContain('| Lock Severity | 30/40 |');
    expect(comment).toContain('| Rule Violations | 70/100 |');
    expect(comment).toContain(
      '**70/100 is the worse of two tracks, not the sum of these rows**: blast radius **30** (everything above) against rule violations **70**.',
    );
  });

  it('stays quiet when there is only one track to report', () => {
    const risk = calculateRisk(SHARE_LOCK);
    const comment = buildPRComment({
      file: 'migrations/006_index.sql',
      statements: [{ sql: 'CREATE INDEX idx_a ON users (a);', line: 1, lock: SHARE_LOCK, risk }],
      overallRisk: calculateOverallRisk([risk], []),
      violations: [],
    });

    expect(comment).toContain('| Lock Severity | 30/40 |');
    expect(comment).not.toContain('worse of two tracks');
  });
});
