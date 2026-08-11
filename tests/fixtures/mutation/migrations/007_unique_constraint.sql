SET lock_timeout = '5s';
SET statement_timeout = '30s';

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_customers_email_idx ON customers (email);
ALTER TABLE customers ADD CONSTRAINT uq_customers_email UNIQUE USING INDEX uq_customers_email_idx;
