-- Every statement here has an exact inverse.
ALTER TABLE users ADD COLUMN nickname text;

CREATE INDEX CONCURRENTLY idx_users_nickname ON users (nickname);
