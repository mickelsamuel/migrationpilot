/* ---
id: s11
category: safe
verdict: safe
hazards: []
handbook: MPH-004
counterpart: u05
description: The handbook's safe form for MPH-004. NOT VALID skips the scan and the constraint is enforced against new inserts and updates from the moment it commits; VALIDATE then checks pre-existing rows under SHARE UPDATE EXCLUSIVE.
--- */

BEGIN;
SET LOCAL lock_timeout = '2s';
ALTER TABLE orders
  ADD CONSTRAINT orders_amount_positive CHECK (amount > 0) NOT VALID;
COMMIT;

-- Separate transaction, as the handbook requires: validating inside the
-- transaction that created the constraint holds the strong lock across both.
BEGIN;
ALTER TABLE orders VALIDATE CONSTRAINT orders_amount_positive;
COMMIT;
