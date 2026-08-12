-- Lock sampler. Emits one JSON object per line, one line per sample.
--
-- Joins pg_locks to pg_stat_activity for every relation lock held or awaited on
-- `users` (and its indexes), so a single sample answers: who is waiting, who is
-- running, in what lock mode, and who is blocking them.
--
-- Driven by psql's \watch, whose interval and count are substituted by run-lab.sh.
-- Timestamps come from clock_timestamp() on the server, which is the same clock
-- pgbench and the DDL runner use because all three run inside the container.

\pset tuples_only on
\pset format unaligned

SELECT json_build_object(
  'ts', extract(epoch FROM clock_timestamp()),
  'backends', coalesce((
    SELECT json_agg(json_build_object(
      'pid',       a.pid,
      'granted',   l.granted,
      'mode',      l.mode,
      'rel',       l.relation::regclass::text,
      'state',     a.state,
      'waitType',  a.wait_event_type,
      'waitEvent', a.wait_event,
      'blockedBy', pg_blocking_pids(a.pid),
      'class',     CASE
                     WHEN a.query ~* '^\s*(ALTER|CREATE|DROP)' THEN 'ddl'
                     WHEN a.query ~* '^\s*SELECT'              THEN 'select'
                     WHEN a.query ~* '^\s*UPDATE'              THEN 'update'
                     ELSE 'other'
                   END,
      'runMs',     round(extract(epoch FROM (clock_timestamp() - a.query_start)) * 1000)::int
    ))
    FROM pg_locks l
    JOIN pg_stat_activity a ON a.pid = l.pid
    WHERE l.locktype = 'relation'
      AND l.relation IN (
            SELECT 'users'::regclass
            UNION
            SELECT indexrelid FROM pg_index WHERE indrelid = 'users'::regclass)
      AND a.pid <> pg_backend_pid()
      AND a.backend_type = 'client backend'
  ), '[]'::json)
);

\watch i=:interval c=:count
