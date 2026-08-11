---
id: MPH-018
title: Unbatched backfills
rules: [MP011, MP067, MP080]
pg_versions: "all supported versions (14–18)"
lock_mode: ROW EXCLUSIVE
severity: warning
confidence: High
last_verified: 2026-08-11
verified_against: PostgreSQL 17.10
incidents:
  - name: "DoorDash: Hot Swapping Production Tables for Safe Database Backfills"
    date: "2020-10-21"
    url: "https://careersatdoordash.com/blog/hot-swapping-production-data-tables/"
---

# Unbatched backfills

A single `UPDATE` over a whole table does not take a scary lock — `ROW EXCLUSIVE` does not block
readers. It takes down production a different way: it holds one enormous transaction open, writes
a new copy of every row, generates WAL proportional to the table plus its indexes, and pushes
replicas behind.

This is the one entry here where the danger is not a lock mode. It is throughput.

## Affected versions

All supported versions (14–18). This is MVCC behaviour, not a version-specific bug.

## Mechanism

**Every updated row is a new row.** PostgreSQL's MVCC never edits in place; an `UPDATE` writes a
new tuple and marks the old one dead. DoorDash's framing is the clearest published statement of
the cost:

> Updating a column on a billion rows in Postgres is equivalent to deleting a billion rows and
> inserting a billion rows, thanks to the way Multiversion Concurrency Control (MVCC) works under
> the covers.

Consequences, in order of what usually bites first:

**Replica lag.** Every one of those writes becomes WAL, and replicas must replay it. DoorDash
measured their normal Aurora replica lag at under 100 ms and found that an unthrottled backfill
made it trivially easy to exceed 10 seconds — at which point read traffic served by replicas is
returning stale data or timing out. Your write did not block anything; your reads broke anyway.

**Bloat, then a vacuum storm.** The dead tuples are not reclaimed until `VACUUM` runs. A backfill
that doubles the table's physical size leaves autovacuum a large job, which then competes for I/O
with production traffic for hours.

**Index amplification.** Each index on the table multiplies the work. DoorDash again: "Each index
on a table effectively requires another insert/delete pair."

**One long transaction.** A single `UPDATE` is one transaction. Until it commits it holds its locks
([entry 16](16-long-transactions-vs-ddl.md)), pins the xmin horizon so `VACUUM` cannot clean *any*
table effectively, and — if it fails at 95% — rolls back completely, leaving you exactly where you
started after hours of I/O.

**It can be worse than pointless.** An `UPDATE ... WHERE col IS NULL` that is killed and retried
from the start repeats all the work it already did.

## Unsafe SQL

```sql
-- One transaction, every row, unbounded WAL, replicas fall behind, no progress if it dies.
UPDATE orders SET region = lookup_region(country_code);
```

Also unsafe, and much more common than it should be — bulk data changes inside a schema migration:

```sql
BEGIN;
ALTER TABLE orders ADD COLUMN region text;
UPDATE orders SET region = lookup_region(country_code);   -- holds the DDL lock too
COMMIT;
```

## Safe SQL

Batch, bound each batch, commit each one, and throttle on a real signal.

```sql
-- Prerequisite: an index that makes finding the next batch cheap.
CREATE INDEX CONCURRENTLY idx_orders_region_null
  ON orders (id) WHERE region IS NULL;
```

```sql
-- One batch. Run repeatedly until it reports 0 rows.
-- Each execution is its own transaction: short locks, bounded WAL, resumable.
UPDATE orders SET region = lookup_region(country_code)
WHERE id IN (
  SELECT id FROM orders
  WHERE region IS NULL
  ORDER BY id
  LIMIT 5000
);
```

A driver loop that throttles on replication lag rather than a fixed sleep:

```bash
#!/usr/bin/env bash
set -euo pipefail
PSQL="psql -X -q -v ON_ERROR_STOP=1 -d mydb"

while : ; do
  rows=$($PSQL -tAc "
    WITH b AS (
      SELECT id FROM orders WHERE region IS NULL ORDER BY id LIMIT 5000
    )
    UPDATE orders o SET region = lookup_region(o.country_code)
    FROM b WHERE o.id = b.id
    RETURNING 1
  " | wc -l)

  echo "updated ${rows}"
  [ "$rows" -eq 0 ] && break

  # Throttle on actual replica lag, not a guess.
  while : ; do
    lag=$($PSQL -tAc "
      SELECT COALESCE(EXTRACT(EPOCH FROM max(now() - reply_time)), 0)::int
      FROM pg_stat_replication")
    [ "${lag:-0}" -lt 5 ] && break
    echo "replica lag ${lag}s, waiting"
    sleep 5
  done

  sleep 0.1   # leave room for autovacuum
done
```

Batch sizing is empirical. Start at 1,000–5,000 rows, watch replica lag and batch duration, and
tune so a batch takes well under a second. The right number depends on row width, index count, and
your disks — anyone quoting a universal figure is guessing.

For very large tables, DoorDash's shadow-table approach is often better than in-place batching:
build a new lightly-indexed table, copy into it with a trigger keeping it current, add indexes at
the end, then swap. Their write-up reports this reducing a projected three-month backfill to under
a week.

## Reproducible lab

Shows the WAL and dead-tuple cost of one unbatched `UPDATE` against the same work batched.

```bash
docker run --rm -d --name mp-lab -e POSTGRES_PASSWORD=lab -p 55432:5432 postgres:17
until docker exec mp-lab pg_isready -U postgres -q; do sleep 1; done

docker exec -i mp-lab psql -U postgres -X <<'SQL'
CREATE TABLE bf AS
  SELECT g AS id, repeat('x',100) AS pad, NULL::text AS region
  FROM generate_series(1,500000) g;
ALTER TABLE bf ADD PRIMARY KEY (id);
CREATE INDEX bf_pad_idx ON bf (pad);

SELECT pg_size_pretty(pg_total_relation_size('bf')) AS size_before,
       pg_current_wal_lsn() AS wal_before;

UPDATE bf SET region = 'eu';

SELECT pg_size_pretty(pg_total_relation_size('bf')) AS size_after,
       pg_current_wal_lsn() AS wal_after;
SQL

docker exec -i mp-lab psql -U postgres -X -c \
  "SELECT n_live_tup, n_dead_tup FROM pg_stat_user_tables WHERE relname='bf';"

docker rm -f mp-lab
```

Verified output on PostgreSQL 17.10, 500,000 rows, two indexes:

```
 size_before | wal_before
-------------+------------
 82 MB       | 0/5E6BF4B8

UPDATE 500000

 size_after  | wal_after
-------------+------------
 164 MB      | 0/6CD98C40

 n_live_tup | n_dead_tup
------------+------------
     500000 |     500000
```

Three numbers to take from this. The table **doubled**, 82 MB to 164 MB, because every row was
rewritten and the old versions are still on disk. `n_dead_tup` equals `n_live_tup` — the entire
table is now garbage awaiting `VACUUM`. And the WAL LSN advanced by
`0x6CD98C40 - 0x5E6BF4B8` = 241,957,768 bytes, roughly **231 MB of WAL to update an 82 MB
table** — nearly 3x the table size, all of which every replica must receive and replay.

That last figure is the one that causes the outage. It is not blocking anything; it is simply more
WAL than your replication link can absorb in the time available.

Re-run with the batched loop and the totals are similar, but they arrive in small increments that
replicas keep up with and autovacuum can clean between batches. **The total work is the same; the
peak is what you are managing.**

## Public incidents

**DoorDash — Hot Swapping Production Tables for Safe Database Backfills** (2020-10-21, Justin
Lee). The clearest published account of why in-place backfills fail at scale. On write rate versus
replicas:

> Aurora replicas typically stay less than 100 milliseconds behind, which is sufficient for our
> application logic. But without careful monitoring, we found that it is fairly easy to push the
> replica lag above 10 seconds, which, unsurprisingly, causes production issues.

On the underlying cost:

> Updating a column on a billion rows in Postgres is equivalent to deleting a billion rows and
> inserting a billion rows

They moved to a shadow-table-plus-trigger approach with a transactional swap in both directions,
turning a projected three-month project into under a week.
<https://careersatdoordash.com/blog/hot-swapping-production-data-tables/>

## How MigrationPilot catches it

- **MP011** (`unbatched-data-backfill`) — flags `UPDATE`/`DELETE` statements with no bound on the
  number of rows affected.
- **MP067** (`warn-backfill-no-batching`) — flags backfill-shaped statements lacking a `LIMIT` or
  key-range predicate.
- **MP080** (`ban-data-in-migration`) — flags data changes mixed into schema migrations, which is
  the variant that also holds a DDL lock open ([entry 16](16-long-transactions-vs-ddl.md)).

## Confidence

**High** — mechanism is documented MVCC behaviour, lab demonstrates the write amplification and
dead-tuple cost, one named dated engineering source with measured production numbers.

Last verified 2026-08-11 against PostgreSQL 17.10.
