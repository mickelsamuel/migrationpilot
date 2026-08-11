---
id: MPH-009
title: Unique constraint scans
rules: [MP027]
pg_versions: "all supported versions (14–18)"
lock_mode: ACCESS EXCLUSIVE
severity: critical
confidence: Medium
last_verified: 2026-08-11
verified_against: PostgreSQL 17.10
incidents: []
---

# Unique constraint scans

`ALTER TABLE ... ADD CONSTRAINT ... UNIQUE` builds an index over the whole table under
`ACCESS EXCLUSIVE`. Reads and writes both stop until it finishes.

There is no `ADD CONSTRAINT ... CONCURRENTLY`. But there is a two-step route that gets you an
identical constraint with almost no lock time, and it is not widely enough known.

## Affected versions

All supported versions (14–18). `ADD CONSTRAINT ... USING INDEX` has existed since PostgreSQL 9.1.

## Mechanism

A `UNIQUE` constraint in PostgreSQL *is* a unique index plus a catalog entry marking it as a
constraint. Adding one the direct way builds that index inline, and because it is an `ALTER TABLE
... ADD CONSTRAINT` form it takes `ACCESS EXCLUSIVE` — which

> Conflicts with locks of all modes ... This mode guarantees that the holder is the only
> transaction accessing the table in any way.

([13.3. Explicit Locking](https://www.postgresql.org/docs/current/explicit-locking.html))

Note that `ADD FOREIGN KEY` is the documented exception to the `ACCESS EXCLUSIVE` rule for
`ADD table_constraint` ([entry 08](08-foreign-key-without-not-valid.md)); `UNIQUE` is **not** an
exception. It gets the full lock, for the full duration of the index build.

`NOT VALID` does not help here either. The
[ALTER TABLE manual](https://www.postgresql.org/docs/current/sql-altertable.html) limits it:
`NOT VALID` is accepted only for `CHECK`, foreign key, and (on PostgreSQL 18) `NOT NULL`
constraints. There is no deferred-validation path for uniqueness, because a unique constraint is
enforced by an index and an index either covers all the rows or it does not.

The way out is to build the index separately, without a blocking lock, and then adopt it:

1. [`CREATE UNIQUE INDEX CONCURRENTLY`](https://www.postgresql.org/docs/current/sql-createindex.html#SQL-CREATEINDEX-CONCURRENTLY)
   takes `SHARE UPDATE EXCLUSIVE`, which does not conflict with `ROW EXCLUSIVE`. Writes continue
   through the build.
2. `ALTER TABLE ... ADD CONSTRAINT ... UNIQUE USING INDEX <name>` adopts the finished index. It
   takes `ACCESS EXCLUSIVE`, but only long enough to update the catalog — there is no scan,
   because the index already exists and is already valid.

The end state is identical to the direct form: `\d` shows a constraint, violations produce a
constraint-named error, and `pg_constraint` has the row.

Two cautions specific to unique indexes built concurrently:

- **The build can fail on duplicate data**, and it fails *at the end*, after doing all the work.
  You are then left with an invalid index — [entry 12](12-invalid-index-after-failed-concurrently.md).
  Check for duplicates before you start.
- A duplicate inserted *between* the two scan phases will also fail the build. This is the exact
  failure carwow documented in 2016.

## Unsafe SQL

```sql
-- Builds the index inline under ACCESS EXCLUSIVE. Table fully unavailable.
ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email);
```

## Safe SQL

```sql
-- 0. Check for duplicates first. CONCURRENTLY fails late and expensively otherwise.
SELECT email, count(*) FROM users GROUP BY email HAVING count(*) > 1;

-- 1. Build the index without blocking writes. Not in a transaction block.
CREATE UNIQUE INDEX CONCURRENTLY users_email_key ON users (email);

-- 2. Confirm it is valid before adopting it.
SELECT c.relname, i.indisvalid
FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
WHERE c.relname = 'users_email_key';
-- indisvalid must be true. If false, drop it and retry (entry 12).

-- 3. Adopt it as a constraint. ACCESS EXCLUSIVE, but no scan — a metadata update.
SET lock_timeout = '2s';
ALTER TABLE users
  ADD CONSTRAINT users_email_key UNIQUE USING INDEX users_email_key;
```

If you only need uniqueness enforced and do not need a named *constraint* — no foreign key will
reference these columns, and you do not care whether `\d` says "constraint" or "index" — you can
stop after step 1. A unique index enforces uniqueness on its own. Step 3 exists for the cases where
something needs to reference the constraint by name.

## Reproducible lab

```bash
docker run --rm -d --name mp-lab -e POSTGRES_PASSWORD=lab -p 55432:5432 postgres:17
until docker exec mp-lab pg_isready -U postgres -q; do sleep 1; done
q() { docker exec -i mp-lab psql -U postgres -X -q "$@"; }

q -c "CREATE TABLE uq AS SELECT g AS id FROM generate_series(1,200000) g;"

# What lock does the direct form take?
q -c "BEGIN;
      ALTER TABLE uq ADD CONSTRAINT uq_id_unique UNIQUE (id);
      SELECT mode, granted FROM pg_locks l JOIN pg_class c ON c.oid = l.relation
      WHERE c.relname = 'uq';
      COMMIT;"

# The two-step route, and proof the end state is a real constraint
q -c "ALTER TABLE uq DROP CONSTRAINT uq_id_unique;"
q -c "CREATE UNIQUE INDEX CONCURRENTLY uq_id_key ON uq (id);"
q -c "SET lock_timeout='2s';
      ALTER TABLE uq ADD CONSTRAINT uq_id_key UNIQUE USING INDEX uq_id_key;"
q -c "SELECT conname, contype FROM pg_constraint WHERE conrelid = 'uq'::regclass;"

docker rm -f mp-lab
```

Verified output on PostgreSQL 17.10 for the direct form:

```
        mode         | granted
---------------------+---------
 ShareLock           | t
 AccessExclusiveLock | t
```

Both locks, held together: `AccessExclusiveLock` for the `ALTER TABLE` itself and `ShareLock` from
the index build inside it. Nothing reads or writes `uq` while that transaction is open.

The two-step version ends with `contype = 'u'` in `pg_constraint` — a genuine unique constraint,
reached without ever holding `ACCESS EXCLUSIVE` during a scan.

To see the difference under load, hold a transaction open against `uq` in another session: the
direct `ADD CONSTRAINT` queues behind it (and blocks everything behind itself, per
[entry 02](02-lock-timeout-and-the-lock-queue.md)), while `CREATE UNIQUE INDEX CONCURRENTLY`
proceeds.

## Public incidents

No public postmortem located as of 2026-08.

Searches surfaced plenty of practitioner write-ups recommending the `USING INDEX` pattern, and
[carwow's 2016 post](https://medium.com/carwow-product-engineering/problems-with-concurrent-postgres-indexes-and-how-to-solve-them-c57f7656c852)
documents a unique index build failing on a duplicate inserted mid-build — but that is the
`CONCURRENTLY` failure mode covered in [entry 12](12-invalid-index-after-failed-concurrently.md),
not an outage caused by the blocking `ADD CONSTRAINT ... UNIQUE` form. No named organisation has
published a postmortem attributing downtime specifically to a unique constraint scan. Graded
Medium on that basis.

## How MigrationPilot catches it

- **MP027** (`disallowed-unique-constraint`, critical) — "Adding a UNIQUE constraint directly scans
  the entire table under ACCESS EXCLUSIVE lock. Create the index concurrently first, then add the
  constraint USING INDEX."

## Confidence

**Medium** — mechanism documented in the manual, lab reproduces the lock modes with captured
output, but no public incident located.

Last verified 2026-08-11 against PostgreSQL 17.10.
