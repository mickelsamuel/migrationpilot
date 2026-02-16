/**
 * MP018: no-force-set-not-null
 *
 * ALTER TABLE ... SET NOT NULL without a pre-existing CHECK constraint scans
 * the entire table under ACCESS EXCLUSIVE lock to verify no NULLs exist.
 * On PG 12+ you can avoid the scan by adding a CHECK (col IS NOT NULL) NOT VALID
 * constraint first, validating it separately, then SET NOT NULL is instant.
 *
 * Safe alternative: Add a CHECK constraint NOT VALID, validate it, then SET NOT NULL.
 */
import type { Rule } from './engine.js';
export declare const noForceNotNull: Rule;
//# sourceMappingURL=MP018-no-force-not-null.d.ts.map