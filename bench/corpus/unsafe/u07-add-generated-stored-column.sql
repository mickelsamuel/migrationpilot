/* ---
id: u07
category: unsafe
verdict: dangerous
hazards: [stored-generated-rewrite]
handbook: MPH-006
lock: ACCESS EXCLUSIVE
description: A stored generated column is on the manual's rewrite list alongside volatile defaults, identity columns and constrained domain types. Full table and index rewrite under ACCESS EXCLUSIVE.
--- */

SET lock_timeout = '2s';
SET statement_timeout = '30s';

ALTER TABLE invoices
  ADD COLUMN total_cents bigint
  GENERATED ALWAYS AS (subtotal_cents + tax_cents) STORED;
