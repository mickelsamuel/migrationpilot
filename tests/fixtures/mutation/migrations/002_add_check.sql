SET lock_timeout = '5s';
SET statement_timeout = '30s';

ALTER TABLE orders ADD CONSTRAINT chk_orders_total_positive CHECK (total >= 0) NOT VALID;
ALTER TABLE orders VALIDATE CONSTRAINT chk_orders_total_positive;
