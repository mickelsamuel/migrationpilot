-- Test migration exercising MP009-MP012 rules

-- MP009: DROP INDEX without CONCURRENTLY
DROP INDEX idx_users_status;

-- MP010: RENAME COLUMN
ALTER TABLE users RENAME COLUMN email TO email_address;

-- MP011: Unbatched UPDATE (full table rewrite)
UPDATE users SET status = 'active';

-- MP012: ALTER TYPE ADD VALUE in transaction
BEGIN;
ALTER TYPE user_role ADD VALUE 'admin';
COMMIT;
