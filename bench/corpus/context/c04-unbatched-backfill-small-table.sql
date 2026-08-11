/* ---
id: c04
category: context
verdict: context-dependent
hazards: [unbatched-backfill]
handbook: MPH-018
safe_at: small
description: An unbatched UPDATE across a configuration table with a few dozen rows. Identical shape to u21, and the WAL, replication-lag and lock-duration arguments all evaporate at this size. Only table size separates a no-op from a multi-hour incident.
--- */

SET lock_timeout = '2s';
SET statement_timeout = '30s';

-- tenant_settings: one row per tenant, currently 63 rows.
UPDATE tenant_settings SET notification_channel = 'email'
WHERE notification_channel IS NULL;
