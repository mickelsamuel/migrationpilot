/* ---
id: s02
category: safe
verdict: safe
hazards: []
handbook: MPH-003
counterpart: u04
description: The version-independent NOT NULL pattern, PG 12 through 18. Steps 1 and 3 are separate transactions in the real migration set; the scan happens under SHARE UPDATE EXCLUSIVE, and step 4 skips its own scan because a valid CHECK proves no NULL exists. Step 5 is deliberately a separate statement.
--- */

-- Step 1: record the intent. No scan, brief ACCESS EXCLUSIVE.
BEGIN;
SET LOCAL lock_timeout = '2s';
ALTER TABLE orders
  ADD CONSTRAINT orders_customer_id_not_null
  CHECK (customer_id IS NOT NULL) NOT VALID;
COMMIT;

-- Step 3: validate under SHARE UPDATE EXCLUSIVE. Reads and writes continue.
-- Deliberately its own transaction: validating inside the transaction that
-- created the constraint holds one lock across both and buys nothing.
BEGIN;
ALTER TABLE orders VALIDATE CONSTRAINT orders_customer_id_not_null;
COMMIT;

-- Step 4: promote. The valid CHECK lets PostgreSQL skip the scan.
BEGIN;
SET LOCAL lock_timeout = '2s';
ALTER TABLE orders ALTER COLUMN customer_id SET NOT NULL;
COMMIT;

-- Step 5: drop the scaffolding. Must not be combined with step 4.
BEGIN;
SET LOCAL lock_timeout = '2s';
ALTER TABLE orders DROP CONSTRAINT orders_customer_id_not_null;
COMMIT;
