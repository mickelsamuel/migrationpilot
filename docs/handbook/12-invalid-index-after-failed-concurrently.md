---
id: MPH-012
title: Invalid indexes after a failed CONCURRENTLY
rules: [MP070, MP097, MP021, MP009]
pg_versions: "all supported versions (14–18)"
lock_mode: SHARE UPDATE EXCLUSIVE
severity: warning
confidence: High
last_verified: 2026-08-11
verified_against: PostgreSQL 17.10
incidents:
  - name: "carwow: Problems with concurrent Postgres indexes (and how to solve them)"
    date: "2016-08-22"
    url: "https://medium.com/carwow-product-engineering/problems-with-concurrent-postgres-indexes-and-how-to-solve-them-c57f7656c852"
  - name: "Shayon Mukherjee: Stop Relying on IF NOT EXISTS for Concurrent Index Creation in PostgreSQL"
    date: "2024-08-12"
    url: "https://www.shayon.dev/post/2024/225/stop-relying-on-if-not-exists-for-concurrent-index-creation-in-postgresql/"
  - name: "postgres.ai: The hidden cost of invalid indexes in Postgres"
    date: "2026-01-06"
    url: "https://postgres.ai/blog/20260106-invalid-index-overhead"
---

# Invalid indexes after a failed CONCURRENTLY

When `CREATE INDEX CONCURRENTLY` fails, it does not clean up after itself. It leaves an index in
the catalog marked invalid: never used to answer queries, but still updated on every write, still
scanned by `VACUUM`, still blocking HOT updates.

You get the full cost of the index and none of the benefit, indefinitely, and nothing tells you.

The worst part is the retry. The obvious defensive move — `CREATE INDEX CONCURRENTLY IF NOT
EXISTS` — makes it *silently permanent*.

## Affected versions

All supported versions (14–18).

PostgreSQL 12 added `REINDEX CONCURRENTLY`
([PG 12 release notes](https://www.postgresql.org/docs/release/12.0/): "Add `REINDEX`
`CONCURRENTLY` option to allow reindexing without locking out writes"), which gives you a non-
blocking repair path that did not exist before. On PostgreSQL 11 and earlier the only repair was
`DROP INDEX` + rebuild, or a blocking `REINDEX`.

## Mechanism

`CREATE INDEX CONCURRENTLY` does two passes over the table plus waits for concurrent transactions
to drain. If anything goes wrong in the second pass — a uniqueness violation, a statement timeout,
a deadlock, a cancelled session, a failover — the index is already registered in `pg_index` but
cannot be trusted, so PostgreSQL sets `indisvalid = false` and stops.

The [CREATE INDEX manual](https://www.postgresql.org/docs/current/sql-createindex.html#SQL-CREATEINDEX-CONCURRENTLY)
describes the state and is explicit that the leftover index must be dropped manually.

An invalid index is not inert. Per postgres.ai's measurements (2026-01-06):

- It is **maintained on every `INSERT` and `UPDATE`**, so you pay the write amplification.
- **`VACUUM` scans it**, consuming autovacuum budget: "VACUUM scans invalid indexes, consuming
  autovacuum budget."
- It **blocks HOT updates** on its columns. Their test showed the heap-only-tuple rate dropping
  "from 96.8% to 0%" once updates touched a column covered by an invalid index — which means table
  bloat and more vacuum work.
- It adds **planning-time lock traffic**: "During query planning, Postgres acquires
  `AccessShareLock` on all indexes for participating tables—including invalid ones."

So a forgotten invalid index degrades exactly the workload you built it to speed up.

### Why IF NOT EXISTS is the wrong guard

`CREATE INDEX CONCURRENTLY IF NOT EXISTS` checks for an index *by name*. An invalid index has the
name. So the statement skips creation, returns success, and your migration is marked complete over
a broken index. Shayon Mukherjee's 2024 write-up puts it exactly:

> When you use `IF NOT EXISTS` and re-run your index creation, the task can silently complete
> while leaving behind an invalid index.

> PostgreSQL quietly skips the index creation if an index already exists, even if it's marked as
> invalid.

This is verified in the lab below — the retry reports `CREATE INDEX` with only a `NOTICE`.

The correct guard is to **drop first, then create**.

## Unsafe SQL

```sql
-- Attempt 1 fails (timeout, duplicate, whatever). Leaves an invalid index.
CREATE INDEX CONCURRENTLY idx_users_email ON users (email);

-- Attempt 2, the "safe" retry. Reports success. Index is still invalid.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email ON users (email);
```

## Safe SQL

```sql
-- 1. Find anything already broken.
SELECT n.nspname AS schema, c.relname AS index_name, t.relname AS table_name,
       pg_size_pretty(pg_relation_size(c.oid)) AS size
FROM pg_index i
JOIN pg_class c ON c.oid = i.indexrelid
JOIN pg_class t ON t.oid = i.indrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE NOT i.indisvalid
ORDER BY pg_relation_size(c.oid) DESC;

-- 2. The retry-safe build. Drop first — never IF NOT EXISTS.
SET lock_timeout = '5s';
DROP INDEX CONCURRENTLY IF EXISTS idx_users_email;
CREATE INDEX CONCURRENTLY idx_users_email ON users (email);

-- 3. Verify. Do not assume the statement succeeding means the index is usable.
SELECT c.relname, i.indisvalid
FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
WHERE c.relname = 'idx_users_email';
```

Step 3 is not optional. It is the only thing that distinguishes "the index exists" from "the index
works".

If the invalid index backs a `UNIQUE` or `PRIMARY KEY` constraint, `DROP INDEX` will refuse —
drop the constraint, or use `REINDEX INDEX CONCURRENTLY` (PostgreSQL 12+) to rebuild in place:

```sql
REINDEX INDEX CONCURRENTLY idx_users_email;
```

For a unique index specifically, fix the duplicate data before rebuilding, or the rebuild fails
the same way:

```sql
SELECT email, count(*) FROM users GROUP BY email HAVING count(*) > 1;
```

## Reproducible lab

Forces a genuine failure by building a unique index over duplicated data, then shows the
`IF NOT EXISTS` trap.

```bash
docker run --rm -d --name mp-lab -e POSTGRES_PASSWORD=lab -p 55432:5432 postgres:17
until docker exec mp-lab pg_isready -U postgres -q; do sleep 1; done
q() { docker exec -i mp-lab psql -U postgres -X "$@"; }

q -q -c "CREATE TABLE dupes AS SELECT g AS id, 1 AS same FROM generate_series(1,50000) g;"

echo "--- the build fails ---"
q -c "CREATE UNIQUE INDEX CONCURRENTLY dupes_same_key ON dupes (same);"

echo "--- but the index is still there, marked invalid ---"
q -c "SELECT c.relname, i.indisvalid FROM pg_index i
      JOIN pg_class c ON c.oid = i.indexrelid WHERE c.relname='dupes_same_key';"

echo "--- and IF NOT EXISTS 'succeeds' over it ---"
q -c "CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS dupes_same_key ON dupes (same);"

echo "--- still invalid ---"
q -c "SELECT c.relname, i.indisvalid FROM pg_index i
      JOIN pg_class c ON c.oid = i.indexrelid WHERE c.relname='dupes_same_key';"

docker rm -f mp-lab
```

Verified output on PostgreSQL 17.10:

```
--- the build fails ---
ERROR:  could not create unique index "dupes_same_key"
DETAIL:  Key (same)=(1) is duplicated.

--- but the index is still there, marked invalid ---
    relname     | indisvalid
----------------+------------
 dupes_same_key | f

--- and IF NOT EXISTS 'succeeds' over it ---
NOTICE:  relation "dupes_same_key" already exists, skipping
CREATE INDEX

--- still invalid ---
    relname     | indisvalid
----------------+------------
 dupes_same_key | f
```

Read the third block again. PostgreSQL printed `CREATE INDEX` — the success tag. A migration
runner sees exit status 0 and marks the migration applied. The index is still `indisvalid = f` and
will never answer a query. There is no error, no warning, nothing in your deploy log. That is why
this entry recommends `DROP INDEX CONCURRENTLY IF EXISTS` instead.

## Public incidents

**carwow — Problems with concurrent Postgres indexes (and how to solve them)** (2016-08-22, Ken
Alex Fassone). Documents the exact failure the lab reproduces — a unique index built concurrently
while a duplicate arrives between the two scan phases:

> Postgres will stop the creation of the index and it will be marked as 'INVALID'; meaning that it
> won't be used for queries, but it will still be updated like any other index.

They also advise against `REINDEX` as the repair, because on their version it locked the table for
writes. On PostgreSQL 12+, `REINDEX ... CONCURRENTLY` removes that objection.
<https://medium.com/carwow-product-engineering/problems-with-concurrent-postgres-indexes-and-how-to-solve-them-c57f7656c852>

**Shayon Mukherjee — Stop Relying on IF NOT EXISTS for Concurrent Index Creation** (2024-08-12).
The clearest statement of the retry trap, with the drop-then-create pattern and exponential backoff
as the recommended alternative.
<https://www.shayon.dev/post/2024/225/stop-relying-on-if-not-exists-for-concurrent-index-creation-in-postgresql/>

**postgres.ai — The hidden cost of invalid indexes in Postgres** (2026-01-06, Dmitry Fomin).
Measures what an invalid index actually costs: write amplification, autovacuum budget, HOT update
rate collapsing from 96.8% to 0%, and `AccessShareLock` acquisition during planning. Includes the
detection query reproduced above.
<https://postgres.ai/blog/20260106-invalid-index-overhead>

## How MigrationPilot catches it

- **MP070** (`warn-concurrent-index-invalid`) — "CREATE INDEX CONCURRENTLY can leave an invalid
  index on failure. Add DROP INDEX CONCURRENTLY IF EXISTS before retrying." It stands down on an
  index a constraint owns, or adopts later in the same file, and points at
  `REINDEX INDEX CONCURRENTLY` there instead — the exception described above.
- **MP097** (`ban-drop-constraint-backing-index`, critical) — flags the drop that gets refused,
  but only where `pg_constraint` or an `ADD CONSTRAINT` in the migration establishes the
  ownership. A `_key` suffix on the name is not evidence of anything.
- **MP021** (`require-concurrent-reindex`) — flags `REINDEX` without `CONCURRENTLY`, the repair
  path that blocks writes.
- **MP009** (`require-drop-index-concurrently`) — flags `DROP INDEX` without `CONCURRENTLY`.

> **Rule interaction worth knowing:** MP023 (`require-if-not-exists`) asks for `IF NOT EXISTS` to
> make migrations idempotent. For `CREATE INDEX CONCURRENTLY` specifically, that guidance conflicts
> with this entry — `IF NOT EXISTS` is exactly what hides an invalid index. Where the two disagree,
> prefer `DROP INDEX CONCURRENTLY IF EXISTS` followed by a plain `CREATE INDEX CONCURRENTLY`, which
> is both idempotent and correct.

## Confidence

**High** — mechanism documented in the command reference, failure and the `IF NOT EXISTS` trap both
reproduced in the lab with captured output, three named public sources with dates.

Last verified 2026-08-11 against PostgreSQL 17.10.
