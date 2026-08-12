import { describe, it, expect } from 'vitest';
import { calculateRisk, calculateOverallRisk } from '../src/scoring/score.js';
import { analyzeSQL } from '../src/analysis/analyze.js';
import { allRules } from '../src/rules/index.js';
import type { LockClassification } from '../src/locks/classify.js';
import type { Severity } from '../src/rules/engine.js';

describe('calculateRisk', () => {
  it('ACCESS SHARE gives GREEN with score 0', () => {
    const lock: LockClassification = { lockType: 'ACCESS SHARE', blocksReads: false, blocksWrites: false, longHeld: false };
    const risk = calculateRisk(lock);
    expect(risk.level).toBe('GREEN');
    expect(risk.score).toBe(0);
  });

  it('ACCESS EXCLUSIVE brief gives YELLOW', () => {
    const lock: LockClassification = { lockType: 'ACCESS EXCLUSIVE', blocksReads: true, blocksWrites: true, longHeld: false };
    const risk = calculateRisk(lock);
    expect(risk.level).toBe('YELLOW');
    expect(risk.score).toBeGreaterThanOrEqual(25);
  });

  it('ACCESS EXCLUSIVE + longHeld gives YELLOW (lock-only max is 40)', () => {
    const lock: LockClassification = { lockType: 'ACCESS EXCLUSIVE', blocksReads: true, blocksWrites: true, longHeld: true };
    const risk = calculateRisk(lock);
    expect(risk.level).toBe('YELLOW');
    expect(risk.score).toBe(40); // Lock severity capped at 40
  });

  it('SHARE UPDATE EXCLUSIVE gives GREEN', () => {
    const lock: LockClassification = { lockType: 'SHARE UPDATE EXCLUSIVE', blocksReads: false, blocksWrites: false, longHeld: false };
    const risk = calculateRisk(lock);
    expect(risk.level).toBe('GREEN');
    expect(risk.score).toBeLessThan(25);
  });

  it('SHARE lock gives GREEN', () => {
    const lock: LockClassification = { lockType: 'SHARE', blocksReads: false, blocksWrites: true, longHeld: false };
    const risk = calculateRisk(lock);
    expect(risk.level).toBe('GREEN');
  });

  it('includes Lock Severity factor', () => {
    const lock: LockClassification = { lockType: 'ACCESS EXCLUSIVE', blocksReads: true, blocksWrites: true, longHeld: true };
    const risk = calculateRisk(lock);
    const lockFactor = risk.factors.find(f => f.name === 'Lock Severity');
    expect(lockFactor).toBeDefined();
    expect(lockFactor!.value).toBeGreaterThan(0);
  });

  it('includes Table Size factor when tableStats provided', () => {
    const lock: LockClassification = { lockType: 'ACCESS EXCLUSIVE', blocksReads: true, blocksWrites: true, longHeld: false };
    const risk = calculateRisk(lock, { tableName: 'users', rowCount: 5_000_000, totalBytes: 2e9, indexCount: 3 });
    const sizeFactor = risk.factors.find(f => f.name === 'Table Size');
    expect(sizeFactor).toBeDefined();
    expect(sizeFactor!.value).toBeGreaterThan(0);
  });

  it('large table pushes risk to RED', () => {
    const lock: LockClassification = { lockType: 'ACCESS EXCLUSIVE', blocksReads: true, blocksWrites: true, longHeld: true };
    const risk = calculateRisk(lock, { tableName: 'events', rowCount: 50_000_000, totalBytes: 100e9, indexCount: 5 });
    expect(risk.level).toBe('RED');
  });

  it('includes Query Frequency factor when queries provided', () => {
    const lock: LockClassification = { lockType: 'ACCESS EXCLUSIVE', blocksReads: true, blocksWrites: true, longHeld: false };
    const risk = calculateRisk(lock, undefined, [
      { queryId: 'q1', normalizedQuery: 'SELECT * FROM users WHERE id = $1', calls: 50000, meanExecTime: 1.5 },
    ]);
    const freqFactor = risk.factors.find(f => f.name === 'Query Frequency');
    expect(freqFactor).toBeDefined();
    expect(freqFactor!.value).toBeGreaterThan(0);
  });
});

/**
 * The headline number.
 *
 * The blast-radius track alone tops out at 40 without a production connection,
 * so scoring the migration on locks put a free-tier file of four CRITICAL
 * violations at 30/100 — which the playground rendered as "Moderate risk".
 * A critical has to read RED, whatever the locks say.
 */
describe('calculateOverallRisk', () => {
  const brief: LockClassification = { lockType: 'ACCESS EXCLUSIVE', blocksReads: true, blocksWrites: true, longHeld: false };
  const v = (severity: Severity) => ({ severity });

  it('is the statement score when nothing fired', () => {
    const statement = calculateRisk(brief);
    const overall = calculateOverallRisk([statement], []);
    expect(overall.score).toBe(statement.score);
    expect(overall.level).toBe(statement.level);
    expect(overall.factors.some(f => f.name === 'Rule Violations')).toBe(false);
  });

  it('reads RED on a single critical, however mild the lock', () => {
    const harmless = calculateRisk({ lockType: 'ACCESS SHARE', blocksReads: false, blocksWrites: false, longHeld: false });
    const overall = calculateOverallRisk([harmless], [v('critical')]);
    expect(overall.level).toBe('RED');
    expect(overall.score).toBeGreaterThanOrEqual(50);
  });

  it('climbs with the number of criticals and saturates at 100', () => {
    const scores = [1, 2, 3, 4, 10].map(
      n => calculateOverallRisk([calculateRisk(brief)], Array.from({ length: n }, () => v('critical'))).score,
    );
    expect(scores).toEqual([70, 80, 90, 100, 100]);
    for (const s of scores) expect(s).toBeGreaterThanOrEqual(50);
  });

  it('keeps warnings alone inside YELLOW', () => {
    for (const n of [1, 3, 20]) {
      const overall = calculateOverallRisk([calculateRisk(brief)], Array.from({ length: n }, () => v('warning')));
      expect(overall.level, `${n} warnings`).toBe('YELLOW');
      expect(overall.score).toBeLessThan(50);
    }
  });

  it('keeps the higher of the two tracks', () => {
    const huge = calculateRisk(
      { lockType: 'ACCESS EXCLUSIVE', blocksReads: true, blocksWrites: true, longHeld: true },
      { tableName: 'events', rowCount: 50_000_000, totalBytes: 100e9, indexCount: 5 },
      [{ queryId: 'q1', normalizedQuery: 'SELECT 1', calls: 500_000, meanExecTime: 1 }],
    );
    expect(huge.score).toBe(100);
    // One warning scores 30 on its own; the blast radius still wins.
    expect(calculateOverallRisk([huge], [v('warning')]).score).toBe(100);
  });

  it('shows the counts as a factor', () => {
    const overall = calculateOverallRisk([calculateRisk(brief)], [v('critical'), v('warning'), v('warning')]);
    const factor = overall.factors.find(f => f.name === 'Rule Violations');
    expect(factor?.detail).toBe('1 critical, 2 warnings');
    expect(factor?.value).toBe(70);
  });
});

describe('a migration full of criticals never reads as moderate', () => {
  it('scores four criticals RED end to end', async () => {
    const analysis = await analyzeSQL('DROP TABLE a;\nDROP TABLE b;\n', 'migration.sql', 17, allRules);
    expect(analysis.violations.filter(v => v.severity === 'critical')).toHaveLength(4);
    expect(analysis.overallRisk.level).toBe('RED');
    expect(analysis.overallRisk.score).toBe(100);
  });

  it('scores the README example RED', async () => {
    const sql = 'CREATE INDEX idx_users_email ON users (email);\nALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE (email);';
    const analysis = await analyzeSQL(sql, 'migration.sql', 17, allRules);
    expect(analysis.violations.some(v => v.severity === 'critical')).toBe(true);
    expect(analysis.overallRisk.level).toBe('RED');
  });

  it('leaves a clean migration GREEN', async () => {
    const sql = "SET lock_timeout = '5s';\nDROP INDEX CONCURRENTLY IF EXISTS idx_a;\nCREATE INDEX CONCURRENTLY idx_a ON t (c);";
    const analysis = await analyzeSQL(sql, 'migration.sql', 17, allRules);
    expect(analysis.violations).toHaveLength(0);
    expect(analysis.overallRisk.level).toBe('GREEN');
  });
});
