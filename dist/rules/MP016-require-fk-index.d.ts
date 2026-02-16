/**
 * MP016: require-index-on-fk
 *
 * Foreign key columns without an index cause sequential scans on the referencing
 * table whenever the referenced table row is updated or deleted. On large tables
 * this means long-held SHARE locks and cascading slowdowns.
 *
 * Safe alternative: CREATE INDEX CONCURRENTLY on the FK column(s) before or
 * after adding the constraint.
 */
import type { Rule } from './engine.js';
export declare const requireFKIndex: Rule;
//# sourceMappingURL=MP016-require-fk-index.d.ts.map