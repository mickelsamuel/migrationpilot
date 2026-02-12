import type { LockClassification } from '../locks/classify.js';

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
 */
export function runRules(
  rules: Rule[],
  statements: Array<{ stmt: Record<string, unknown>; originalSql: string; line: number; lock: LockClassification }>,
  pgVersion: number
): RuleViolation[] {
  const violations: RuleViolation[] = [];

  for (let i = 0; i < statements.length; i++) {
    const { stmt, originalSql, line, lock } = statements[i];

    const context: RuleContext = {
      originalSql,
      line,
      pgVersion,
      lock,
      allStatements: statements,
      statementIndex: i,
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
