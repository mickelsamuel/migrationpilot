/**
 * MP020: require-statement-timeout
 *
 * Long-running DDL without a statement_timeout can hold locks for minutes or
 * hours, causing widespread outages. Setting statement_timeout ensures the
 * operation is killed if it runs too long.
 *
 * This is particularly important for operations that may take a long time:
 * - CREATE INDEX (non-concurrent) on large tables
 * - VALIDATE CONSTRAINT on large tables
 * - CLUSTER / VACUUM FULL
 *
 * Safe alternative: SET statement_timeout before the operation.
 */

import type { Rule, RuleContext, RuleViolation } from './engine.js';

export const requireStatementTimeout: Rule = {
  id: 'MP020',
  name: 'require-statement-timeout',
  severity: 'warning',
  description: 'Long-running DDL should have a statement_timeout to prevent holding locks indefinitely.',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    // Only check statements that are potentially long-running and lock-heavy
    if (!isLongRunningCandidate(stmt, ctx)) return null;

    // Check if statement_timeout was set in a preceding statement
    const hasTimeout = hasPrecedingStatementTimeout(ctx);
    if (hasTimeout) return null;

    return {
      ruleId: 'MP020',
      ruleName: 'require-statement-timeout',
      severity: 'warning',
      message: `Long-running DDL without a preceding SET statement_timeout. This operation could hold locks for an extended time if it runs longer than expected.`,
      line: ctx.line,
      safeAlternative: `-- Set a timeout so the operation is killed if it runs too long
SET statement_timeout = '30s';
${ctx.originalSql}
RESET statement_timeout;`,
    };
  },
};

/**
 * Check if this statement is a candidate for long-running operations.
 * We only flag statements that could plausibly take a long time.
 */
function isLongRunningCandidate(stmt: Record<string, unknown>, ctx: RuleContext): boolean {
  // VACUUM FULL — always long
  if ('VacuumStmt' in stmt) {
    const vacuum = stmt.VacuumStmt as { options?: Array<{ DefElem?: { defname?: string } }> };
    const isFull = vacuum.options?.some(
      o => o.DefElem?.defname === 'full'
    );
    if (isFull) return true;
  }

  // CLUSTER — full table rewrite
  if ('ClusterStmt' in stmt) return true;

  // REINDEX — can be long on large indexes
  if ('ReindexStmt' in stmt) return true;

  // CREATE INDEX (non-concurrent) on existing tables
  if ('IndexStmt' in stmt) {
    const idx = stmt.IndexStmt as { concurrent?: boolean };
    // Non-concurrent index creation holds ACCESS EXCLUSIVE
    if (!idx.concurrent) return true;
  }

  // ALTER TABLE VALIDATE CONSTRAINT — full table scan
  if ('AlterTableStmt' in stmt) {
    const alter = stmt.AlterTableStmt as {
      cmds?: Array<{
        AlterTableCmd?: {
          subtype?: string;
        };
      }>;
    };
    const hasValidate = alter.cmds?.some(
      c => c.AlterTableCmd?.subtype === 'AT_ValidateConstraint'
    );
    if (hasValidate) return true;

    // ALTER TABLE SET NOT NULL — full table scan
    const hasSetNotNull = alter.cmds?.some(
      c => c.AlterTableCmd?.subtype === 'AT_SetNotNull'
    );
    if (hasSetNotNull) return true;
  }

  // Only flag operations that actually block on significant locks
  if (ctx.lock.lockType === 'ACCESS EXCLUSIVE' || ctx.lock.lockType === 'SHARE') {
    // ADD COLUMN with volatile default (PG < 11) or type change
    if ('AlterTableStmt' in stmt) {
      const alter = stmt.AlterTableStmt as {
        cmds?: Array<{
          AlterTableCmd?: {
            subtype?: string;
          };
        }>;
      };
      const hasTypeChange = alter.cmds?.some(
        c => c.AlterTableCmd?.subtype === 'AT_AlterColumnType'
      );
      if (hasTypeChange) return true;
    }
  }

  return false;
}

function hasPrecedingStatementTimeout(ctx: RuleContext): boolean {
  for (let i = 0; i < ctx.statementIndex; i++) {
    const prevStmt = ctx.allStatements[i].stmt;
    if ('VariableSetStmt' in prevStmt) {
      const varSet = prevStmt.VariableSetStmt as { name?: string };
      if (varSet.name === 'statement_timeout') return true;
    }
    const sql = ctx.allStatements[i].originalSql.toLowerCase();
    if (sql.includes('statement_timeout')) return true;
  }
  return false;
}
