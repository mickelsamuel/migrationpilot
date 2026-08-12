-- The reporting client: one connection running a periodic analytical read.
--
-- This exists because a workload made only of sub-millisecond point lookups is
-- the unrealistic one. Every production database has reads that take a second --
-- a dashboard aggregate, an admin screen, a nightly export. Such a query holds
-- ACCESS SHARE on the table for its whole duration, and that is what turns a
-- short ACCESS EXCLUSIVE request into a queue: the DDL cannot start until the
-- read finishes, and every query that arrives while the DDL waits queues behind
-- the DDL rather than overtaking it.
--
-- Identical in both runs. Declared, not hidden. Run the lab with --reporter=off
-- to see the numbers without it; the README reports both.

\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned
\timing on

SELECT date_trunc('day', created_at) AS day,
       status,
       count(*)          AS n,
       avg(login_count)  AS avg_logins
FROM users
GROUP BY 1, 2
ORDER BY 1, 2;

\watch i=:interval c=:count
