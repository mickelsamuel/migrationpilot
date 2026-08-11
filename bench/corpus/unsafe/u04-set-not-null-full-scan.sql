/* ---
id: u04
category: unsafe
verdict: dangerous
hazards: [set-not-null-scan]
handbook: MPH-003
lock: ACCESS EXCLUSIVE
description: SET NOT NULL scans every row under ACCESS EXCLUSIVE unless a valid CHECK already proves no NULL can exist. Reads and writes both blocked for the length of the scan.
--- */

SET lock_timeout = '2s';
SET statement_timeout = '30s';

ALTER TABLE orders ALTER COLUMN customer_id SET NOT NULL;
