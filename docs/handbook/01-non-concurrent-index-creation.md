---
id: MPH-001
title: Non-concurrent index creation
rules: [MP001, MP042]
pg_versions: "8.2 and later; applies to all supported versions (14–18)"
lock_mode: SHARE
severity: critical
confidence: High
last_verified: 2026-08-11
verified_against: PostgreSQL 17.10
incidents:
  - name: "carwow: Problems with concurrent Postgres indexes (and how to solve them)"
    date: "2016-08-22"
    url: "https://medium.com/carwow-product-engineering/problems-with-concurrent-postgres-indexes-and-how-to-solve-them-c57f7656c852"
  - name: "Braintree/PayPal: PostgreSQL at Scale — Database Schema Changes Without Downtime"
    date: "2019-02-01"
    url: "https://medium.com/paypal-tech/postgresql-at-scale-database-schema-changes-without-downtime-20d3749ed680"
---

# Non-concurrent index creation

`CREATE INDEX` blocks every write to the table until it finishes. On a large table that is
minutes, and your application spends those minutes returning errors on anything that writes.

The detail most write-ups get wrong: it does **not** block reads. `CREATE INDEX` takes `SHARE`,
not `ACCESS EXCLUSIVE`. Knowing which one matters, because it changes what your incident looks
like — `SELECT`s keep working, so dashboards look healthy while every checkout fails.

## Affected versions

All supported versions (14, 15, 16, 17, 18) and every version back to 8.2, when
`CREATE INDEX CONCURRENTLY` was introduced. The lock level has not changed.

PostgreSQL 14 improved one related behaviour: index commands using `CONCURRENTLY` no longer wait
for other `CONCURRENTLY` operations to finish
([PG 14 release notes](https://www.postgresql.org/docs/release/14.0/) — "Allow index commands
using `CONCURRENTLY` to avoid waiting for the completion of other operations using
`CONCURRENTLY`"). That makes the safe path cheaper on 14+, but does not change the unsafe path.

## Mechanism

Per [13.3. Explicit Locking](https://www.postgresql.org/docs/current/explicit-locking.html),
`CREATE INDEX` (without `CONCURRENTLY`) acquires a **`SHARE`** lock. `SHARE` conflicts with:

> `ROW EXCLUSIVE`, `SHARE UPDATE EXCLUSIVE`, `SHARE ROW EXCLUSIVE`, `EXCLUSIVE`, and `ACCESS EXCLUSIVE`

`ROW EXCLUSIVE` is the lock taken by `INSERT`, `UPDATE`, `DELETE`, and `MERGE`. So:

| Statement | Lock it wants | Blocked by `CREATE INDEX`? |
|---|---|---|
| `SELECT` | `ACCESS SHARE` | No |
| `INSERT` / `UPDATE` / `DELETE` / `MERGE` | `ROW EXCLUSIVE` | **Yes** |
| Another `CREATE INDEX` | `SHARE` | No (`SHARE` is not self-conflicting) |

The lock is held for the entire build — one full scan of the table plus the sort and write of the
index. That is a function of table size, not of how many rows match.

[`CREATE INDEX CONCURRENTLY`](https://www.postgresql.org/docs/current/sql-createindex.html#SQL-CREATEINDEX-CONCURRENTLY)
takes `SHARE UPDATE EXCLUSIVE` instead, which does not conflict with `ROW EXCLUSIVE`. Writes
continue. The cost is that it does two table scans instead of one, must wait for existing
transactions to finish, and cannot run inside a transaction block (see
[entry 11](11-concurrently-inside-transaction.md)). It can also fail and leave an invalid index
behind (see [entry 12](12-invalid-index-after-failed-concurrently.md)).

There is a second trap worth naming: `CREATE INDEX` on a table that already has a long-running
query against it will **wait**, and while it waits it blocks writes that arrive after it. That is
the lock queue described in [entry 02](02-lock-timeout-and-the-lock-queue.md), and it is why this
entry's safe SQL sets `lock_timeout` even though `CONCURRENTLY` takes a weak lock.

## Unsafe SQL

```sql
-- Blocks every INSERT/UPDATE/DELETE on orders for the full duration of the build.
CREATE INDEX idx_orders_customer_id ON orders (customer_id);
```

## Safe SQL

```sql
-- Must NOT be inside a transaction block. Most migration frameworks wrap migrations in
-- one by default; disable it for this migration.
SET lock_timeout = '5s';

CREATE INDEX CONCURRENTLY idx_orders_customer_id ON orders (customer_id);

-- Always verify. CONCURRENTLY can fail and leave an unusable index behind.
SELECT c.relname, i.indisvalid
FROM pg_index i
JOIN pg_class c ON c.oid = i.indexrelid
WHERE c.relname = 'idx_orders_customer_id';
-- indisvalid must be true. If it is false, see entry 12.
```

Always name the index explicitly. An auto-generated name makes the retry path in
[entry 12](12-invalid-index-after-failed-concurrently.md) guesswork.

## Reproducible lab

A note on method. The obvious lab — start a real `CREATE INDEX` on a big table and watch a write
block — is timing-dependent, and on modern hardware it is unreliable: on the machine used to
verify this entry, PostgreSQL 17.10 indexed 3,000,000 rows in **1.4 seconds** even with
`maintenance_work_mem = '1MB'` and parallelism disabled. The build finishes before you can sample
`pg_locks`. So the lab below holds the *same lock mode* `CREATE INDEX` acquires, explicitly and
deterministically, and part B shows how to scale the real thing up if you want to watch it.

### Part A — the lock conflict, deterministically

```bash
docker run --rm -d --name mp-lab -e POSTGRES_PASSWORD=lab -p 55432:5432 postgres:17
until docker exec mp-lab pg_isready -U postgres -q; do sleep 1; done
q() { docker exec -i mp-lab psql -U postgres -X -q "$@"; }

q -c "CREATE TABLE orders AS
      SELECT g AS id, (random()*1e6)::int AS customer_id, repeat('x',200) AS pad
      FROM generate_series(1,100000) g;"

# Session A: hold exactly the lock CREATE INDEX takes, for 30s.
docker exec -i mp-lab psql -U postgres -X -q \
  -c "BEGIN; LOCK TABLE orders IN SHARE MODE; SELECT pg_sleep(30); COMMIT;" >/dev/null 2>&1 &
sleep 2

# Session B: a write. Should block.
docker exec -i mp-lab psql -U postgres -X -q \
  -c "INSERT INTO orders VALUES (999999999, 1, 'blocked?');" >/dev/null 2>&1 &

# Session C: a read. Should NOT block.
docker exec -i mp-lab psql -U postgres -X -q \
  -c "SELECT count(*) FROM orders WHERE id < 100;" >/dev/null 2>&1 &
sleep 3

q -c "SELECT l.pid, l.mode, l.granted,
             left(regexp_replace(a.query,'\s+',' ','g'),40) AS query
      FROM pg_locks l
      JOIN pg_class c ON c.oid = l.relation
      JOIN pg_stat_activity a ON a.pid = l.pid
      WHERE c.relname = 'orders'
      ORDER BY l.granted DESC;"

docker rm -f mp-lab
```

Verified output on PostgreSQL 17.10:

```
 pid |       mode       | granted |                  query
-----+------------------+---------+------------------------------------------
 255 | ShareLock        | t       | BEGIN; LOCK TABLE orders IN SHARE MODE;
 269 | RowExclusiveLock | f       | INSERT INTO orders VALUES (999999999,1,'
```

Two things to read here. The `INSERT` is waiting — `granted = f` — which is the outage. And the
`SELECT` from session C does not appear in the output **at all**, because it acquired its
`ACCESS SHARE` lock, ran, and exited while the `SHARE` lock was still held. Reads are genuinely
unaffected. That asymmetry is the point of this entry.

### Part B — the real thing

To watch an actual `CREATE INDEX` hold the lock, you need a build long enough to sample. Scale the
row count until it takes ~30 seconds on your hardware (start at 30,000,000 and adjust), then swap
session A for:

```bash
docker exec -i mp-lab psql -U postgres -X -q \
  -c "SET maintenance_work_mem='1MB'; SET max_parallel_maintenance_workers=0;
      CREATE INDEX idx_orders_customer_id ON orders (customer_id);" &
```

The lock rows are identical, except `mode` is held by the `CREATE INDEX` backend. Re-run with
`CREATE INDEX CONCURRENTLY` and the `INSERT` is granted immediately, because
`SHARE UPDATE EXCLUSIVE` does not conflict with `ROW EXCLUSIVE`.

## Public incidents

**carwow — Problems with concurrent Postgres indexes (and how to solve them)** (2016-08-22,
Ken Alex Fassone). Primarily an account of `CONCURRENTLY` failing and leaving an invalid index,
but it documents why they moved to `CONCURRENTLY` in the first place, and states the trade-off
they accepted: they explicitly advise against `REINDEX` as a repair because it "locks the table
for writes while the index is being created."
<https://medium.com/carwow-product-engineering/problems-with-concurrent-postgres-indexes-and-how-to-solve-them-c57f7656c852>

**Braintree/PayPal — PostgreSQL at Scale** (2019-02-01, James Coleman). Braintree's published
operating rules for DDL on a payments system with no scheduled downtime. Notes that
`CREATE INDEX CONCURRENTLY` "may not be executed inside of a transaction but does maintain
transactions internally", which is the constraint that makes this migration awkward to express in
most frameworks.
<https://medium.com/paypal-tech/postgresql-at-scale-database-schema-changes-without-downtime-20d3749ed680>

## How MigrationPilot catches it

- **MP001** (`require-concurrent-index-creation`, critical) — flags `CREATE INDEX` without
  `CONCURRENTLY` and rewrites the statement in its suggested fix, including a note that
  `CONCURRENTLY` cannot run inside a transaction block.
- **MP042** (`require-index-name`) — flags indexes created without an explicit name, which is what
  makes a failed `CONCURRENTLY` build hard to clean up.

## Confidence

**High** — mechanism documented in the manual, lab reproduces the block, two named public sources
with dates.

Last verified 2026-08-11 against PostgreSQL 17.10.
