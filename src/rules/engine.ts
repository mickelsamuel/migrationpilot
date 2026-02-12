import type { LockClassification } from '../locks/classify.js';
import type { TableStats, AffectedQuery } from '../scoring/score.js';
import type { ProductionContext } from '../production/context.js';
import { extractTargets } from '../parser/extract.js';

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
  allStatements: Array<{ stmt: Record<string, unknown>; originalSql: string }>;
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
  check(stmt: Record<string, unknown>, context: RuleContext): RuleViolation | null;
}

/**
 * Runs all enabled rules against a set of parsed statements.
 * Returns all violations sorted by line number.
 *
 * When productionContext is provided (paid tier), rules receive table stats,
 * affected queries, and active connection counts for the target tables.
 */
export function runRules(
  rules: Rule[],
  statements: Array<{ stmt: Record<string, unknown>; originalSql: string; line: number; lock: LockClassification }>,
  pgVersion: number,
  productionContext?: ProductionContext
): RuleViolation[] {
  const violations: RuleViolation[] = [];

  for (let i = 0; i < statements.length; i++) {
    const { stmt, originalSql, line, lock } = statements[i];

    // Resolve production context for target tables
    let tableStats: TableStats | undefined;
    let affectedQueries: AffectedQuery[] | undefined;
    let activeConnections: number | undefined;

    if (productionContext) {
      const targets = extractTargets(stmt);
      const tableName = targets[0]?.tableName;
      if (tableName) {
        tableStats = productionContext.tableStats.get(tableName);
        const queries = productionContext.affectedQueries.get(tableName);
        if (queries && queries.length > 0) affectedQueries = queries;
        const conns = productionContext.activeConnections.get(tableName);
        if (conns && conns > 0) activeConnections = conns;
      }
    }

    const context: RuleContext = {
      originalSql,
      line,
      pgVersion,
      lock,
      allStatements: statements,
      statementIndex: i,
      tableStats,
      affectedQueries,
      activeConnections,
    };

    for (const rule of rules) {
      const violation = rule.check(stmt, context);
      if (violation) {
        violations.push(violation);
      }
    }
  }

  return violations.sort((a, b) => a.line - b.line);
}
