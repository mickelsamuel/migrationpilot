/* ---
id: u06
category: unsafe
verdict: dangerous
hazards: [volatile-default-rewrite]
handbook: MPH-006
lock: ACCESS EXCLUSIVE
description: A volatile DEFAULT cannot be stored in attmissingval, so the whole table and every index is rewritten under ACCESS EXCLUSIVE. Needs a second full copy of the table on disk too.
--- */

SET lock_timeout = '2s';
SET statement_timeout = '30s';

ALTER TABLE orders ADD COLUMN public_id uuid NOT NULL DEFAULT gen_random_uuid();
