/* ---
id: u18
category: unsafe
verdict: dangerous
hazards: [ddl-plus-backfill-same-txn]
handbook: MPH-016
lock: ACCESS EXCLUSIVE
description: The ALTER takes ACCESS EXCLUSIVE and the transaction holds it across the UPDATE. The table is offline for the entire backfill, not for the millisecond the ALTER actually needs.
--- */

BEGIN;

SET LOCAL lock_timeout = '2s';

ALTER TABLE orders ADD COLUMN region text;

UPDATE orders SET region = lookup_region(country_code);

COMMIT;
