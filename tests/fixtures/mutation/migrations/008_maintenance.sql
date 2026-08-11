SET lock_timeout = '5s';
SET statement_timeout = '30s';

VACUUM ANALYZE orders;
ALTER TABLE orders_partitioned DETACH PARTITION orders_2023 CONCURRENTLY;
GRANT SELECT ON orders TO reporting_role;
