import type { Rule, RuleContext, RuleViolation } from './engine.js';

export const requireLockTimeout: Rule = {
  id: 'MP004',
  name: 'require-lock-timeout',
  severity: 'critical',
  description: 'DDL operations should set lock_timeout to prevent blocking the lock queue indefinitely.',
  whyItMatters: 'Without lock_timeout, if the table is locked by another query, your DDL waits indefinitely. All subsequent queries pile up behind it in the lock queue, causing cascading timeouts across your application. GoCardless enforces a 750ms lock_timeout for this reason.',
  docsUrl: 'https://migrationpilot.dev/rules/mp004',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    // Only check DDL statements that take ACCESS EXCLUSIVE or SHARE locks
    if (ctx.lock.lockType !== 'ACCESS EXCLUSIVE' && ctx.lock.lockType !== 'SHARE') {
      return null;
    }

    // Skip non-DDL statements (SET, RESET, etc.)
    if ('VariableSetStmt' in stmt) return null;
    if ('VariableShowStmt' in stmt) return null;
    if ('TransactionStmt' in stmt) return null;

    // Skip CREATE TABLE — new tables have no contention
    if ('CreateStmt' in stmt) return null;

    // Check if lock_timeout was set in a preceding statement
    const hasLockTimeout = hasPrecedingLockTimeout(ctx);
    if (hasLockTimeout) return null;

    return {
      ruleId: 'MP004',
      ruleName: 'require-lock-timeout',
      severity: 'critical',
      message: `DDL statement acquires ${ctx.lock.lockType} lock without a preceding SET lock_timeout. Without a timeout, this statement could block the lock queue indefinitely if it can't acquire the lock, causing cascading query failures.`,
      line: ctx.line,
      safeAlternative: `-- Set a timeout so DDL fails fast instead of blocking the queue
SET lock_timeout = '5s';
${ctx.originalSql}
RESET lock_timeout;`,
    };
  },
};

function hasPrecedingLockTimeout(ctx: RuleContext): boolean {
  for (let i = 0; i < ctx.statementIndex; i++) {
    const entry = ctx.allStatements[i];
    if (!entry) continue;
    const prevStmt = entry.stmt;
    // Check AST: SET lock_timeout is parsed as VariableSetStmt
    if ('VariableSetStmt' in prevStmt) {
      const varSet = prevStmt.VariableSetStmt as { name?: string };
      if (varSet.name === 'lock_timeout') return true;
    }
    // Also check raw SQL as fallback
    const sql = entry.originalSql.toLowerCase();
    if (sql.includes('lock_timeout')) return true;
  }
  return false;
}
