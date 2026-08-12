-- UNSAFE PATH: the one-liner everybody writes.
--
-- ALTER TABLE ... SET NOT NULL must prove that no existing row violates the
-- constraint, so it scans the whole table -- and it holds ACCESS EXCLUSIVE for
-- the entire scan. ACCESS EXCLUSIVE conflicts with every other lock mode,
-- including the ACCESS SHARE that a plain SELECT takes.
--
-- Each EVENT line is printed from inside the same psql session using the server
-- clock, so it lines up with the sampler and the pgbench log without any clock
-- correction.

\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

SELECT 'EVENT|access-exclusive|ALTER TABLE users ALTER COLUMN email SET NOT NULL begins (ACCESS EXCLUSIVE)|' || extract(epoch FROM clock_timestamp());
ALTER TABLE users ALTER COLUMN email SET NOT NULL;
SELECT 'EVENT|end|ALTER TABLE completes -- ACCESS EXCLUSIVE released|' || extract(epoch FROM clock_timestamp());
