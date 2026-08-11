/* ---
id: u08
category: unsafe
verdict: dangerous
hazards: [column-type-rewrite]
handbook: MPH-007
lock: ACCESS EXCLUSIVE
description: int to bigint changes the on-disk width, so the entire table and all its indexes are rewritten under ACCESS EXCLUSIVE. There is no in-place safe version; the fix is expand/contract.
--- */

SET lock_timeout = '2s';
SET statement_timeout = '30s';

ALTER TABLE events ALTER COLUMN id TYPE bigint;
