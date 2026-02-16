/**
 * MP015: no-add-column-serial
 *
 * Adding a column with SERIAL or BIGSERIAL type creates an implicit sequence
 * and DEFAULT, acquiring ACCESS EXCLUSIVE lock while rewriting the table on PG < 11.
 * Even on PG 11+, it creates a dependency on a new sequence.
 *
 * Safe alternative: Add an INTEGER/BIGINT column, create the sequence separately,
 * and set the default to nextval() in a separate statement.
 */
import type { Rule } from './engine.js';
export declare const noAddColumnSerial: Rule;
//# sourceMappingURL=MP015-add-column-with-default.d.ts.map