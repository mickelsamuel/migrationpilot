/* ---
id: u02
category: unsafe
verdict: dangerous
hazards: [non-concurrent-index]
handbook: MPH-001
lock: SHARE
description: Same hazard as u01, but with both timeouts already set so the only thing left to find is the missing CONCURRENTLY. Isolates hazard detection from timeout hygiene.
--- */

SET lock_timeout = '2s';
SET statement_timeout = '30s';

CREATE INDEX idx_events_account_created ON events (account_id, created_at DESC);
