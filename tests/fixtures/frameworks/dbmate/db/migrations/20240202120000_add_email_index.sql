-- migrate:up transaction:false
CREATE INDEX CONCURRENTLY idx_users_email ON users (email);

-- migrate:down
DROP INDEX CONCURRENTLY idx_users_email;
