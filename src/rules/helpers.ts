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
 * The first function in `names` appearing anywhere in the expression, labelled
 * as it would be written: `gen_random_uuid()`, or `CURRENT_TIMESTAMP`.
 *
 * Walking the tree is what makes this correct. Matching function names against
 * the serialised JSON instead reported `gen_random_uuid()` as `random()`, since
 * one name contains the other, and printed the wrong function in every finding
 * about a UUID default. It also fires on text that is not a call at all:
 * `SET DEFAULT 'nowhere'` matched `now`, and a column named `random` matched
 * `random`. Only a `FuncCall` or a `SQLValueFunction` counts here.
 */
export function findFunction(node: unknown, names: Set<string>): string | null {
  if (node === null || typeof node !== 'object') return null;

  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findFunction(item, names);
      if (found) return found;
    }
    return null;
  }

  const record = node as Record<string, unknown>;

  const call = record.FuncCall as { funcname?: Array<{ String?: { sval?: string } }> } | undefined;
  if (call) {
    const name = call.funcname?.[call.funcname.length - 1]?.String?.sval?.toLowerCase();
    if (name && names.has(name)) return `${name}()`;
  }

  const sqlValue = record.SQLValueFunction as { op?: string } | undefined;
  if (sqlValue?.op) {
    const name = sqlValue.op.replace(/^SVFOP_/, '').toLowerCase().replace(/_n$/, '');
    if (names.has(name)) return name.toUpperCase();
  }

  for (const value of Object.values(record)) {
    const found = findFunction(value, names);
    if (found) return found;
  }

  return null;
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
