import type { LockClassification } from '../locks/classify.js';
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
export declare function calculateRisk(lock: LockClassification, tableStats?: TableStats, affectedQueries?: AffectedQuery[]): RiskScore;
//# sourceMappingURL=score.d.ts.map