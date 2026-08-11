/* ---
id: s07
category: safe
verdict: safe
hazards: []
handbook: MPH-010
counterpart: u11
description: The handbook's safe form for MPH-010. The value is added on its own, outside any transaction, with IF NOT EXISTS so a re-run after a failed deploy is a no-op. Nothing else belongs in this migration; the UPDATE that uses the value is a separate one.
--- */

-- Transaction wrapper disabled for this migration.
-- Rails: disable_ddl_transactions!  Django: atomic = False

ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'refunded';
