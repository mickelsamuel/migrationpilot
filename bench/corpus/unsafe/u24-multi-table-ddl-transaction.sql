/* ---
id: u24
category: unsafe
verdict: dangerous
hazards: [multi-table-ddl-transaction, non-concurrent-index]
handbook: MPH-020
lock: ACCESS EXCLUSIVE
description: users stays locked from the first statement until COMMIT, including however long the payments lock takes to acquire. Locks accumulate and are all released together. The trailing CREATE INDEX blocks writes on orders as well.
--- */

BEGIN;

SET LOCAL lock_timeout = '2s';

ALTER TABLE users ADD COLUMN last_seen_at timestamptz;
ALTER TABLE orders ADD COLUMN channel text;
ALTER TABLE payments ADD COLUMN processor text;

CREATE INDEX idx_orders_channel ON orders (channel);

COMMIT;
