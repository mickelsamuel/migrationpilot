CREATE TABLE users (id BIGINT PRIMARY KEY, name TEXT);
CREATE INDEX idx_users_name ON users (name);
