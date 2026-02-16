/**
 * JSON output formatter for MigrationPilot.
 *
 * Produces a structured, versioned JSON schema for programmatic consumption.
 * Used by `--format json` in both `analyze` and `check` commands.
 */
import type { AnalysisOutput } from './cli.js';
import type { Rule } from '../rules/engine.js';
import type { RiskLevel } from '../scoring/score.js';
export interface JsonViolation {
    ruleId: string;
    ruleName: string;
    severity: 'critical' | 'warning';
    message: string;
    line: number;
    safeAlternative?: string;
    whyItMatters?: string;
    docsUrl?: string;
}
export interface JsonStatement {
    sql: string;
    lockType: string;
    blocksReads: boolean;
    blocksWrites: boolean;
    riskLevel: RiskLevel;
    riskScore: number;
}
export interface JsonSummary {
    totalStatements: number;
    totalViolations: number;
    criticalCount: number;
    warningCount: number;
}
export interface JsonReport {
    $schema: string;
    version: string;
    file: string;
    riskLevel: RiskLevel;
    riskScore: number;
    riskFactors: Array<{
        name: string;
        value: number;
        weight: number;
        detail: string;
    }>;
    statements: JsonStatement[];
    violations: JsonViolation[];
    summary: JsonSummary;
}
export interface JsonMultiReport {
    $schema: string;
    version: string;
    files: JsonReport[];
    overallRiskLevel: RiskLevel;
    totalViolations: number;
}
/**
 * Format a single file analysis as structured JSON.
 */
export declare function formatJson(analysis: AnalysisOutput, rules?: Rule[]): string;
/**
 * Format multiple file analyses as structured JSON.
 */
export declare function formatJsonMulti(results: AnalysisOutput[], rules?: Rule[]): string;
//# sourceMappingURL=json.d.ts.map