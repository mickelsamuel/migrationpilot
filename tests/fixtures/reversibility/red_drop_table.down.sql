CREATE TABLE sessions (
    id bigserial PRIMARY KEY,
    user_id bigint NOT NULL,
    expires_at timestamptz NOT NULL
);
