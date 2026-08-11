/* ---
id: u16
category: unsafe
verdict: dangerous
hazards: [rename-column-breakage]
handbook: MPH-015
lock: ACCESS EXCLUSIVE
description: Instant and safe for the database, and it breaks every running pod that still says "email". There is no safe single-statement rename; the safe version is expand/contract across two deploys.
--- */

SET lock_timeout = '2s';

ALTER TABLE users RENAME COLUMN email TO email_address;
