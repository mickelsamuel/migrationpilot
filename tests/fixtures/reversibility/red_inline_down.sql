-- +goose Up
TRUNCATE TABLE staging_events;

-- +goose Down
-- Nothing to restore: staging_events is rebuilt from the loader on every run.
