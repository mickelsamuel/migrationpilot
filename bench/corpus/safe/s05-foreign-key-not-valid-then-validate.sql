/* ---
id: s05
category: safe
verdict: safe
hazards: []
handbook: MPH-008
counterpart: u09
description: The handbook's safe form for MPH-008. Index the referencing column first so parent deletes do not become sequential scans, add the constraint NOT VALID for a brief SHARE ROW EXCLUSIVE, then validate under SHARE UPDATE EXCLUSIVE with writes continuing.
--- */

SET lock_timeout = '5s';
DROP INDEX CONCURRENTLY IF EXISTS idx_orders_customer_id;
CREATE INDEX CONCURRENTLY idx_orders_customer_id ON orders (customer_id);

SET lock_timeout = '2s';
ALTER TABLE orders
  ADD CONSTRAINT orders_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES customers (id)
  NOT VALID;

ALTER TABLE orders VALIDATE CONSTRAINT orders_customer_id_fkey;
