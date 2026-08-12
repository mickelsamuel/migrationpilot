-- Deterministic seed for the lock-queue lab.
-- No random() anywhere: the same ROWS value always produces byte-identical data.
-- Every email is non-NULL, so both the unsafe and the safe path succeed and the
-- only thing being measured is the locking behaviour, not error handling.

\set ON_ERROR_STOP on

CREATE TABLE users (
  id           bigint PRIMARY KEY,
  email        text,
  display_name text,
  status       text,
  login_count  int NOT NULL DEFAULT 0,
  last_seen_at timestamptz,
  created_at   timestamptz NOT NULL
);

INSERT INTO users
SELECT g,
       'user' || g || '@example.com',
       'User ' || g,
       (ARRAY['active','inactive','pending'])[1 + (g % 3)],
       g % 97,
       NULL,
       timestamptz '2024-01-01 00:00:00+00' + ((g % 500) * interval '1 hour')
FROM generate_series(1, :rows) g;

VACUUM ANALYZE users;

SELECT count(*) AS rows,
       pg_size_pretty(pg_relation_size('users')) AS heap,
       pg_size_pretty(pg_total_relation_size('users')) AS total
FROM users;
