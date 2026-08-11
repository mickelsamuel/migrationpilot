/* ---
id: u13
category: unsafe
verdict: dangerous
hazards: [invalid-index-retry]
handbook: MPH-012
lock: SHARE UPDATE EXCLUSIVE
description: CREATE INDEX CONCURRENTLY IF NOT EXISTS reports success over an index left invalid by an earlier failed attempt. The retry-safe form drops first, never IF NOT EXISTS.
--- */

SET lock_timeout = '5s';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email ON users (email);
