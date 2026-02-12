-- This migration has several dangerous patterns that MigrationPilot should catch

-- No lock_timeout set!
CREATE INDEX idx_users_email ON users (email);

-- Column type change causes full table rewrite
ALTER TABLE users ALTER COLUMN email TYPE varchar(255);

-- FK without NOT VALID scans entire table
ALTER TABLE orders ADD CONSTRAINT fk_user
  FOREIGN KEY (user_id) REFERENCES users (id);

-- Multiple DDL in a transaction
BEGIN;
ALTER TABLE products ADD COLUMN category text;
ALTER TABLE products ADD COLUMN tags text[];
COMMIT;
