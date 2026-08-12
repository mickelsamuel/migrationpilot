/**
 * Risk scoring for MigrationPilot — the one place the numbers are defined.
 *
 * A score is **danger, 0–100**: higher is worse, never a safety percentage.
 * `RED` at 50 and above, `YELLOW` at 25, `GREEN` below that.
 *
 * There are two scores, and they answer different questions:
 *
 * - `calculateRisk` scores **one statement's blast radius** — how badly its lock
 *   hurts, widened by table size and query traffic when a production connection
 *   supplies them. Rule violations are deliberately absent: this measures what
 *   the statement does to the database, not whether it broke a rule.
 *
 * - `calculateOverallRisk` scores **the migration**, and is the number every
 *   headline shows: the CLI badge, `--format json`, the PR comment emoji, the
 *   MCP tools, the playground. It is the worse of the two tracks — the blast
 *   radius of the worst statement, and what the rules found.
 *
 * The headline has to weigh violations because the blast-radius track alone
 * cannot reach RED without a production connection: lock severity caps at 40,
 * and table size and query frequency need `--database-url`. Scoring the
 * headline on locks alone meant a free-tier file full of CRITICAL violations
 * came out at 30/100 "Moderate risk", which is exactly backwards. Criticals now
 * start the migration at 70 and climb, so a critical always reads RED.
 */

import type { LockClassification, LockLevel } from '../locks/classify.js';
import type { Severity } from '../rules/engine.js';

export type RiskLevel = 'RED' | 'YELLOW' | 'GREEN';

/** Score at or above which a migration is RED. */
const RED_AT = 50;
/** Score at or above which a migration is YELLOW. */
const YELLOW_AT = 25;

/**
 * Name of the factor carrying the violation track in `calculateOverallRisk`.
 *
 * Every other factor in that list belongs to the blast-radius track and adds
 * up; this one competes with their total. Reports that explain the breakdown
 * need to tell the two apart, so the name is a constant rather than a string
 * they each guess at.
 */
export const VIOLATION_FACTOR = 'Rule Violations';

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
 * Score one statement's blast radius, 0-100:
 * - Lock severity (0-40 points) — always available
 * - Table size (0-30 points) — needs --database-url
 * - Query frequency (0-30 points) — needs --database-url
 *
 * Rule violations are not part of this — see `calculateOverallRisk` for the
 * migration-level number that weighs them.
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

  // Factor 2: Table size (0-30) — needs --database-url
  if (tableStats) {
    const sizeScore = scoreTableSize(tableStats.rowCount);
    factors.push({
      name: 'Table Size',
      weight: 30,
      value: sizeScore,
      detail: `${tableStats.rowCount.toLocaleString()} rows (${formatBytes(tableStats.totalBytes)})`,
    });
  }

  // Factor 3: Query frequency (0-30) — needs --database-url
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

  return { level: levelFor(totalScore), score: totalScore, factors };
}

/** RED at 50, YELLOW at 25, GREEN below. */
export function levelFor(score: number): RiskLevel {
  return score >= RED_AT ? 'RED' : score >= YELLOW_AT ? 'YELLOW' : 'GREEN';
}

/**
 * Score the migration as a whole — the number every headline shows.
 *
 * The worse of two tracks: the blast radius of the riskiest statement, and what
 * the rules found. A critical violation puts the migration at 70 or above so it
 * always reads RED; warnings alone stop at 45, because RED means "something
 * here is critical" and a pile of warnings is not that.
 */
export function calculateOverallRisk(
  statementRisks: RiskScore[],
  violations: Array<{ severity: Severity }>,
): RiskScore {
  const worst = statementRisks.reduce<RiskScore | undefined>(
    (acc, r) => (acc === undefined || r.score > acc.score ? r : acc),
    undefined,
  );

  const criticals = violations.filter(v => v.severity === 'critical').length;
  const warnings = violations.length - criticals;
  const violationScore = scoreViolations(criticals, warnings);

  const factors = [...(worst?.factors ?? [])];
  if (violations.length > 0) {
    factors.push({
      name: VIOLATION_FACTOR,
      weight: 100,
      value: violationScore,
      detail: describeCounts(criticals, warnings),
    });
  }

  const score = Math.max(worst?.score ?? 0, violationScore);
  return { level: levelFor(score), score, factors };
}

/**
 * Violations alone, as a 0-100 score.
 *
 * One critical is 70 — clear of the RED line with room for more to climb, and
 * saturating at 100. Warnings start at 30 and stop at 45, inside YELLOW.
 */
function scoreViolations(criticals: number, warnings: number): number {
  if (criticals > 0) return Math.min(100, 60 + criticals * 10);
  if (warnings > 0) return Math.min(45, 25 + warnings * 5);
  return 0;
}

function describeCounts(criticals: number, warnings: number): string {
  const parts: string[] = [];
  if (criticals > 0) parts.push(`${criticals} critical`);
  if (warnings > 0) parts.push(`${warnings} warning${warnings === 1 ? '' : 's'}`);
  return parts.join(', ');
}

function scoreLock(lock: LockClassification): number {
  const base: Record<LockLevel, number> = {
    'ACCESS SHARE': 0,
    'ROW SHARE': 2,
    'ROW EXCLUSIVE': 5,
    'SHARE UPDATE EXCLUSIVE': 10,
    'SHARE': 15,
    'SHARE ROW EXCLUSIVE': 20,
    'ACCESS EXCLUSIVE': 25,
  };

  let score = base[lock.lockType] ?? 0;
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
