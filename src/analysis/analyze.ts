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
import { lineAt, lineStartOffsets, statementStart } from '../parser/position.js';
import { extractTargets } from '../parser/extract.js';
import { classifyLock } from '../locks/classify.js';
import { runRules, violationsOfStatement } from '../rules/index.js';
import { calculateRisk, calculateOverallRisk } from '../scoring/score.js';
import { gradeReversibility } from '../generator/grade.js';
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
 * @returns Analysis results with statements, violations, risk scoring, and a
 *          reversibility grade (the companion down file is resolved by the caller)
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

  const statementsWithLocks = parsed.statements.map(s => ({
    ...s,
    lock: classifyLock(s.stmt, pgVersion),
  }));

  const violations = runRules(rules, statementsWithLocks, pgVersion, prodCtx, sql);

  // Raw SQL pass for PG18 patterns the AST does not expose.
  // The current libpg-query-wasm is based on PG16/17 and REJECTS PG18-only
  // syntax (NOT ENFORCED, ADD CONSTRAINT ... NOT NULL col NOT VALID) with a
  // parse error rather than dropping it silently — a migration that actually
  // uses it already threw AnalysisError above. So this pass only ever sees
  // files that parsed cleanly; it re-runs the regex-based rules (MP082) over
  // the raw text for patterns those files carry in a parseable form.
  if (pgVersion >= 18) {
    const rawViolations = checkRawPg18Patterns(sql, rules);
    violations.push(...rawViolations);
  }

  const statementResults: StatementResult[] = statementsWithLocks.map((s, i) => {
    const stmtViolations = violationsOfStatement(violations, i, s.line);
    const targets = extractTargets(s.stmt);
    const tableName = targets[0]?.tableName;
    const tableStats = tableName ? prodCtx?.tableStats.get(tableName) : undefined;
    const affectedQueries = tableName ? prodCtx?.affectedQueries.get(tableName) : undefined;
    const risk = calculateRisk(s.lock, tableStats, affectedQueries);
    return {
      sql: s.originalSql,
      line: s.line,
      lock: s.lock,
      risk,
      violations: stmtViolations,
    };
  });

  return {
    file: filePath,
    statements: statementResults,
    overallRisk: calculateOverallRisk(statementResults.map(s => s.risk), violations),
    violations,
    reversibility: gradeReversibility(statementsWithLocks),
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

  // Split raw SQL into statement-like chunks by semicolons, walking a cursor so
  // each chunk's line comes from where it actually sits rather than from the
  // first place its text happens to appear.
  const lineStarts = lineStartOffsets(sql);
  let cursor = 0;
  for (const chunk of sql.split(';')) {
    const chunkStart = cursor;
    cursor += chunk.length + 1;

    const trimmed = chunk.trim();
    if (trimmed.length === 0) continue;

    const line = lineAt(lineStarts, statementStart(sql, chunkStart, chunkStart + chunk.length));

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
