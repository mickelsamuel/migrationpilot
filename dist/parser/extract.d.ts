export interface ExtractedTarget {
    tableName: string;
    schemaName?: string;
    columns?: string[];
    operation: string;
}
/**
 * Extracts target tables and columns from a parsed DDL statement.
 * Handles: AlterTableStmt, IndexStmt, CreateStmt, DropStmt,
 *          RenameStmt, CreateTrigStmt, VacuumStmt
 */
export declare function extractTargets(stmt: Record<string, unknown>): ExtractedTarget[];
//# sourceMappingURL=extract.d.ts.map