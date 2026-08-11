---
id: MPH-002
title: Missing lock_timeout and the lock queue
rules: [MP004, MP020, MP019]
pg_versions: "lock_timeout available 9.3 and later; applies to all supported versions (14–18)"
lock_mode: ACCESS EXCLUSIVE
severity: critical
confidence: High
last_verified: 2026-08-11
verified_against: PostgreSQL 17.10
incidents:
  - name: "GoCardless: Zero-downtime Postgres migrations — the hard parts"
    date: "2024-06"
    url: "https://gocardless.com/blog/zero-downtime-postgres-migrations-the-hard-parts"
  - name: "Xata: Schema changes and the Postgres lock queue"
    date: "2024-06-18"
    url: "https://xata.io/blog/migrations-and-exclusive-locks"
  - name: "GitLab.com production incident #6642: Post Deploy migrations Failure on Auto-Deploy"
    date: "2022-03-18"
    url: "https://gitlab.com/gitlab-com/gl-infra/production/-/issues/6642"
  - name: "postgres.ai: Zero-downtime Postgres schema migrations need this — lock_timeout and retries"
    date: "2021-09-23"
    url: "https://postgres.ai/blog/20210923-zero-downtime-postgres-schema-migrations-lock-timeout-and-retries"
---

# Missing lock_timeout and the lock queue

This is the entry that matters most. Nearly every migration outage is this one wearing a costume.

The intuition people have is that a blocked `ALTER TABLE` waits politely off to one side while the
database carries on. It does not. A blocked `ALTER TABLE` **takes the head of the lock queue and
everything else lines up behind it** — including plain `SELECT`s that would not have conflicted
with anything. A ten-millisecond DDL statement, run at the wrong moment, takes the table
completely offline for as long as one unrelated slow query keeps running.

## Affected versions

All supported versions (14–18). `lock_timeout` was added in PostgreSQL 9.3 and its behaviour is
unchanged since.

## Mechanism

Two facts from the manual combine into the failure.

**Fact one — `ACCESS EXCLUSIVE` conflicts with everything.** From
[13.3. Explicit Locking](https://www.postgresql.org/docs/current/explicit-locking.html):

> Conflicts with locks of all modes (`ACCESS SHARE`, `ROW SHARE`, `ROW EXCLUSIVE`,
> `SHARE UPDATE EXCLUSIVE`, `SHARE`, `SHARE ROW EXCLUSIVE`, `EXCLUSIVE`, and `ACCESS EXCLUSIVE`).
> This mode guarantees that the holder is the only transaction accessing the table in any way.

Most `ALTER TABLE` forms take it. So does `DROP TABLE`, `TRUNCATE`, `REINDEX`, `CLUSTER`, and
`VACUUM FULL`.

**Fact two — lock requests queue, and the queue is ordered.** The manual states only that a
transaction "will wait indefinitely for conflicting locks to be released". The consequence it does
not spell out is that a *waiting* lock request blocks later requests that conflict with **it**,
not merely with the lock currently held. GoCardless states it directly:

> When a lock can't be acquired because of a lock held by another transaction, it goes into a
> queue. Any locks that conflict with the queued lock will queue up behind it.

Put together, the sequence is:

1. A reporting query starts. It holds `ACCESS SHARE` on `users` and runs for 40 seconds.
2. Your migration runs `ALTER TABLE users ADD COLUMN age int`. It wants `ACCESS EXCLUSIVE`, which
   conflicts with the reporting query's `ACCESS SHARE`. It waits.
3. A normal `SELECT` from your application arrives. It wants `ACCESS SHARE`, which does **not**
   conflict with the reporting query — but it does conflict with the queued `ACCESS EXCLUSIVE`
   request ahead of it. It waits.
4. Steps 3 repeats for every request for the next 40 seconds. The table is dark.

The `ALTER TABLE` itself was never slow. The outage duration is set by the slowest query that was
already running when the migration started.

`lock_timeout` bounds step 2. If the lock cannot be acquired within the timeout, the statement
errors with `55P03 lock_not_available`, releases its queue position, and the backlog drains. You
retry the deploy instead of explaining an outage.

Note that `statement_timeout` is **not** a substitute. `statement_timeout` also caps the DDL once
it starts doing work, but a `lock_timeout` specifically caps the waiting-for-the-lock phase, which
is the phase that causes the pile-up.

## Unsafe SQL

```sql
-- No lock_timeout. If anything is reading users, this parks at the head of the
-- lock queue and blocks the whole table until the other query finishes.
ALTER TABLE users ADD COLUMN age integer;
```

## Safe SQL

```sql
-- Bound the wait. If we can't get the lock quickly, fail the deploy, don't take the site down.
SET lock_timeout = '2s';
SET statement_timeout = '30s';

ALTER TABLE users ADD COLUMN age integer;
```

Retry logic belongs around it, because a failed acquisition is expected and normal:

```sql
DO $$
DECLARE
  attempt int := 0;
BEGIN
  LOOP
    attempt := attempt + 1;
    BEGIN
      SET LOCAL lock_timeout = '2s';
      ALTER TABLE users ADD COLUMN age integer;
      RAISE NOTICE 'acquired on attempt %', attempt;
      EXIT;
    EXCEPTION WHEN lock_not_available THEN
      IF attempt >= 5 THEN
        RAISE;
      END IF;
      PERFORM pg_sleep(attempt * 2);   -- back off, let the queue drain
    END;
  END LOOP;
END $$;
```

Values people actually use: Xata says "values of less than 2 seconds are common"; postgres.ai
recommends `lock_timeout = '50ms'` with retries. Both are defensible — the aggressive value
assumes you retry, the relaxed value assumes you would rather land the change on the first pass.
Pick one deliberately; the failure mode of "no value at all" is the outage.

## Reproducible lab

This is the lab that shows head-of-line blocking directly. It is worth running once.

```bash
docker run --rm -d --name mp-lab -e POSTGRES_PASSWORD=lab -p 55432:5432 postgres:17
until docker exec mp-lab pg_isready -U postgres -q; do sleep 1; done
q() { docker exec -i mp-lab psql -U postgres -X -q "$@"; }

q -c "CREATE TABLE users(id int primary key, email text);
      INSERT INTO users SELECT g, 'u'||g||'@x.com' FROM generate_series(1,1000) g;"

# Session A: a slow reader. Holds ACCESS SHARE for 60s.
docker exec -i mp-lab psql -U postgres -X -q \
  -c "BEGIN; SELECT count(*) FROM users; SELECT pg_sleep(60); COMMIT;" >/dev/null 2>&1 &
sleep 2

# Session B: DDL. Wants ACCESS EXCLUSIVE, must wait behind A.
docker exec -i mp-lab psql -U postgres -X -q \
  -c "ALTER TABLE users ADD COLUMN age int;" >/dev/null 2>&1 &
sleep 2

# Session C: an ordinary SELECT. It does not conflict with A at all.
docker exec -i mp-lab psql -U postgres -X -q \
  -c "SELECT count(*) FROM users;" >/dev/null 2>&1 &
sleep 3

echo "=== who is waiting ==="
q -c "SELECT pid, state, wait_event_type, wait_event,
             left(regexp_replace(query,'\s+',' ','g'),46) AS query
      FROM pg_stat_activity
      WHERE datname='postgres' AND pid <> pg_backend_pid() AND state <> 'idle'
      ORDER BY backend_start;"

echo "=== granted vs waiting on users ==="
q -c "SELECT l.pid, l.mode, l.granted
      FROM pg_locks l JOIN pg_class c ON c.oid = l.relation
      WHERE c.relname='users' ORDER BY l.granted DESC, l.pid;"

docker rm -f mp-lab
```

Verified output on PostgreSQL 17.10:

```
 pid | state  | wait_event_type | wait_event |                     query
-----+--------+-----------------+------------+------------------------------------------------
  95 | active | Timeout         | PgSleep    | begin; select count(*) from users; select pg_s
 103 | active | Lock            | relation   | alter table users add column age int;
 110 | active | Lock            | relation   | select count(*) from users;

 pid |        mode         | granted
-----+---------------------+---------
  95 | AccessShareLock     | t
 103 | AccessExclusiveLock | f
 110 | AccessShareLock     | f
```

Read the last line carefully. Pid 110 is a bare `SELECT count(*)`. It wants `AccessShareLock`.
Pid 95 also holds `AccessShareLock`, and those two do not conflict — pid 110 should have run
instantly. It is blocked solely because pid 103's `AccessExclusiveLock` request is ahead of it in
the queue. That is the whole mechanism, visible in three rows.

Now add `SET lock_timeout = '2s';` before the `ALTER TABLE` in session B and re-run. Session B
fails with `ERROR: canceling statement due to lock timeout`, and session C returns immediately.

## Public incidents

**GoCardless — Zero-downtime Postgres migrations: the hard parts** (page last edited 2024-06;
the post predates that revision). The outage that prompted their whole migration policy:

> we took around 15 seconds of unexpected API downtime during a planned database migration

and the resulting rule:

> Set `lock_timeout` in your migration scripts to a pause your app can tolerate. It's better to
> abort a deploy than take your application down.

<https://gocardless.com/blog/zero-downtime-postgres-migrations-the-hard-parts>

**Xata — Schema changes and the Postgres lock queue** (2024-06-18, Andrew Farries). The clearest
public write-up of head-of-line blocking:

> Any other statements that require a lock on the users table are now queued behind this
> `ALTER TABLE` statement, including other `SELECT` statements that only require `ACCESS SHARE`
> locks.

<https://xata.io/blog/migrations-and-exclusive-locks>

**GitLab.com production incident #6642** (2022-03-18). A migration converting the
`ci_builds`–`runner_id` foreign key could not get its locks:

> A database migration which requires an exclusive lock on two tables is unable to complete. This
> is blocking auto-deploy from completing.

Impact window 18:36–20:13 UTC (87 minutes), resolved by manually marking the migration applied.
Note the shape: GitLab's tooling *did* bound the lock wait, so the failure mode was a blocked
deployment pipeline rather than a site outage. That is the trade this entry is asking you to make.
<https://gitlab.com/gitlab-com/gl-infra/production/-/issues/6642>

**postgres.ai — lock_timeout and retries** (2021-09-23, Nikolay Samokhvalov). Recommends
`lock_timeout = '50ms'` plus retries, and works through the "locking tree" that forms when DDL
waits. Presents lab scenarios rather than a specific production incident.
<https://postgres.ai/blog/20210923-zero-downtime-postgres-schema-migrations-lock-timeout-and-retries>

## How MigrationPilot catches it

- **MP004** (`require-lock-timeout`, critical) — flags any migration that issues DDL without
  setting `lock_timeout` in the session.
- **MP020** (`require-statement-timeout`) — the companion bound, for the phase after the lock is
  acquired.
- **MP019** (`no-exclusive-lock-high-connections`) — flags `ACCESS EXCLUSIVE` DDL on databases
  configured with high connection counts, where the queue drains slowly and the pile-up is worst.

## Confidence

**High** — mechanism documented in the manual and reproduced in the lab with captured output;
four named public sources with dates, including one dated production incident.

Last verified 2026-08-11 against PostgreSQL 17.10.
