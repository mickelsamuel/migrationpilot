---
id: MPH-016
title: Long transactions versus DDL
rules: [MP053, MP065, MP013]
pg_versions: "all supported versions (14–18)"
lock_mode: ACCESS EXCLUSIVE
severity: critical
confidence: High
last_verified: 2026-08-11
verified_against: PostgreSQL 17.10
incidents:
  - name: "GoCardless: Zero-downtime Postgres migrations — the hard parts"
    date: "2024-06"
    url: "https://gocardless.com/blog/zero-downtime-postgres-migrations-the-hard-parts"
  - name: "postgres.ai: Zero-downtime Postgres schema migrations need this — lock_timeout and retries"
    date: "2021-09-23"
    url: "https://postgres.ai/blog/20210923-zero-downtime-postgres-schema-migrations-lock-timeout-and-retries"
  - name: "GitLab.com production incident #6198: failing post-deploy-migration is blocking gprd deployments"
    date: "2022-01-20"
    url: "https://gitlab.com/gitlab-com/gl-infra/production/-/issues/6198"
---

# Long transactions versus DDL

[Entry 02](02-lock-timeout-and-the-lock-queue.md) covers the mechanism: a blocked DDL statement
blocks everything behind it. This entry covers the other half of that equation — the thing your
DDL gets blocked *by*, and what you can do about it before the migration runs.

`lock_timeout` protects you from a long transaction. It does not remove the long transaction. If
your analytics job runs for 40 minutes, a `lock_timeout` means your migration simply never lands.

## Affected versions

All supported versions (14–18).

## Mechanism

Any transaction holding *any* lock on a table blocks DDL that needs `ACCESS EXCLUSIVE`, because
`ACCESS EXCLUSIVE` conflicts with every mode including `ACCESS SHARE`. A plain `SELECT` inside an
open transaction is enough. The manual:

> So long as no deadlock situation is detected, a transaction seeking either a table-level or
> row-level lock will wait indefinitely for conflicting locks to be released.

([13.3. Explicit Locking](https://www.postgresql.org/docs/current/explicit-locking.html))

The sources of long-held locks, roughly in order of how often they cause this:

**Idle in transaction.** A connection that ran `BEGIN`, did one query, and then went to do
something in application code — an HTTP call, a slow computation, waiting on a queue — still holds
every lock it acquired. `state = 'idle in transaction'` in `pg_stat_activity`. This is the most
common cause and the most preventable: set `idle_in_transaction_session_timeout`.

**Analytics and reporting queries.** Long `SELECT`s against production tables. They hold
`ACCESS SHARE` for their whole runtime.

**`pg_dump`.** Takes `ACCESS SHARE` on every table it reads, for the duration of the dump. A
nightly backup overlapping a migration window is a classic.

**Autovacuum.** Holds `SHARE UPDATE EXCLUSIVE`. Ordinarily autovacuum yields to a conflicting lock
request — but `autovacuum` running in **wraparound prevention** mode does *not* yield, and will
block your DDL until it completes. Check for `to prevent wraparound` in `pg_stat_activity`.

**Your own migration.** A migration that opens a transaction, does an expensive backfill, and then
runs DDL in the same transaction holds locks across the whole thing. This is
[entry 20](20-multi-statement-ddl-lock-accumulation.md), and it is self-inflicted.

**Explicit `LOCK TABLE`.** Sometimes correct, but it escalates immediately to whatever mode you
name and holds it until commit. Note also that `LOCK TABLE` is only valid inside a transaction
block — the failure mode that broke GitLab's deploy in January 2022.

## Unsafe SQL

```sql
-- Migration holds ACCESS EXCLUSIVE across a slow backfill.
-- The table is offline for the entire UPDATE.
BEGIN;
ALTER TABLE orders ADD COLUMN region text;
UPDATE orders SET region = lookup_region(country_code);   -- minutes, or hours
COMMIT;
```

## Safe SQL

**Before the migration: find out what would block you.**

```sql
-- Anything that would block DDL on this table, right now.
SELECT a.pid,
       a.state,
       now() - a.xact_start AS xact_age,
       now() - a.query_start AS query_age,
       l.mode,
       left(regexp_replace(a.query, '\s+', ' ', 'g'), 80) AS query
FROM pg_stat_activity a
JOIN pg_locks l ON l.pid = a.pid
JOIN pg_class c ON c.oid = l.relation
WHERE c.relname = 'orders'
  AND a.pid <> pg_backend_pid()
ORDER BY a.xact_start;
```

```sql
-- The general "who is holding the database open" query. Run it before every deploy.
SELECT pid, state, now() - xact_start AS xact_age,
       left(regexp_replace(query, '\s+', ' ', 'g'), 60) AS query
FROM pg_stat_activity
WHERE state <> 'idle'
  AND xact_start < now() - interval '1 minute'
ORDER BY xact_start;
```

**Structurally: stop long transactions from existing.**

```sql
-- Cluster-wide, or per-role for the application user.
ALTER SYSTEM SET idle_in_transaction_session_timeout = '60s';
SELECT pg_reload_conf();

-- Better: scope it to the roles that should never hold a transaction open.
ALTER ROLE app_user SET idle_in_transaction_session_timeout = '30s';
ALTER ROLE app_user SET statement_timeout = '30s';

-- And give the migration role different, deliberate values.
ALTER ROLE migrator SET lock_timeout = '2s';
ALTER ROLE migrator SET statement_timeout = '0';   -- long DDL is allowed to run
ALTER ROLE migrator SET idle_in_transaction_session_timeout = '60s';
```

Setting these per-role rather than globally is the important detail: the application should be
killed for holding a transaction open, while the migration is allowed to take its time *once it
has the lock*. Those are opposite policies and a single global setting cannot express both.

**In the migration: keep the lock and the work apart.**

```sql
-- 1. DDL only. Brief lock.
SET lock_timeout = '2s';
ALTER TABLE orders ADD COLUMN region text;

-- 2. Backfill outside the DDL transaction, in batches (entry 18).
--    Each batch is its own short transaction.
```

**As a last resort, clear the blocker deliberately** — knowing exactly what you are cancelling:

```sql
-- Cancel (polite; lets the query clean up).
SELECT pg_cancel_backend(pid) FROM pg_stat_activity
WHERE state = 'idle in transaction' AND xact_start < now() - interval '10 minutes';

-- Terminate (rude; use only if cancel does not work).
-- SELECT pg_terminate_backend(pid) FROM ...
```

Do not automate this against arbitrary PIDs. Cancelling somebody's four-hour reporting query to
land a migration is a decision, not a script.

## Reproducible lab

Shows an idle-in-transaction session — one that is running no query at all — blocking DDL.

```bash
docker run --rm -d --name mp-lab -e POSTGRES_PASSWORD=lab -p 55432:5432 postgres:17
until docker exec mp-lab pg_isready -U postgres -q; do sleep 1; done
q() { docker exec -i mp-lab psql -U postgres -X -q "$@"; }

q -c "CREATE TABLE orders AS SELECT g AS id FROM generate_series(1,1000) g;"

# A session that reads once, then sits idle *inside* a transaction.
docker exec -i mp-lab psql -U postgres -X -q \
  -c "BEGIN; SELECT count(*) FROM orders; SELECT pg_sleep(45); COMMIT;" >/dev/null 2>&1 &
sleep 3

echo "--- what is holding a lock on orders ---"
q -c "SELECT a.pid, a.state, now() - a.xact_start AS xact_age, l.mode
      FROM pg_stat_activity a
      JOIN pg_locks l ON l.pid = a.pid
      JOIN pg_class c ON c.oid = l.relation
      WHERE c.relname = 'orders' AND a.pid <> pg_backend_pid();"

echo "--- DDL with a 2s lock_timeout ---"
q -c "SET lock_timeout='2s'; ALTER TABLE orders ADD COLUMN region text;" 2>&1 | tail -2

echo "--- same DDL after clearing the blocker ---"
q -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity
      WHERE state LIKE 'idle in transaction%' OR query LIKE '%pg_sleep%';" >/dev/null
sleep 1
q -c "SET lock_timeout='2s'; ALTER TABLE orders ADD COLUMN region text;" 2>&1 | tail -1

docker rm -f mp-lab
```

Expected: the lock query shows the blocking session holding `AccessShareLock`; the first
`ALTER TABLE` fails with `ERROR: canceling statement due to lock timeout`; after terminating the
blocker the identical statement succeeds immediately. The `ALTER TABLE` was never slow — it was
never able to start.

This is the same setup as [entry 02](02-lock-timeout-and-the-lock-queue.md)'s lab, which has
verified `pg_locks` output showing the resulting queue.

## Public incidents

**GoCardless — Zero-downtime Postgres migrations: the hard parts** (page last edited 2024-06).
Recommends splitting migrations specifically to shorten lock hold time — their guidance is that
splitting schema changes up "keeps transactions around DDL shorter so locks aren't held as long".
Also the source of the 15-second API outage described in
[entry 02](02-lock-timeout-and-the-lock-queue.md).
<https://gocardless.com/blog/zero-downtime-postgres-migrations-the-hard-parts>

**postgres.ai — lock_timeout and retries** (2021-09-23, Nikolay Samokhvalov). Works through the
"locking tree" that forms when DDL waits behind an existing transaction, and pairs a low
`lock_timeout` (`50ms`) with retries so the migration eventually finds a gap. Presents lab
scenarios rather than a specific production incident; the author notes hitting this personally
after "more than 10 (!) years of Postgres experience."
<https://postgres.ai/blog/20210923-zero-downtime-postgres-schema-migrations-lock-timeout-and-retries>

**GitLab.com production incident #6198** (2022-01-20). Post-deploy migration
`20220110224913_remove_dast_scanner_profiles_builds_ci_build_id_fk` against one of GitLab's
busiest tables, failing with `LOCK TABLE can only be used in transaction blocks` after three
retries; deploys blocked ~4 hours until the migration was manually marked complete and deferred to
a low-traffic window. Deferring to low traffic *is* the mitigation this entry describes — fewer
concurrent transactions means a shorter wait for the lock.
<https://gitlab.com/gitlab-com/gl-infra/production/-/issues/6198>

## How MigrationPilot catches it

- **MP053** (`ban-uncommitted-transaction`, critical) — flags migrations that leave a transaction
  open, the self-inflicted version of this problem.
- **MP065** (`ban-lock-table`, critical) — flags explicit `LOCK TABLE`, which escalates immediately
  and holds until commit.
- **MP013** (`high-traffic-table-ddl`) — flags DDL against tables identified as high-traffic, where
  a free moment to acquire the lock is rarest.

## Confidence

**High** — mechanism documented in the manual and reproduced in entry 02's captured lab output,
three named public sources with dates including one dated production incident.

Last verified 2026-08-11 against PostgreSQL 17.10.
