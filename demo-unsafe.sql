-- Unsafe migration example
CREATE INDEX idx_users_email ON users (email);
ALTER TABLE orders ADD COLUMN total numeric DEFAULT 0;
ALTER TABLE users ALTER COLUMN name TYPE varchar(50);
VACUUM FULL users;
DROP TABLE legacy_data;
