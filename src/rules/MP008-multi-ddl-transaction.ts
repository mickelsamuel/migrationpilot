import type { Rule, RuleContext, RuleViolation } from './engine.js';

export const noMultiDdlTransaction: Rule = {
  id: 'MP008',
  name: 'no-multi-ddl-transaction',
  severity: 'critical',
  description: 'Multiple DDL statements in a single transaction compound lock duration. Each DDL should run in its own transaction.',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    // Only check on the SECOND DDL statement in a transaction block
    if (ctx.statementIndex === 0) return null;

    // Check if we're inside a transaction (look for BEGIN)
    const inTransaction = isInsideTransaction(ctx);
    if (!inTransaction) return null;

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

function isDDL(stmt: Record<string, unknown>): boolean {
  const ddlKeys = [
    'AlterTableStmt', 'IndexStmt', 'CreateStmt', 'DropStmt',
    'RenameStmt', 'VacuumStmt', 'ClusterStmt', 'ReindexStmt',
  ];
  return ddlKeys.some(key => key in stmt);
}

function isInsideTransaction(ctx: RuleContext): boolean {
  for (let i = ctx.statementIndex - 1; i >= 0; i--) {
    const sql = ctx.allStatements[i].originalSql.toLowerCase().trim();
    if (sql === 'begin' || sql === 'begin transaction' || sql.startsWith('begin;')) return true;
    if (sql === 'commit' || sql === 'rollback' || sql.startsWith('commit;')) return false;
  }
  return false;
}

function findPrecedingDDLInTransaction(ctx: RuleContext): number {
  for (let i = ctx.statementIndex - 1; i >= 0; i--) {
    const sql = ctx.allStatements[i].originalSql.toLowerCase().trim();
    if (sql === 'begin' || sql === 'begin transaction') return -1;
    if (isDDL(ctx.allStatements[i].stmt)) return i;
  }
  return -1;
}
