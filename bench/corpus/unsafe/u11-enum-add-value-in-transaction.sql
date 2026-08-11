/* ---
id: u11
category: unsafe
verdict: dangerous
hazards: [enum-add-value-in-transaction]
handbook: MPH-010
lock: n/a (statement error)
description: A new enum value cannot be used in the same transaction that added it. Errors with "unsafe use of new value" on PG 12-18 and "cannot run inside a transaction block" on 11 and earlier.
--- */

BEGIN;

ALTER TYPE order_status ADD VALUE 'refunded';

UPDATE orders SET status = 'refunded' WHERE refunded_at IS NOT NULL;

COMMIT;
