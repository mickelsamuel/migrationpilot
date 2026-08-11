-- Deploy app:add_user_index to pg
-- requires: users

BEGIN;

CREATE INDEX idx_users_email ON app.users (email);

COMMIT;
