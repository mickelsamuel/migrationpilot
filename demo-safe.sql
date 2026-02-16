-- Safe migration example
SET lock_timeout = '5s';
SET statement_timeout = '30s';
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email ON users (email);
RESET lock_timeout;
RESET statement_timeout;
