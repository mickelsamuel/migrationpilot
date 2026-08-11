-- Revert app:users from pg

BEGIN;

DROP TABLE app.users;

COMMIT;
