import type { RiskScore } from '../scoring/score.js';
import type { Rule, RuleViolation } from '../rules/engine.js';
import type { LockClassification } from '../locks/classify.js';
export interface FormatOptions {
    /** Rules array for "Why this matters" + docs URL display */
    rules?: Rule[];
    /** Timing metadata for footer */
    timing?: {
        ruleCount: number;
        elapsedMs: number;
    };
}
export interface StatementResult {
    sql: string;
    lock: LockClassification;
    risk: RiskScore;
    violations: RuleViolation[];
}
export interface AnalysisOutput {
    file: string;
    statements: StatementResult[];
    overallRisk: RiskScore;
    violations: RuleViolation[];
}
export declare function formatCliOutput(analysis: AnalysisOutput, options?: FormatOptions): string;
/**
 * Format a summary for the `check` command when scanning multiple files.
 */
export declare function formatCheckSummary(results: AnalysisOutput[], meta?: {
    ruleCount: number;
    elapsedMs: number;
}): string;
/**
 * Quiet output: one line per violation, gcc-style.
 * file:line: [MPXXX] SEVERITY: message
 */
export declare function formatQuietOutput(analysis: AnalysisOutput): string;
/**
 * Verbose output: normal output plus a pass/fail summary for every rule on every statement.
 */
export declare function formatVerboseOutput(analysis: AnalysisOutput, rules: Rule[]): string;
//# sourceMappingURL=cli.d.ts.map