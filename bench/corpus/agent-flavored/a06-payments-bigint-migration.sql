/* ---
id: a06
category: agent-flavored
verdict: dangerous
hazards: [column-type-rewrite, replication-identity-break, non-concurrent-index]
handbook: MPH-007, MPH-017, MPH-001
description: The int-to-bigint change done the naive way: rewrite the column in place, drop and re-add the primary key, rebuild the index inline. Any one of these is an outage; together they are the classic "we ran out of int4 ids" incident.
--- */

-- Migration: widen payments.id to bigint
--
-- The payments table is approaching the int4 maximum. This migration widens
-- the primary key column and rebuilds the associated index.

BEGIN;

-- Widen the column.
ALTER TABLE payments ALTER COLUMN id TYPE bigint;
ALTER TABLE payments ALTER COLUMN order_id TYPE bigint;

-- Rebuild the primary key on the widened column.
ALTER TABLE payments DROP CONSTRAINT payments_pkey;
ALTER TABLE payments ADD CONSTRAINT payments_pkey PRIMARY KEY (id);

-- Rebuild the lookup index.
DROP INDEX IF EXISTS idx_payments_order;
CREATE INDEX idx_payments_order ON payments (order_id);

COMMIT;
