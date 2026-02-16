/**
 * Shared analysis pipeline for MigrationPilot.
 *
 * Extracts the core analyzeSQL function so it can be used by:
 * - CLI (src/cli.ts)
 * - Programmatic API (src/index.ts)
 * - GitHub Action (src/action/index.ts)
 *
 * Pure function: no process.exit, no console output. Throws AnalysisError on parse failures.
 */
import type { Rule } from '../rules/engine.js';
import type { ProductionContext } from '../production/context.js';
import type { AnalysisOutput } from '../output/cli.js';
export declare class AnalysisError extends Error {
    file: string;
    parseErrors: string[];
    constructor(file: string, parseErrors: string[]);
}
/**
 * Analyze a SQL migration file for safety issues.
 *
 * @param sql - Raw SQL content of the migration file
 * @param filePath - File path (used for display/reporting)
 * @param pgVersion - Target PostgreSQL version (e.g. 17)
 * @param rules - Rules to check against
 * @param prodCtx - Optional production context (Pro tier)
 * @returns Analysis results with statements, violations, and risk scoring
 * @throws {AnalysisError} If the SQL cannot be parsed
 */
export declare function analyzeSQL(sql: string, filePath: string, pgVersion: number, rules: Rule[], prodCtx?: ProductionContext): Promise<AnalysisOutput>;
//# sourceMappingURL=analyze.d.ts.map