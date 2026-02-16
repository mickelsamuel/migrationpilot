/**
 * MP017: no-drop-column
 *
 * Dropping a column takes an ACCESS EXCLUSIVE lock for the duration of the
 * catalog update. On PG < 11 it can trigger a full table rewrite if the column
 * has a non-null default. Even on PG 11+, running application code may still
 * reference the column, causing errors.
 *
 * Safe alternative: Remove all application code references first, then drop
 * the column in a separate deployment with a short lock_timeout.
 */
import type { Rule } from './engine.js';
export declare const noDropColumn: Rule;
//# sourceMappingURL=MP017-no-drop-column.d.ts.map