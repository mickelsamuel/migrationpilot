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
export declare function analyzeTransactions(statements: Array<{
    stmt: Record<string, unknown>;
    originalSql: string;
    line: number;
}>): TransactionContext;
/**
 * Check if a statement is inside a transaction block.
 */
export declare function isInTransaction(statementIndex: number, txContext: TransactionContext): boolean;
/**
 * Get the transaction block containing a statement, if any.
 */
export declare function getTransactionBlock(statementIndex: number, txContext: TransactionContext): TransactionBlock | undefined;
//# sourceMappingURL=transaction.d.ts.map