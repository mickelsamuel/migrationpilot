import type { LockClassification } from '../locks/classify.js';
import type { TableStats, AffectedQuery } from '../scoring/score.js';
import type { ProductionContext } from '../production/context.js';
export type Severity = 'critical' | 'warning';
export interface RuleViolation {
    ruleId: string;
    ruleName: string;
    severity: Severity;
    message: string;
    line: number;
    safeAlternative?: string;
}
export interface RuleContext {
    /** The original SQL text of this statement */
    originalSql: string;
    /** Line number in the migration file */
    line: number;
    /** Target PostgreSQL version */
    pgVersion: number;
    /** Lock classification for this statement */
    lock: LockClassification;
    /** All statements in the migration (for multi-statement rules) */
    allStatements: Array<{
        stmt: Record<string, unknown>;
        originalSql: string;
    }>;
    /** Index of this statement in allStatements */
    statementIndex: number;
    /** Production context — table stats (paid tier, optional) */
    tableStats?: TableStats;
    /** Production context — affected queries (paid tier, optional) */
    affectedQueries?: AffectedQuery[];
    /** Production context — active connections on target table (paid tier, optional) */
    activeConnections?: number;
}
export interface Rule {
    id: string;
    name: string;
    severity: Severity;
    description: string;
    whyItMatters: string;
    docsUrl: string;
    check(stmt: Record<string, unknown>, context: RuleContext): RuleViolation | null;
}
/**
 * Runs all enabled rules against a set of parsed statements.
 * Returns all violations sorted by line number.
 *
 * When productionContext is provided (paid tier), rules receive table stats,
 * affected queries, and active connection counts for the target tables.
 *
 * When fullSql is provided, inline disable comments are respected:
 * -- migrationpilot-disable MP001       (disable for next statement)
 * -- migrationpilot-disable-file        (disable for entire file)
 */
export declare function runRules(rules: Rule[], statements: Array<{
    stmt: Record<string, unknown>;
    originalSql: string;
    line: number;
    lock: LockClassification;
}>, pgVersion: number, productionContext?: ProductionContext, fullSql?: string): RuleViolation[];
/**
 * Apply config-based severity overrides to violations.
 * Allows users to downgrade critical→warning or upgrade warning→critical per rule.
 */
export declare function applySeverityOverrides(violations: RuleViolation[], ruleOverrides?: Record<string, boolean | {
    enabled?: boolean;
    severity?: Severity;
    threshold?: number;
}>): RuleViolation[];
//# sourceMappingURL=engine.d.ts.map