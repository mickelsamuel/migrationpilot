import { describe, it, expect } from 'vitest';
import { calculateRisk } from '../src/scoring/score.js';
import type { LockClassification } from '../src/locks/classify.js';

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
