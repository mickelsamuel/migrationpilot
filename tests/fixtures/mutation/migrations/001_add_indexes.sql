-- Index the orders lookup path and retire the legacy index.
-- No statement_timeout here on purpose: it would apply to the concurrent build
-- below, and a timeout that fires mid-build leaves an invalid index (MPH-012).
SET lock_timeout = '5s';

DROP INDEX CONCURRENTLY IF EXISTS idx_orders_customer_id;
CREATE INDEX CONCURRENTLY idx_orders_customer_id ON orders (customer_id);
DROP INDEX CONCURRENTLY IF EXISTS idx_orders_legacy_lookup;
