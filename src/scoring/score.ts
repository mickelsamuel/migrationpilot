import type { LockClassification, LockLevel } from '../locks/classify.js';

export type RiskLevel = 'RED' | 'YELLOW' | 'GREEN';

export interface RiskFactor {
  name: string;
  weight: number;
  value: number;
  detail: string;
}

export interface RiskScore {
  level: RiskLevel;
  score: number;
  factors: RiskFactor[];
}

export interface TableStats {
  tableName: string;
  rowCount: number;
  totalBytes: number;
  indexCount: number;
}

export interface AffectedQuery {
  queryId: string;
  normalizedQuery: string;
  calls: number;
  meanExecTime: number;
  serviceName?: string;
}

/**
 * Calculates a risk score from 0-100 based on:
 * - Lock severity (0-40 points) — always available (free tier)
 * - Table size (0-30 points) — paid tier only
 * - Query frequency (0-30 points) — paid tier only
 */
export function calculateRisk(
  lock: LockClassification,
  tableStats?: TableStats,
  affectedQueries?: AffectedQuery[]
): RiskScore {
  const factors: RiskFactor[] = [];

  // Factor 1: Lock severity (0-40)
  const lockScore = scoreLock(lock);
  factors.push({
    name: 'Lock Severity',
    weight: 40,
    value: lockScore,
    detail: `${lock.lockType}${lock.longHeld ? ' (long-held)' : ''}`,
  });

  // Factor 2: Table size (0-30) — paid tier
  if (tableStats) {
    const sizeScore = scoreTableSize(tableStats.rowCount);
    factors.push({
      name: 'Table Size',
      weight: 30,
      value: sizeScore,
      detail: `${tableStats.rowCount.toLocaleString()} rows (${formatBytes(tableStats.totalBytes)})`,
    });
  }

  // Factor 3: Query frequency (0-30) — paid tier
  if (affectedQueries && affectedQueries.length > 0) {
    const totalCalls = affectedQueries.reduce((sum, q) => sum + q.calls, 0);
    const freqScore = scoreQueryFrequency(totalCalls);
    const services = [...new Set(affectedQueries.map(q => q.serviceName).filter(Boolean))];
    factors.push({
      name: 'Query Frequency',
      weight: 30,
      value: freqScore,
      detail: `${affectedQueries.length} queries, ${totalCalls.toLocaleString()} calls${services.length > 0 ? ` across ${services.join(', ')}` : ''}`,
    });
  }

  const totalScore = factors.reduce((sum, f) => sum + f.value, 0);
  const level: RiskLevel = totalScore >= 50 ? 'RED' : totalScore >= 25 ? 'YELLOW' : 'GREEN';

  return { level, score: totalScore, factors };
}

function scoreLock(lock: LockClassification): number {
  const base: Record<LockLevel, number> = {
    'ACCESS SHARE': 0,
    'ROW EXCLUSIVE': 5,
    'SHARE UPDATE EXCLUSIVE': 10,
    'SHARE': 15,
    'SHARE ROW EXCLUSIVE': 20,
    'ACCESS EXCLUSIVE': 25,
  };

  let score = base[lock.lockType];
  if (lock.longHeld) score += 15;
  if (lock.blocksReads && lock.blocksWrites) score = Math.max(score, 30);

  return Math.min(score, 40);
}

function scoreTableSize(rowCount: number): number {
  if (rowCount > 10_000_000) return 30;
  if (rowCount > 1_000_000) return 20;
  if (rowCount > 100_000) return 10;
  if (rowCount > 10_000) return 5;
  return 0;
}

function scoreQueryFrequency(totalCalls: number): number {
  if (totalCalls > 100_000) return 30;
  if (totalCalls > 10_000) return 20;
  if (totalCalls > 1_000) return 10;
  if (totalCalls > 100) return 5;
  return 0;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(1)} TB`;
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(1)} KB`;
  return `${bytes} B`;
}
