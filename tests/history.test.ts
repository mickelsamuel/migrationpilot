import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const testDir = join(tmpdir(), `mp-history-test-${Date.now()}`);

vi.mock('node:os', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:os')>();
  return { ...original, homedir: () => testDir };
});

const { recordAnalysis, readHistory, computeTrends, formatTrends } = await import('../src/history/store.js');
import type { HistoryEntry, TrendSummary } from '../src/history/store.js';

function makeEntry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    timestamp: new Date().toISOString(),
    file: 'migrations/001.sql',
    riskLevel: 'RED',
    riskScore: 80,
    violationCount: 3,
    criticalCount: 1,
    warningCount: 2,
    statementCount: 2,
    ruleCount: 51,
    ...overrides,
  };
}

describe('history/store', () => {
  beforeEach(async () => {
    await mkdir(join(testDir, '.migrationpilot', 'history'), { recursive: true });
  });

  afterEach(async () => {
    try { await rm(testDir, { recursive: true, force: true }); } catch {}
  });

  it('records and reads history entries', async () => {
    await recordAnalysis(makeEntry());
    const entries = await readHistory();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.riskLevel).toBe('RED');
  });

  it('records multiple entries', async () => {
    await recordAnalysis(makeEntry({ riskScore: 80 }));
    await recordAnalysis(makeEntry({ riskScore: 40 }));
    await recordAnalysis(makeEntry({ riskScore: 20 }));
    const entries = await readHistory();
    expect(entries).toHaveLength(3);
  });

  it('returns empty array when no history', async () => {
    const entries = await readHistory();
    expect(entries).toEqual([]);
  });

  it('respects limit parameter', async () => {
    for (let i = 0; i < 10; i++) {
      await recordAnalysis(makeEntry({ riskScore: i * 10 }));
    }
    const entries = await readHistory(3);
    expect(entries).toHaveLength(3);
  });
});

describe('computeTrends', () => {
  beforeEach(async () => {
    await mkdir(join(testDir, '.migrationpilot', 'history'), { recursive: true });
  });

  afterEach(async () => {
    try { await rm(testDir, { recursive: true, force: true }); } catch {}
  });

  it('returns empty trends when no history', async () => {
    const trends = await computeTrends();
    expect(trends.totalAnalyses).toBe(0);
    expect(trends.riskTrend).toBe('stable');
  });

  it('computes summary from entries', async () => {
    await recordAnalysis(makeEntry({ violationCount: 5, criticalCount: 2, warningCount: 3, riskScore: 70 }));
    await recordAnalysis(makeEntry({ violationCount: 3, criticalCount: 1, warningCount: 2, riskScore: 50 }));

    const trends = await computeTrends();
    expect(trends.totalAnalyses).toBe(2);
    expect(trends.totalViolations).toBe(8);
    expect(trends.criticalViolations).toBe(3);
    expect(trends.averageRiskScore).toBe(60);
  });
});

describe('formatTrends', () => {
  it('handles empty history', () => {
    const trends: TrendSummary = {
      totalAnalyses: 0,
      recentAnalyses: [],
      averageRiskScore: 0,
      totalViolations: 0,
      criticalViolations: 0,
      warningViolations: 0,
      riskTrend: 'stable',
      violationTrend: 'stable',
    };
    const output = formatTrends(trends);
    expect(output).toContain('No analysis history found');
  });

  it('formats trends with data', () => {
    const trends: TrendSummary = {
      totalAnalyses: 10,
      recentAnalyses: [makeEntry()],
      averageRiskScore: 55,
      totalViolations: 30,
      criticalViolations: 10,
      warningViolations: 20,
      riskTrend: 'improving',
      violationTrend: 'stable',
    };
    const output = formatTrends(trends);
    expect(output).toContain('Total analyses: 10');
    expect(output).toContain('Average risk score: 55/100');
    expect(output).toContain('improving');
  });
});
