/* ---
id: u05
category: unsafe
verdict: dangerous
hazards: [check-constraint-scan]
handbook: MPH-004
lock: ACCESS EXCLUSIVE
description: ADD CONSTRAINT ... CHECK without NOT VALID scans the whole table under ACCESS EXCLUSIVE. NOT VALID skips the scan and still enforces the constraint on new rows.
--- */

SET lock_timeout = '2s';
SET statement_timeout = '30s';

ALTER TABLE orders ADD CONSTRAINT orders_amount_positive CHECK (amount > 0);
