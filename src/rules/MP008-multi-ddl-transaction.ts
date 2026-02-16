import type { Rule, RuleContext, RuleViolation } from './engine.js';
import { isInsideTransaction, isDDL } from './helpers.js';

export const noMultiDdlTransaction: Rule = {
  id: 'MP008',
  name: 'no-multi-ddl-transaction',
  severity: 'critical',
  description: 'Multiple DDL statements in a single transaction compound lock duration. Each DDL should run in its own transaction.',
  whyItMatters: 'When multiple DDL statements run in one transaction, all locks are held until COMMIT. This multiplies the downtime window — the total lock time is the sum of all DDL operations, not just the longest one.',
  docsUrl: 'https://migrationpilot.dev/rules/mp008',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    // Only check on the SECOND DDL statement in a transaction block
    if (ctx.statementIndex === 0) return null;

    // Check if we're inside a transaction (look for BEGIN)
    if (!isInsideTransaction(ctx)) return null;

    // Check if this is a DDL statement
    if (!isDDL(stmt)) return null;

    // Check if there's a preceding DDL in this transaction
    const prevDDLIndex = findPrecedingDDLInTransaction(ctx);
    if (prevDDLIndex === -1) return null;

    return {
      ruleId: 'MP008',
      ruleName: 'no-multi-ddl-transaction',
      severity: 'critical',
      message: `Multiple DDL statements in a single transaction. Locks are held for the ENTIRE transaction — the combined duration of all DDL operations. Run each DDL in its own transaction.`,
      line: ctx.line,
    };
  },
};

function findPrecedingDDLInTransaction(ctx: RuleContext): number {
  for (let i = ctx.statementIndex - 1; i >= 0; i--) {
    const entry = ctx.allStatements[i];
    if (!entry) continue;
    const sql = entry.originalSql.toLowerCase().trim();
    if (sql === 'begin' || sql === 'begin transaction') return -1;
    if (isDDL(entry.stmt)) return i;
  }
  return -1;
}
