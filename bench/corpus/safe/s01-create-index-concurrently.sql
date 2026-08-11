/* ---
id: s01
category: safe
verdict: safe
hazards: []
handbook: MPH-001
counterpart: u01
description: The handbook's safe form for MPH-001. CONCURRENTLY takes SHARE UPDATE EXCLUSIVE, which does not conflict with ROW EXCLUSIVE, so writes continue. Bounded by lock_timeout, retry-safe via DROP ... IF EXISTS rather than IF NOT EXISTS, and outside any transaction.
--- */

-- Runs with the framework transaction wrapper disabled.
-- Nothing else belongs in this migration.

SET lock_timeout = '5s';
SET statement_timeout = '0';

DROP INDEX CONCURRENTLY IF EXISTS idx_orders_customer_id;

CREATE INDEX CONCURRENTLY idx_orders_customer_id ON orders (customer_id);
