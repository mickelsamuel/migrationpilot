import type { RuleContext } from './engine.js';
import { isTransactionBegin, isTransactionEnd } from '../analysis/transaction.js';

export { isTransactionBegin, isTransactionEnd } from '../analysis/transaction.js';

/**
 * Check if the current statement is inside a BEGIN...COMMIT transaction block.
 * Walks backwards through preceding statements looking for BEGIN or COMMIT/ROLLBACK.
 *
 * Detection reads the parse tree, not the statement text: a comment written
 * above `BEGIN` becomes part of that statement's text, and matching the text
 * against the keyword used to silence every rule downstream of this one.
 */
export function isInsideTransaction(ctx: RuleContext): boolean {
  return enclosingBeginIndex(ctx) !== -1;
}

/**
 * Index of the `BEGIN` opening the block this statement sits in, or -1 when the
 * statement runs in autocommit.
 */
export function enclosingBeginIndex(ctx: RuleContext): number {
  return enclosingBeginIndexAt(ctx.allStatements, ctx.statementIndex);
}

/** As above, addressed by position rather than by the current statement. */
export function enclosingBeginIndexAt(
  statements: Array<{ stmt: Record<string, unknown>; originalSql: string }>,
  index: number,
): number {
  for (let i = index - 1; i >= 0; i--) {
    const entry = statements[i];
    if (!entry) continue;
    if (isTransactionBegin(entry.stmt, entry.originalSql)) return i;
    if (isTransactionEnd(entry.stmt, entry.originalSql)) return -1;
  }
  return -1;
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
