-- +goose NO TRANSACTION
-- +goose Up
CREATE INDEX CONCURRENTLY idx_users_email ON users (email);

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

-- +goose Down
DROP INDEX CONCURRENTLY idx_users_email;
DROP FUNCTION touch_updated_at();
