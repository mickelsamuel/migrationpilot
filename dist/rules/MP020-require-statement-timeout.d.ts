/**
 * MP020: require-statement-timeout
 *
 * Long-running DDL without a statement_timeout can hold locks for minutes or
 * hours, causing widespread outages. Setting statement_timeout ensures the
 * operation is killed if it runs too long.
 *
 * This is particularly important for operations that may take a long time:
 * - CREATE INDEX (non-concurrent) on large tables
 * - VALIDATE CONSTRAINT on large tables
 * - CLUSTER / VACUUM FULL
 *
 * Safe alternative: SET statement_timeout before the operation.
 */
import type { Rule } from './engine.js';
export declare const requireStatementTimeout: Rule;
//# sourceMappingURL=MP020-require-statement-timeout.d.ts.map