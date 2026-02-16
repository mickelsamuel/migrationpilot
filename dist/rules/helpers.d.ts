import type { RuleContext } from './engine.js';
/**
 * Check if the current statement is inside a BEGIN...COMMIT transaction block.
 * Walks backwards through preceding statements looking for BEGIN or COMMIT/ROLLBACK.
 */
export declare function isInsideTransaction(ctx: RuleContext): boolean;
/**
 * Check if a statement is a DDL operation (schema-modifying).
 */
export declare function isDDL(stmt: Record<string, unknown>): boolean;
//# sourceMappingURL=helpers.d.ts.map