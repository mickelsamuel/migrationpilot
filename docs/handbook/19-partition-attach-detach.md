---
id: MPH-019
title: Partition ATTACH and DETACH
rules: [MP046, MP072, MP049]
pg_versions: "ATTACH lock reduced in 12; DETACH CONCURRENTLY added in 14; applies to 14–18"
lock_mode: "ACCESS EXCLUSIVE / SHARE UPDATE EXCLUSIVE"
severity: critical
confidence: High
last_verified: 2026-08-11
verified_against: PostgreSQL 17.10
incidents:
  - name: "Kyle Hailey: Postgres Partition Pains — LockManager Waits"
    date: "2023-06-13"
    url: "https://www.kylehailey.com/post/postgres-partition-pains-lockmanager-waits"
  - name: "GitLab issue #538988: Partition manager lock contention"
    date: "2025-05-02"
    url: "https://gitlab.com/gitlab-org/gitlab/-/issues/538988"
  - name: "GitLab.com production incident #21712: Deadlock error while executing post deploy migration"
    date: "2026-04-06"
    url: "https://gitlab.com/gitlab-com/gl-infra/production/-/work_items/21712"
---

# Partition ATTACH and DETACH

Partition maintenance is usually automated — a nightly job adding tomorrow's partition and
dropping last month's — which means it runs unattended, against a busy table, at whatever hour you
picked. The locks involved have changed twice in recent major versions, so what is safe depends
sharply on which PostgreSQL you run.

There is also a second, less obvious failure here: partitioning multiplies the *number* of locks
each query takes, and that has its own ceiling.

## Affected versions

Two changes matter, and both are in every supported version:

**PostgreSQL 12** reduced the `ATTACH PARTITION` lock
([PG 12 release notes](https://www.postgresql.org/docs/release/12.0/)):

> `ALTER TABLE ATTACH PARTITION` is now performed with reduced locking requirements (Robert Haas)

**PostgreSQL 14** added concurrent detach
([PG 14 release notes](https://www.postgresql.org/docs/release/14.0/)):

> Allow partitions to be detached in a non-blocking manner (Álvaro Herrera)
> The syntax is `ALTER TABLE ... DETACH PARTITION ... CONCURRENTLY`, and `FINALIZE`.

Before 14, detaching took `ACCESS EXCLUSIVE` on the parent — which blocks reads and writes across
**every** partition, not just the one being detached. On 14–18 you have a better option and should
use it.

## Mechanism

### ATTACH

From the [ALTER TABLE manual](https://www.postgresql.org/docs/current/sql-altertable.html):

> Attaching a partition acquires a `SHARE UPDATE EXCLUSIVE` lock on the parent table, in addition
> to the `ACCESS EXCLUSIVE` locks on the table being attached and on the default partition (if
> any).

The parent gets the weak lock — good. But note the two `ACCESS EXCLUSIVE` locks: on the table being
attached, and **on the default partition**. If you have a `DEFAULT` partition, every `ATTACH`
locks it exclusively, because PostgreSQL must scan it to prove no row belongs in the new partition.
On a large default partition that scan is slow and blocking. This is MP072's territory, and the
practical advice is: either do not have a default partition, or keep it empty.

`ATTACH` also validates that existing rows in the attached table match the partition bound. You can
skip that scan the same way as anywhere else — add a `CHECK` constraint matching the bound and
`VALIDATE` it first, and `ATTACH` will trust it.

### DETACH

Plain `DETACH PARTITION` takes `ACCESS EXCLUSIVE` on the parent, blocking all access to the entire
partitioned table. `DETACH PARTITION ... CONCURRENTLY` splits the work:

> In this mode, two transactions are used internally. During the first transaction, a
> `SHARE UPDATE EXCLUSIVE` lock is taken on both parent table and partition ... Once all those
> transactions have completed, the second transaction acquires `SHARE UPDATE EXCLUSIVE` on the
> partitioned table and `ACCESS EXCLUSIVE` on the partition.

The parent never takes `ACCESS EXCLUSIVE`. The partition being removed does, briefly, at the end —
acceptable, since you are detaching it. `CONCURRENTLY` cannot run inside a transaction block
([entry 11](11-concurrently-inside-transaction.md)), and if it is interrupted it leaves the
partition in a transitional state that you resolve with `FINALIZE`.

### The lock-count problem

Separate from lock *modes*: every query touching a partitioned table acquires a lock on each
partition it might need, plus each of that partition's indexes. Partition counts multiply. Kyle
Hailey's 2023 write-up measured a system where "40 partitions × 22 indexes each" meant
"880 locks per query" — and PostgreSQL's per-backend fast-path lock cache is small, so beyond it
lock acquisition moves to the shared lock manager and contends. The symptom is `LockManager` wait
events and a throughput collapse that looks nothing like a blocked DDL statement.

Partition pruning helps only if it happens at plan time; run-time pruning still locks the
partitions it might need.

## Unsafe SQL

```sql
-- ACCESS EXCLUSIVE on the parent: blocks reads and writes on EVERY partition.
ALTER TABLE events DETACH PARTITION events_2025_01;

-- Scans the new partition to validate the bound, holding ACCESS EXCLUSIVE on it,
-- and on the default partition too.
ALTER TABLE events ATTACH PARTITION events_2026_09
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
```

## Safe SQL

**Detaching, on PostgreSQL 14+:**

```sql
-- Not inside a transaction block.
SET lock_timeout = '5s';
ALTER TABLE events DETACH PARTITION events_2025_01 CONCURRENTLY;

-- If it was interrupted, complete it:
-- ALTER TABLE events DETACH PARTITION events_2025_01 FINALIZE;

-- Only now is it an independent table, safe to archive or drop.
```

**Attaching, without the validation scan:**

```sql
-- 1. Build the new partition as a standalone table.
CREATE TABLE events_2026_09 (LIKE events INCLUDING ALL);

-- 2. Prove its contents match the future bound, before attaching.
ALTER TABLE events_2026_09
  ADD CONSTRAINT events_2026_09_bound
  CHECK (created_at >= '2026-09-01' AND created_at < '2026-10-01') NOT VALID;
ALTER TABLE events_2026_09 VALIDATE CONSTRAINT events_2026_09_bound;

-- 3. Attach. The valid CHECK lets PostgreSQL skip its own scan.
SET lock_timeout = '5s';
ALTER TABLE events ATTACH PARTITION events_2026_09
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');

-- 4. The CHECK is now redundant with the partition bound.
ALTER TABLE events_2026_09 DROP CONSTRAINT events_2026_09_bound;
```

**Structurally:**

- Create partitions well ahead of time, in a quiet window, not at the moment rows need them.
- Avoid a `DEFAULT` partition, or keep it empty — it is locked and scanned on every `ATTACH`.
- Keep the partition count as low as the retention policy allows. Daily partitions with a
  multi-year retention is how you get to thousands of partitions and lock-manager contention.
- Include the partition key in the primary key; PostgreSQL requires it, and MP049 catches the
  omission at design time rather than at `CREATE TABLE` failure time.

## Reproducible lab

```bash
docker run --rm -d --name mp-lab -e POSTGRES_PASSWORD=lab -p 55432:5432 postgres:17
until docker exec mp-lab pg_isready -U postgres -q; do sleep 1; done
q() { docker exec -i mp-lab psql -U postgres -X "$@"; }

q -q -c "
CREATE TABLE events (id bigint, created_at date) PARTITION BY RANGE (created_at);
CREATE TABLE events_2026_07 PARTITION OF events
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE events_2026_08 PARTITION OF events
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
INSERT INTO events SELECT g, '2026-07-15'::date FROM generate_series(1,100000) g;"

echo '--- plain DETACH: what does it lock, and on what? ---'
q -c "BEGIN;
      ALTER TABLE events DETACH PARTITION events_2026_07;
      SELECT c.relname, l.mode FROM pg_locks l
      JOIN pg_class c ON c.oid = l.relation
      WHERE c.relname IN ('events','events_2026_07','events_2026_08')
      ORDER BY c.relname;
      ROLLBACK;"

echo '--- CONCURRENTLY cannot run in a transaction ---'
q -c "BEGIN; ALTER TABLE events DETACH PARTITION events_2026_07 CONCURRENTLY; COMMIT;"

echo '--- CONCURRENTLY outside a transaction works ---'
q -c "ALTER TABLE events DETACH PARTITION events_2026_07 CONCURRENTLY;"

docker rm -f mp-lab
```

Verified output on PostgreSQL 17.10:

```
--- plain DETACH: what does it lock, and on what? ---
    relname     |        mode
----------------+---------------------
 events         | AccessExclusiveLock     <- the PARENT
 events_2026_07 | AccessExclusiveLock

--- CONCURRENTLY cannot run in a transaction ---
ERROR:  ALTER TABLE ... DETACH CONCURRENTLY cannot run inside a transaction block

--- CONCURRENTLY outside a transaction works ---
ALTER TABLE
```

The first line is the one that matters. `AccessExclusiveLock` on `events` — the parent — means
every query against `events_2026_08`, and every other partition, is blocked for the duration.
Detaching January's partition takes August's offline. That is the behaviour
`DETACH ... CONCURRENTLY` exists to remove.

To see the lock-count effect from Kyle Hailey's incident, create 40 partitions with several indexes
each and inspect `SELECT count(*) FROM pg_locks WHERE pid = ...` during a query spanning them.

## Public incidents

**Kyle Hailey — Postgres Partition Pains: LockManager Waits** (2023-06-13). A high-volume system —
"10,000 queries per second, and 10 million new records daily" — converted an orders table to daily
partitions on 2023-04-01. Lock manager waits began around April 11 and by May 6 the system was at:

> 1000 Fetch errors a second, 500 sessions waiting on LockManager, 150,000 locks

The cause was lock *count*, not lock mode: 40 partitions with 22 indexes each meant "880 locks per
query" even when the query targeted a narrow range. Mitigated by detaching 7 partitions, then
rebuilt as weekly rather than daily partitions.
<https://www.kylehailey.com/post/postgres-partition-pains-lockmanager-waits>

**GitLab issue #538988 — "Reduce database lock acquired by the partition manager"** (opened 2025-05-02, now closed). Documents that both
`CREATE TABLE ... PARTITION OF` and `ALTER TABLE ... DETACH PARTITION` "take a short-duration
`ACCESS EXCLUSIVE` lock on the table", and that even with lock retries, "for extremely high traffic
tables this can still cause lock contention". GitLab's proposed remedy is to move to the concurrent
forms.

One correction worth stating, since this handbook's standard is to check claims rather than repeat
them: the issue describes the concurrent path as taking a lock that "blocks writes, but not reads".
Per [13.3. Explicit Locking](https://www.postgresql.org/docs/current/explicit-locking.html),
`SHARE UPDATE EXCLUSIVE` does **not** conflict with `ROW EXCLUSIVE`, so it does not block ordinary
writes either. The direction of their conclusion is right; that specific characterisation is not.
<https://gitlab.com/gitlab-org/gitlab/-/issues/538988>

**GitLab.com production incident #21712** (2026-04-06). A post-deploy migration adding a foreign
key to a partitioned CI table deadlocked against application queries under high traffic. Partitioned
tables make this more likely, because a single statement takes locks on many relations and the
ordering against application queries is harder to control. See also
[entry 08](08-foreign-key-without-not-valid.md).
<https://gitlab.com/gitlab-com/gl-infra/production/-/work_items/21712>

## How MigrationPilot catches it

- **MP046** (`require-concurrent-detach-partition`, critical) — "DETACH PARTITION without
  CONCURRENTLY takes ACCESS EXCLUSIVE lock on the parent, blocking all queries. Use CONCURRENTLY on
  PG 14+."
- **MP072** (`warn-partition-default-scan`) — flags the default-partition scan that `ATTACH`
  triggers.
- **MP049** (`require-partition-key-in-pk`, critical) — catches the primary key/partition key
  mismatch at design time.

## Confidence

**High** — lock modes quoted from the manual, version changes pinned to release notes, lab shows
the parent-table lock and the transaction restriction, three named public sources with dates
including two GitLab artifacts and one detailed production incident.

Last verified 2026-08-11 against PostgreSQL 17.10.
