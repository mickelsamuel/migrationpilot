/**
 * Transaction boundary analysis for MigrationPilot.
 *
 * Tracks which statements are inside explicit transactions (BEGIN/COMMIT)
 * and which are in autocommit mode. This context is used to:
 * - Warn about CONCURRENTLY inside transactions (always fails)
 * - Calculate total lock hold duration within a transaction
 * - Detect statements that should NOT be in a transaction
 */

export interface TransactionBlock {
  /** Index of the BEGIN statement */
  beginIndex: number;
  /** Index of the COMMIT/ROLLBACK statement (-1 if unterminated) */
  endIndex: number;
  /** Indices of DDL statements inside this transaction */
  ddlIndices: number[];
  /** Indices of statements that cannot run in transactions */
  invalidInTxIndices: number[];
  /** Line number of BEGIN */
  beginLine: number;
}

export interface TransactionContext {
  /** All detected transaction blocks */
  blocks: TransactionBlock[];
  /** Map from statement index to its enclosing transaction block (if any) */
  statementToBlock: Map<number, TransactionBlock>;
}

/**
 * Analyze transaction boundaries in a set of parsed statements.
 */
export function analyzeTransactions(
  statements: Array<{ stmt: Record<string, unknown>; originalSql: string; line: number }>
): TransactionContext {
  const blocks: TransactionBlock[] = [];
  const statementToBlock = new Map<number, TransactionBlock>();

  let currentBlock: TransactionBlock | null = null;

  for (let i = 0; i < statements.length; i++) {
    const entry = statements[i];
    if (!entry) continue;
    const { stmt, originalSql } = entry;
    const sql = originalSql.toLowerCase().trim();

    // Detect BEGIN
    if (isBegin(stmt, sql)) {
      currentBlock = {
        beginIndex: i,
        endIndex: -1,
        ddlIndices: [],
        invalidInTxIndices: [],
        beginLine: entry.line,
      };
      statementToBlock.set(i, currentBlock);
      continue;
    }

    // Detect COMMIT/ROLLBACK
    if (isEnd(stmt, sql)) {
      if (currentBlock) {
        currentBlock.endIndex = i;
        statementToBlock.set(i, currentBlock);
        blocks.push(currentBlock);
        currentBlock = null;
      }
      continue;
    }

    // Track statements inside transactions
    if (currentBlock) {
      statementToBlock.set(i, currentBlock);

      if (isDDL(stmt)) {
        currentBlock.ddlIndices.push(i);
      }

      if (cannotRunInTransaction(stmt)) {
        currentBlock.invalidInTxIndices.push(i);
      }
    }
  }

  // Handle unterminated transaction
  if (currentBlock) {
    blocks.push(currentBlock);
  }

  return { blocks, statementToBlock };
}

/**
 * Check if a statement is inside a transaction block.
 */
export function isInTransaction(
  statementIndex: number,
  txContext: TransactionContext
): boolean {
  return txContext.statementToBlock.has(statementIndex);
}

/**
 * Get the transaction block containing a statement, if any.
 */
export function getTransactionBlock(
  statementIndex: number,
  txContext: TransactionContext
): TransactionBlock | undefined {
  return txContext.statementToBlock.get(statementIndex);
}

// --- Helpers ---

function isBegin(stmt: Record<string, unknown>, sql: string): boolean {
  if ('TransactionStmt' in stmt) {
    const tx = stmt.TransactionStmt as { kind?: string };
    return tx.kind === 'TRANS_STMT_BEGIN' || tx.kind === 'TRANS_STMT_START';
  }
  return sql === 'begin' || sql === 'begin transaction' || sql.startsWith('begin;');
}

function isEnd(stmt: Record<string, unknown>, sql: string): boolean {
  if ('TransactionStmt' in stmt) {
    const tx = stmt.TransactionStmt as { kind?: string };
    return tx.kind === 'TRANS_STMT_COMMIT' || tx.kind === 'TRANS_STMT_ROLLBACK';
  }
  return sql === 'commit' || sql === 'rollback' || sql.startsWith('commit;') || sql.startsWith('rollback;');
}

function isDDL(stmt: Record<string, unknown>): boolean {
  const ddlKeys = [
    'AlterTableStmt', 'IndexStmt', 'CreateStmt', 'DropStmt',
    'RenameStmt', 'VacuumStmt', 'ClusterStmt', 'ReindexStmt',
    'AlterEnumStmt',
  ];
  return ddlKeys.some(key => key in stmt);
}

/**
 * Statements that cannot run inside a transaction.
 * CREATE INDEX CONCURRENTLY and DROP INDEX CONCURRENTLY will fail.
 */
function cannotRunInTransaction(stmt: Record<string, unknown>): boolean {
  if ('IndexStmt' in stmt) {
    const idx = stmt.IndexStmt as { concurrent?: boolean };
    return !!idx.concurrent;
  }

  // DROP INDEX CONCURRENTLY
  if ('DropStmt' in stmt) {
    const drop = stmt.DropStmt as { concurrent?: boolean };
    return !!drop.concurrent;
  }

  return false;
}
