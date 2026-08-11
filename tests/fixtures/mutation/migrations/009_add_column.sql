SET lock_timeout = '5s';
SET statement_timeout = '30s';

ALTER TABLE orders ADD COLUMN shipped_at TIMESTAMPTZ;
