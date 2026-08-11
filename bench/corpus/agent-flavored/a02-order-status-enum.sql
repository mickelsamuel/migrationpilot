/* ---
id: a02
category: agent-flavored
verdict: dangerous
hazards: [enum-add-value-in-transaction, unbatched-backfill]
handbook: MPH-010, MPH-018
description: The agent wrapped everything in an explicit transaction "for safety", which is exactly what makes ALTER TYPE ... ADD VALUE fail here, and then used the new value in the same transaction. The backfill is unbounded on top of that.
--- */

-- Migration: support refunded orders
--
-- We wrap the whole migration in a transaction so that it either fully
-- applies or fully rolls back. This keeps the schema consistent.

BEGIN;

-- Add the new status value to the enum.
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'refunded';

-- Backfill existing refunded orders so reporting is correct immediately.
UPDATE orders
SET status = 'refunded'
WHERE refunded_at IS NOT NULL
  AND status <> 'refunded';

-- Add a partial index for the refunds dashboard.
CREATE INDEX IF NOT EXISTS idx_orders_refunded
  ON orders (refunded_at)
  WHERE status = 'refunded';

COMMIT;
