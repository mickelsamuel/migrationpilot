-- Deploy app:users to pg
-- requires: appschema

BEGIN;

CREATE TABLE app.users (
    id BIGSERIAL PRIMARY KEY,
    email TEXT NOT NULL
);

COMMIT;
