-- Index the orders lookup path and retire the legacy index.
SET lock_timeout = '5s';
SET statement_timeout = '30s';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_customer_id ON orders (customer_id);
DROP INDEX CONCURRENTLY IF EXISTS idx_orders_legacy_lookup;
