/* ---
id: s15
category: safe
verdict: safe
hazards: []
handbook: MPH-012
description: Dropping an unused index the safe way. DROP INDEX CONCURRENTLY takes SHARE UPDATE EXCLUSIVE rather than the ACCESS EXCLUSIVE a plain DROP INDEX would take, so reads and writes continue. IF EXISTS makes the migration re-runnable.
--- */

-- Transaction wrapper disabled: DROP INDEX CONCURRENTLY cannot run inside one.

SET lock_timeout = '5s';

DROP INDEX CONCURRENTLY IF EXISTS idx_orders_legacy_status;
