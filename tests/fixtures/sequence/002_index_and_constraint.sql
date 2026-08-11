-- Two full-table operations on users in one file: a blocking index build and a
-- validating CHECK constraint. Together with 005 they blow the per-table lock
-- budget (SQ001), and the rewrite in 005 throws both away (SQ003).
CREATE INDEX idx_users_email ON users (email);

ALTER TABLE users ADD CONSTRAINT chk_users_age CHECK (age >= 0);
