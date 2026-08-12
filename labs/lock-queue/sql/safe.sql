-- SAFE PATH: the CHECK-then-NOT NULL choreography from handbook entry MPH-004.
--
--   1. ADD CONSTRAINT ... CHECK (email IS NOT NULL) NOT VALID
--        Brief ACCESS EXCLUSIVE. No scan -- the constraint makes no claim about
--        rows that already exist, only about rows written from now on.
--   2. VALIDATE CONSTRAINT
--        The expensive part. Scans every row, but under SHARE UPDATE EXCLUSIVE,
--        which does not conflict with ACCESS SHARE or ROW EXCLUSIVE. Reads and
--        writes keep flowing.
--   3. ALTER COLUMN ... SET NOT NULL
--        Brief ACCESS EXCLUSIVE. The scan is skipped because the now-valid CHECK
--        already proves no NULL can exist.
--   4. DROP CONSTRAINT
--        Brief ACCESS EXCLUSIVE. Must be its own statement -- dropping the CHECK
--        in the same command as step 3 brings the scan back.
--
-- The steps are spaced apart by :gap seconds purely so each one shows up as a
-- distinct event in the trace. In production they are separate migrations,
-- usually minutes or hours apart, with the NULL backfill in between. The spacing
-- changes nothing about what each statement does or how long it holds its lock.

\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

SELECT 'EVENT|access-exclusive|ADD CONSTRAINT users_email_nn CHECK ... NOT VALID begins (ACCESS EXCLUSIVE)|' || extract(epoch FROM clock_timestamp());
ALTER TABLE users ADD CONSTRAINT users_email_nn CHECK (email IS NOT NULL) NOT VALID;
SELECT 'EVENT|end|ADD CONSTRAINT completes -- no scan|' || extract(epoch FROM clock_timestamp());

SELECT pg_sleep(:gap);

SELECT 'EVENT|share-update-exclusive|VALIDATE CONSTRAINT begins (SHARE UPDATE EXCLUSIVE)|' || extract(epoch FROM clock_timestamp());
ALTER TABLE users VALIDATE CONSTRAINT users_email_nn;
SELECT 'EVENT|end|VALIDATE completes -- full scan, traffic never blocked|' || extract(epoch FROM clock_timestamp());

SELECT pg_sleep(:gap);

SELECT 'EVENT|access-exclusive|ALTER COLUMN email SET NOT NULL begins (ACCESS EXCLUSIVE)|' || extract(epoch FROM clock_timestamp());
ALTER TABLE users ALTER COLUMN email SET NOT NULL;
SELECT 'EVENT|end|SET NOT NULL completes -- scan skipped, the CHECK proved it|' || extract(epoch FROM clock_timestamp());

SELECT pg_sleep(:gap);

SELECT 'EVENT|access-exclusive|DROP CONSTRAINT users_email_nn begins (ACCESS EXCLUSIVE)|' || extract(epoch FROM clock_timestamp());
ALTER TABLE users DROP CONSTRAINT users_email_nn;
SELECT 'EVENT|end|DROP CONSTRAINT completes -- scaffolding gone|' || extract(epoch FROM clock_timestamp());
