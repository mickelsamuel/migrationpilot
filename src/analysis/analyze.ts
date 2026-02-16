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

import { parseMigration } from '../parser/parse.js';
import { extractTargets } from '../parser/extract.js';
import { classifyLock } from '../locks/classify.js';
import { runRules } from '../rules/index.js';
import { calculateRisk } from '../scoring/score.js';
import type { Rule } from '../rules/engine.js';
import type { ProductionContext } from '../production/context.js';
import type { AnalysisOutput, StatementResult } from '../output/cli.js';

export class AnalysisError extends Error {
  file: string;
  parseErrors: string[];

  constructor(file: string, parseErrors: string[]) {
    super(`Parse errors in ${file}: ${parseErrors.join('; ')}`);
    this.name = 'AnalysisError';
    this.file = file;
    this.parseErrors = parseErrors;
  }
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
export async function analyzeSQL(
  sql: string,
  filePath: string,
  pgVersion: number,
  rules: Rule[],
  prodCtx?: ProductionContext,
): Promise<AnalysisOutput> {
  const parsed = await parseMigration(sql);

  if (parsed.errors.length > 0) {
    throw new AnalysisError(filePath, parsed.errors.map(e => e.message));
  }

  const statementsWithLocks = parsed.statements.map(s => {
    const lock = classifyLock(s.stmt, pgVersion);
    const line = sql.slice(0, s.stmtLocation).split('\n').length;
    return { ...s, lock, line };
  });

  const violations = runRules(rules, statementsWithLocks, pgVersion, prodCtx, sql);

  const statementResults: StatementResult[] = statementsWithLocks.map(s => {
    const stmtViolations = violations.filter(v => v.line === s.line);
    const targets = extractTargets(s.stmt);
    const tableName = targets[0]?.tableName;
    const tableStats = tableName ? prodCtx?.tableStats.get(tableName) : undefined;
    const affectedQueries = tableName ? prodCtx?.affectedQueries.get(tableName) : undefined;
    const risk = calculateRisk(s.lock, tableStats, affectedQueries);
    return {
      sql: s.originalSql,
      lock: s.lock,
      risk,
      violations: stmtViolations,
    };
  });

  const worstStatement = statementResults.reduce(
    (worst, s) => s.risk.score > worst.risk.score ? s : worst,
    statementResults[0] ?? { risk: calculateRisk({ lockType: 'ACCESS SHARE' as const, blocksReads: false, blocksWrites: false, longHeld: false }) },
  );

  return {
    file: filePath,
    statements: statementResults,
    overallRisk: worstStatement.risk,
    violations,
  };
}
