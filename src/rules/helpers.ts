import type { RuleContext } from './engine.js';

/**
 * Check if the current statement is inside a BEGIN...COMMIT transaction block.
 * Walks backwards through preceding statements looking for BEGIN or COMMIT/ROLLBACK.
 */
export function isInsideTransaction(ctx: RuleContext): boolean {
  for (let i = ctx.statementIndex - 1; i >= 0; i--) {
    const entry = ctx.allStatements[i];
    if (!entry) continue;
    const sql = entry.originalSql.toLowerCase().trim();
    if (sql === 'begin' || sql === 'begin transaction' || sql.startsWith('begin;')) return true;
    if (sql === 'commit' || sql === 'rollback' || sql.startsWith('commit;')) return false;
  }
  return false;
}

/**
 * Check if a statement is a DDL operation (schema-modifying).
 */
export function isDDL(stmt: Record<string, unknown>): boolean {
  const ddlKeys = [
    'AlterTableStmt', 'IndexStmt', 'CreateStmt', 'DropStmt',
    'RenameStmt', 'VacuumStmt', 'ClusterStmt', 'ReindexStmt',
    'RefreshMatViewStmt', 'TruncateStmt', 'DropdbStmt',
    'CreateDomainStmt', 'AlterDomainStmt',
  ];
  return ddlKeys.some(key => key in stmt);
}
