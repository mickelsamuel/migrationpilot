---
id: MPH-020
title: Multi-statement DDL and lock accumulation
rules: [MP008, MP058, MP014]
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
  - name: "GitLab.com production incident #6642: Post Deploy migrations Failure on Auto-Deploy"
    date: "2022-03-18"
    url: "https://gitlab.com/gitlab-com/gl-infra/production/-/issues/6642"
---

# Multi-statement DDL and lock accumulation

Locks in PostgreSQL are held until the end of the transaction, never released early. A migration
that alters four tables in one transaction holds `ACCESS EXCLUSIVE` on the first table from the
moment it touches it until the final `COMMIT` — including while it waits for locks on the other
three.

This turns four independently-safe statements into one compound outage, and it creates deadlocks
that no individual statement could have caused.

## Affected versions

All supported versions (14–18). This is transaction semantics, not a version-specific behaviour.

## Mechanism

**Locks accumulate and are held to commit.** There is no early release. So for:

```sql
BEGIN;
ALTER TABLE users ...;      -- takes ACCESS EXCLUSIVE on users
ALTER TABLE orders ...;     -- takes ACCESS EXCLUSIVE on orders; users still locked
ALTER TABLE payments ...;   -- takes ACCESS EXCLUSIVE on payments; both still locked
COMMIT;                     -- all three released, finally
```

the window during which `users` is unavailable is not the duration of its own `ALTER TABLE`. It is
the duration of *the whole migration*. If statement three has to wait 30 seconds for its lock, then
`users` — which was altered instantly — is offline for those 30 seconds too. And because a waiting
`ACCESS EXCLUSIVE` request queues everything behind it
([entry 02](02-lock-timeout-and-the-lock-queue.md)), all three tables are dark.

**Deadlock risk scales with the number of tables.** Two transactions taking locks on the same
tables in different orders deadlock. Your migration takes locks in the order you wrote the
statements; your application takes them in whatever order its queries run. With one table there is
nothing to deadlock over. With four, there are plenty of orderings, and PostgreSQL resolves the
tie by killing somebody — sometimes the migration, sometimes a user request.

**Multiple `ALTER TABLE` statements against the same table are wasteful too.** Each is a separate
lock acquisition and, if the change rewrites, a separate rewrite. PostgreSQL lets you combine
subcommands into one statement, which does one pass:

```sql
-- Three lock acquisitions, potentially three rewrites
ALTER TABLE t ADD COLUMN a int;
ALTER TABLE t ADD COLUMN b int;
ALTER TABLE t ADD COLUMN c int;

-- One
ALTER TABLE t ADD COLUMN a int, ADD COLUMN b int, ADD COLUMN c int;
```

Note the tension with the previous point, and resolve it this way: **combine subcommands against
one table; separate migrations across different tables.** Same table, one statement. Different
tables, different migrations.

**The lock ordering that helps.** When you genuinely must touch several tables in one transaction,
take the locks in a deterministic order — the same order your application does, or simply
alphabetical, applied consistently everywhere. Explicitly locking up front, in a fixed order, is
sometimes worth it:

```sql
BEGIN;
LOCK TABLE orders, payments, users IN ACCESS EXCLUSIVE MODE;   -- fixed order
...
COMMIT;
```

That converts a deadlock into a wait, which `lock_timeout` can then bound. It also makes the
outage window explicit rather than emergent. (`LOCK TABLE` only works inside a transaction block —
see [entry 11](11-concurrently-inside-transaction.md).)

## Unsafe SQL

```sql
-- users is locked from the first statement until COMMIT, including
-- however long the payments lock takes to acquire.
BEGIN;
ALTER TABLE users ADD COLUMN last_seen_at timestamptz;
ALTER TABLE orders ADD COLUMN channel text;
ALTER TABLE payments ADD COLUMN processor text;
CREATE INDEX idx_orders_channel ON orders (channel);   -- also blocks writes, entry 01
COMMIT;
```

## Safe SQL

One table per migration, one concern per migration:

```sql
-- Migration 1
SET lock_timeout = '2s';
ALTER TABLE users ADD COLUMN last_seen_at timestamptz;
```

```sql
-- Migration 2 — subcommands combined, since it is the same table
SET lock_timeout = '2s';
ALTER TABLE orders ADD COLUMN channel text, ADD COLUMN source text;
```

```sql
-- Migration 3
SET lock_timeout = '2s';
ALTER TABLE payments ADD COLUMN processor text;
```

```sql
-- Migration 4 — CONCURRENTLY, so no transaction, and nothing else in it (entry 11)
SET lock_timeout = '5s';
DROP INDEX CONCURRENTLY IF EXISTS idx_orders_channel;
CREATE INDEX CONCURRENTLY idx_orders_channel ON orders (channel);
```

Four migrations instead of one. Each acquires one lock, holds it briefly, and fails independently.
If migration 3 cannot get its lock, migrations 1 and 2 have already landed and only 3 needs a
retry — instead of the entire change set rolling back and the whole deploy stalling.

GoCardless make the same argument from operational experience: splitting schema changes up makes
problems easier to diagnose, and keeps the transactions around DDL shorter so locks are not held as
long.

## Reproducible lab

Shows locks accumulating across statements and being held until commit.

```bash
docker run --rm -d --name mp-lab -e POSTGRES_PASSWORD=lab -p 55432:5432 postgres:17
until docker exec mp-lab pg_isready -U postgres -q; do sleep 1; done
q() { docker exec -i mp-lab psql -U postgres -X "$@"; }

q -q -c "CREATE TABLE users(id int); CREATE TABLE orders(id int); CREATE TABLE payments(id int);"

echo '--- locks held partway through a multi-table transaction ---'
q -c "BEGIN;
      ALTER TABLE users ADD COLUMN a int;
      ALTER TABLE orders ADD COLUMN b int;
      ALTER TABLE payments ADD COLUMN c int;
      SELECT c.relname, l.mode, l.granted
      FROM pg_locks l JOIN pg_class c ON c.oid = l.relation
      WHERE c.relname IN ('users','orders','payments')
      ORDER BY c.relname;
      ROLLBACK;"
```

Now the part that matters — the first table stays locked while the third one waits:

```bash
# Hold payments open from another session so the migration blocks on it.
docker exec -i mp-lab psql -U postgres -X -q \
  -c "BEGIN; SELECT count(*) FROM payments; SELECT pg_sleep(30); COMMIT;" >/dev/null 2>&1 &
sleep 2

# The migration: alters users first, then blocks trying to reach payments.
docker exec -i mp-lab psql -U postgres -X -q -c "
  BEGIN;
  ALTER TABLE users ADD COLUMN x int;
  ALTER TABLE payments ADD COLUMN y int;
  COMMIT;" >/dev/null 2>&1 &
sleep 3

# Is users — long since altered — still unavailable?
docker exec -i mp-lab psql -U postgres -X -q -c \
  "SET lock_timeout='2s'; SELECT count(*) FROM users;" 2>&1 | tail -2

docker rm -f mp-lab
```

Verified output on PostgreSQL 17.10.

Locks accumulated inside one open transaction:

```
  relname   |        mode         | granted
------------+---------------------+---------
 orders_m   | AccessExclusiveLock | t
 payments_m | AccessExclusiveLock | t
 users_m    | AccessExclusiveLock | t
```

Three tables, all exclusively locked at once, none released until commit.

And the consequence, with a reader holding `payments_m`:

```
--- users_m was altered seconds ago; is it readable? ---
SET
ERROR:  canceling statement due to lock timeout
LINE 1: SELECT count(*) FROM users_m;
                             ^
```

`users_m` is a table whose `ALTER TABLE` completed instantly, seconds ago. It is unreadable
because the transaction that altered it is still sitting there waiting for a lock on
`payments_m` — a table the query never mentions.

That is the entry in one observation: **the blast radius of a multi-table migration is the union of
its tables, for the duration of its slowest lock acquisition.**

## Public incidents

**GitLab.com production incident #6642** (2022-03-18). The incident description names the shape
directly:

> A database migration which requires an exclusive lock on **two tables** is unable to complete.
> This is blocking auto-deploy from completing.

87 minutes of blocked deployments (18:36–20:13 UTC), resolved by manually marking the migration
applied. A migration needing locks on two tables is materially harder to land than two migrations
needing one lock each.
<https://gitlab.com/gitlab-com/gl-infra/production/-/issues/6642>

**GoCardless — Zero-downtime Postgres migrations: the hard parts** (page last edited 2024-06).
Recommends splitting schema changes specifically to shorten how long locks are held around DDL, and
is the source of the 15-second API outage cited in
[entry 02](02-lock-timeout-and-the-lock-queue.md).
<https://gocardless.com/blog/zero-downtime-postgres-migrations-the-hard-parts>

## How MigrationPilot catches it

- **MP008** (`no-multi-ddl-transaction`, critical) — flags migrations bundling multiple DDL
  statements into one transaction.
- **MP058** (`multi-alter-table-same-table`) — flags repeated `ALTER TABLE` against the same table,
  which should be combined into one statement rather than separated. It only fires where the merge
  is free: a `NOT VALID` constraint and its `VALIDATE` (MPH-004), or a `SET NOT NULL` and the
  `CHECK` proving it (MPH-003), are split on purpose, and combining them puts a table scan back
  under `ACCESS EXCLUSIVE`.
- **MP014** (`large-table-ddl`) — flags DDL against tables large enough that the lock hold time is
  the dominant risk.

## Confidence

**High** — mechanism is transaction semantics, lab demonstrates accumulated locks and the
cross-table unavailability, two named public sources with dates including one dated production
incident that names the two-table shape.

Last verified 2026-08-11 against PostgreSQL 17.10.
