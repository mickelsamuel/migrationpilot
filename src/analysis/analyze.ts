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
import type { Rule, RuleViolation } from '../rules/engine.js';
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

  // Raw SQL fallback for PG18 syntax the parser can't handle.
  // The current libpg-query-wasm is based on PG16/17 and silently drops
  // PG18 syntax (NOT ENFORCED, SET NOT NULL NOT VALID). Run regex-based
  // rules against the raw SQL to catch these patterns.
  if (pgVersion >= 18) {
    const rawViolations = checkRawPg18Patterns(sql, rules);
    violations.push(...rawViolations);
  }

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

/**
 * Scan raw SQL for PG18 patterns that the parser cannot handle.
 * Returns violations for regex-based rules (like MP082) when the
 * parser silently drops PG18-specific statements.
 */
function checkRawPg18Patterns(sql: string, rules: Rule[]): RuleViolation[] {
  const violations: RuleViolation[] = [];

  // Find rules that can operate on raw SQL (their check() handles empty stmt)
  const rawSqlRuleIds = new Set(['MP082']);
  const rawRules = rules.filter(r => rawSqlRuleIds.has(r.id));
  if (rawRules.length === 0) return violations;

  const defaultLock = { lockType: 'ACCESS EXCLUSIVE' as const, blocksReads: true, blocksWrites: true, longHeld: false };

  // Split raw SQL into statement-like chunks by semicolons
  const chunks = sql.split(';').filter(c => c.trim().length > 0);
  for (const chunk of chunks) {
    const trimmed = chunk.trim();
    // Calculate line number of this chunk
    const chunkStart = sql.indexOf(trimmed);
    const line = chunkStart >= 0 ? sql.slice(0, chunkStart).split('\n').length : 1;

    for (const rule of rawRules) {
      const v = rule.check({}, {
        originalSql: trimmed,
        line,
        pgVersion: 18,
        lock: defaultLock,
        allStatements: [{ stmt: {}, originalSql: trimmed }],
        statementIndex: 0,
      });
      if (v) {
        // Avoid duplicates if the rule already fired via normal pipeline
        if (!violations.some(ev => ev.ruleId === v.ruleId && ev.line === v.line)) {
          violations.push(v);
        }
      }
    }
  }

  return violations;
}
