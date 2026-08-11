-- CREATE INDEX CONCURRENTLY cannot run inside a transaction block.
-- Static analysis flags it; this fixture exists to prove the server rejects it
-- too, with its own message and SQLSTATE 25001.
BEGIN;

CREATE TABLE sessions (
  id uuid PRIMARY KEY,
  user_id integer NOT NULL
);

CREATE INDEX CONCURRENTLY idx_sessions_user_id ON sessions (user_id);

COMMIT;
