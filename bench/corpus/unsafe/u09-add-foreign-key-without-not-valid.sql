/* ---
id: u09
category: unsafe
verdict: dangerous
hazards: [fk-without-not-valid]
handbook: MPH-008
lock: SHARE ROW EXCLUSIVE
description: ADD FOREIGN KEY scans the referencing table while holding SHARE ROW EXCLUSIVE on both it and the parent. Writes to both tables are blocked for the scan.
--- */

SET lock_timeout = '2s';
SET statement_timeout = '30s';

ALTER TABLE orders
  ADD CONSTRAINT orders_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES customers (id);
