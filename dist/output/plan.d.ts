/**
 * Execution plan formatter for MigrationPilot.
 *
 * Shows a visual step-by-step plan of what each DDL statement will do:
 * - Lock type and blocking behavior
 * - Duration estimation (instant / seconds / minutes / hours)
 * - Transaction boundaries
 * - Blocking impact on reads/writes
 */
import type { LockClassification } from '../locks/classify.js';
import type { RiskScore } from '../scoring/score.js';
import type { RuleViolation } from '../rules/engine.js';
import type { TransactionContext } from '../analysis/transaction.js';
export interface PlanStatement {
    index: number;
    sql: string;
    line: number;
    lock: LockClassification;
    risk: RiskScore;
    violations: RuleViolation[];
    targets: string[];
    durationClass: DurationClass;
    inTransaction: boolean;
}
export type DurationClass = 'instant' | 'seconds' | 'minutes' | 'hours' | 'unknown';
export interface ExecutionPlan {
    file: string;
    statements: PlanStatement[];
    txContext: TransactionContext;
    totalViolations: number;
    overallRisk: RiskScore;
}
/**
 * Format an execution plan for terminal output.
 */
export declare function formatPlan(plan: ExecutionPlan): string;
/**
 * Estimate the duration class of a DDL operation.
 */
export declare function estimateDuration(stmt: Record<string, unknown>, lock: LockClassification, rowCount?: number): DurationClass;
//# sourceMappingURL=plan.d.ts.map