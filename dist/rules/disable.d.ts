/**
 * Inline disable comment parser for MigrationPilot.
 *
 * Supports these comment formats in SQL:
 *
 * -- migrationpilot-disable MP001
 *     Disables MP001 for the next SQL statement
 *
 * -- migrationpilot-disable MP001, MP002
 *     Disables multiple rules for the next statement
 *
 * -- migrationpilot-disable
 *     Disables ALL rules for the next statement
 *
 * -- migrationpilot-disable-file
 *     Disables ALL rules for the entire file
 *
 * -- migrationpilot-disable-file MP001
 *     Disables MP001 for the entire file
 *
 * Comment markers are case-insensitive and work with both -- and block comments.
 */
import type { RuleViolation } from './engine.js';
export interface DisableDirective {
    type: 'statement' | 'file';
    ruleIds: string[] | 'all';
    line: number;
}
/**
 * Parse all disable directives from the SQL source.
 */
export declare function parseDisableDirectives(sql: string): DisableDirective[];
/**
 * Filter violations based on disable directives.
 *
 * A statement-level directive disables rules for the nearest following
 * SQL statement (by line number). A file-level directive applies to all.
 */
export declare function filterDisabledViolations(violations: RuleViolation[], directives: DisableDirective[], statementLines: number[]): RuleViolation[];
//# sourceMappingURL=disable.d.ts.map