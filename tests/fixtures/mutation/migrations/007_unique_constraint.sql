-- MPH-009: build the unique index concurrently, then hand it to the constraint.
-- No DROP INDEX ahead of the build — from the ADD CONSTRAINT onward the drop
-- would be refused — and no IF NOT EXISTS, which would skip a rebuild over an
-- index a failed attempt left invalid.
SET lock_timeout = '5s';

CREATE UNIQUE INDEX CONCURRENTLY uq_customers_email_idx ON customers (email);
ALTER TABLE customers ADD CONSTRAINT uq_customers_email UNIQUE USING INDEX uq_customers_email_idx;
