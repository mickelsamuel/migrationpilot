/* ---
id: u12
category: unsafe
verdict: dangerous
hazards: [concurrently-in-transaction]
handbook: MPH-011
lock: n/a (statement error)
description: CREATE INDEX CONCURRENTLY cannot run inside a transaction block. The migration fails outright, which most frameworks then report as a failed deploy with a half-applied migration table.
--- */

BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE INDEX CONCURRENTLY idx_orders_customer_id ON orders (customer_id);

COMMIT;
