/* ---
id: u01
category: unsafe
verdict: dangerous
hazards: [non-concurrent-index]
handbook: MPH-001
lock: SHARE
description: CREATE INDEX without CONCURRENTLY holds SHARE for the whole build, blocking every INSERT/UPDATE/DELETE on the table.
--- */

CREATE INDEX idx_orders_customer_id ON orders (customer_id);
