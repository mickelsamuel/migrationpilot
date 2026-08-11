/* ---
id: u10
category: unsafe
verdict: dangerous
hazards: [unique-constraint-scan]
handbook: MPH-009
lock: ACCESS EXCLUSIVE
description: ADD CONSTRAINT ... UNIQUE builds the backing index inline under ACCESS EXCLUSIVE. The table is fully unavailable for the whole build, not just for writes.
--- */

SET lock_timeout = '2s';
SET statement_timeout = '30s';

ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email);
