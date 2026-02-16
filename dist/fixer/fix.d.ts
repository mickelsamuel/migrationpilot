/**
 * Auto-fix engine for MigrationPilot.
 *
 * Automatically rewrites unsafe SQL statements into safe alternatives
 * for rules that have clean, automatable fixes. Complex multi-step fixes
 * (expand-contract, multi-deploy) are marked as manual-only.
 *
 * Fixable rules:
 * - MP001: CREATE INDEX → CREATE INDEX CONCURRENTLY
 * - MP004: Prepend SET lock_timeout before DDL
 * - MP009: DROP INDEX → DROP INDEX CONCURRENTLY
 * - MP020: Prepend SET statement_timeout before long-running DDL
 * - MP030: ADD CONSTRAINT CHECK → ADD CONSTRAINT CHECK NOT VALID
 * - MP033: REFRESH MATERIALIZED VIEW → REFRESH MATERIALIZED VIEW CONCURRENTLY
 *
 * Non-fixable (too complex / requires human judgment):
 * - MP002, MP003, MP005-MP008, MP010-MP019, MP021-MP029, MP031-MP032, MP034-MP048
 */
import type { RuleViolation } from '../rules/engine.js';
export interface FixResult {
    /** The fixed SQL output */
    fixedSql: string;
    /** Number of violations that were auto-fixed */
    fixedCount: number;
    /** Violations that could not be auto-fixed (require manual intervention) */
    unfixable: RuleViolation[];
}
/**
 * Auto-fix a SQL migration by replacing unsafe statements with safe alternatives.
 * Returns the fixed SQL and a list of unfixable violations.
 */
export declare function autoFix(sql: string, violations: RuleViolation[]): FixResult;
/**
 * Check if a rule is auto-fixable.
 */
export declare function isFixable(ruleId: string): boolean;
//# sourceMappingURL=fix.d.ts.map