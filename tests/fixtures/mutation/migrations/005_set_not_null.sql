SET lock_timeout = '5s';
SET statement_timeout = '30s';

ALTER TABLE orders ADD CONSTRAINT chk_orders_status_not_null CHECK (status IS NOT NULL) NOT VALID;
ALTER TABLE orders VALIDATE CONSTRAINT chk_orders_status_not_null;
ALTER TABLE orders ALTER COLUMN status SET NOT NULL;
