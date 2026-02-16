export type LockLevel = 'ACCESS EXCLUSIVE' | 'SHARE' | 'SHARE UPDATE EXCLUSIVE' | 'SHARE ROW EXCLUSIVE' | 'ROW EXCLUSIVE' | 'ACCESS SHARE';
export interface LockClassification {
    lockType: LockLevel;
    blocksReads: boolean;
    blocksWrites: boolean;
    longHeld: boolean;
}
/**
 * Classifies the PostgreSQL lock type for a given DDL statement.
 * Returns the lock level, whether it blocks reads/writes, and
 * whether the lock is held for a long duration (table scan/rewrite).
 */
export declare function classifyLock(stmt: Record<string, unknown>, pgVersion?: number): LockClassification;
//# sourceMappingURL=classify.d.ts.map