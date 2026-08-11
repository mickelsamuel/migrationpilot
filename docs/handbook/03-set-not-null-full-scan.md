---
id: MPH-003
title: SET NOT NULL and the full table scan
rules: [MP002, MP018]
pg_versions: "all supported versions (14–18); scan-skipping optimisation added in 12"
lock_mode: ACCESS EXCLUSIVE
severity: critical
confidence: High
last_verified: 2026-08-11
verified_against: PostgreSQL 17.10
incidents:
  - name: "Doctolib: Adding a NOT NULL constraint on PG faster with minimal locking"
    date: "2017-12-04"
    url: "https://medium.com/doctolib-engineering/adding-a-not-null-constraint-on-pg-faster-with-minimal-locking-38b2c00c4d1c"
  - name: "GoCardless: Zero-downtime Postgres migrations — the hard parts"
    date: "2024-06"
    url: "https://gocardless.com/blog/zero-downtime-postgres-migrations-the-hard-parts"
---

# SET NOT NULL and the full table scan

`ALTER TABLE ... SET NOT NULL` has to prove no row violates the constraint. It proves it by reading
every row, and it holds `ACCESS EXCLUSIVE` the whole time. The table is unavailable — reads
included — for a duration proportional to its size.

The statement looks like metadata. It is not.

## Affected versions

All supported versions (14–18).

PostgreSQL 12 added the escape hatch this entry depends on
([PG 12 release notes](https://www.postgresql.org/docs/release/12.0/)):

> Allow `ALTER TABLE ... SET NOT NULL` to avoid unnecessary table scans (Sergei Kornilov)
> This can be optimized when the table's column constraints can be recognized as disallowing nulls.

On PostgreSQL 11 and earlier the scan was unconditional and there was no way to avoid it short of
rewriting the table. Every supported version has the optimisation, so the pattern in
[entry 04](04-check-then-not-null.md) always works.

PostgreSQL 18 adds a more direct route — `NOT NULL ... NOT VALID` — covered in
[entry 05](05-pg18-not-null-not-valid.md).

## Mechanism

`SET NOT NULL` is a plain `ALTER TABLE` form, so it takes `ACCESS EXCLUSIVE`, which

> Conflicts with locks of all modes ... This mode guarantees that the holder is the only
> transaction accessing the table in any way.

([13.3. Explicit Locking](https://www.postgresql.org/docs/current/explicit-locking.html))

The [ALTER TABLE manual](https://www.postgresql.org/docs/current/sql-altertable.html) describes the
scan and its one exemption:

> `SET NOT NULL` may only be applied to a column provided none of the records in the table contain
> a `NULL` value for the column. Ordinarily this is checked during the `ALTER TABLE` by scanning
> the entire table, unless `NOT VALID` is specified; however, if a valid `CHECK` constraint exists
> (and is not dropped in the same command) which proves no `NULL` can exist, then the table scan is
> skipped.

So there are exactly three ways to get a `NOT NULL` constraint without a blocking scan:

1. Have a **valid** `CHECK (col IS NOT NULL)` constraint already in place — [entry 04](04-check-then-not-null.md).
2. On PostgreSQL 18, add the `NOT NULL` constraint itself as `NOT VALID` and validate it separately
   — [entry 05](05-pg18-not-null-not-valid.md).
3. Do not add the constraint.

Note that the lock is `ACCESS EXCLUSIVE` in every case, including the fast path. The difference is
*duration*: with the scan, you hold the strongest lock for as long as the read takes; without it,
you hold it for a millisecond. And because a waiting `ACCESS EXCLUSIVE` request blocks everything
behind it ([entry 02](02-lock-timeout-and-the-lock-queue.md)), a millisecond of `ACCESS EXCLUSIVE`
is genuinely cheap and a 40-second one is an outage.

## Unsafe SQL

```sql
-- Scans every row of orders under ACCESS EXCLUSIVE. Reads and writes both blocked.
ALTER TABLE orders ALTER COLUMN customer_id SET NOT NULL;
```

## Safe SQL

The version-independent pattern (works on 12 through 18):

```sql
-- Step 1: record the intent. No scan, brief ACCESS EXCLUSIVE.
SET lock_timeout = '2s';
ALTER TABLE orders
  ADD CONSTRAINT orders_customer_id_not_null
  CHECK (customer_id IS NOT NULL) NOT VALID;

-- Step 2: backfill or fix any offending rows, in batches. See entry 18.
--   (New writes are already being rejected by the NOT VALID constraint.)

-- Step 3: validate. Scans, but only under SHARE UPDATE EXCLUSIVE — reads and writes continue.
ALTER TABLE orders VALIDATE CONSTRAINT orders_customer_id_not_null;

-- Step 4: promote to a real NOT NULL. The scan is skipped because the valid CHECK proves it.
SET lock_timeout = '2s';
ALTER TABLE orders ALTER COLUMN customer_id SET NOT NULL;

-- Step 5: the CHECK is now redundant.
ALTER TABLE orders DROP CONSTRAINT orders_customer_id_not_null;
```

Step 4 and step 5 must not be combined into one `ALTER TABLE` — the manual is explicit that the
`CHECK` must not be "dropped in the same command", or the scan comes back.

## Reproducible lab

Measures the plain scan against the CHECK-first path on the same table.

```bash
docker run --rm -d --name mp-lab -e POSTGRES_PASSWORD=lab -p 55432:5432 postgres:17
until docker exec mp-lab pg_isready -U postgres -q; do sleep 1; done

docker exec -i mp-lab psql -U postgres -X -q <<'SQL'
CREATE TABLE nn AS SELECT g AS id, g::text AS val FROM generate_series(1,2000000) g;
\timing on
-- 1. plain SET NOT NULL: full scan under ACCESS EXCLUSIVE
ALTER TABLE nn ALTER COLUMN val SET NOT NULL;
ALTER TABLE nn ALTER COLUMN val DROP NOT NULL;
-- 2. CHECK ... NOT VALID: no scan
ALTER TABLE nn ADD CONSTRAINT nn_val_nn CHECK (val IS NOT NULL) NOT VALID;
-- 3. VALIDATE: scans, but under SHARE UPDATE EXCLUSIVE
ALTER TABLE nn VALIDATE CONSTRAINT nn_val_nn;
-- 4. SET NOT NULL again, now that a valid CHECK proves it
ALTER TABLE nn ALTER COLUMN val SET NOT NULL;
\timing off
SQL

docker rm -f mp-lab
```

Verified output on PostgreSQL 17.10, 2,000,000 rows:

```
Time: 80.019 ms     <- 1. plain SET NOT NULL (scan, ACCESS EXCLUSIVE)
Time: 1.090 ms      <-    DROP NOT NULL
Time: 1.256 ms      <- 2. ADD CONSTRAINT ... NOT VALID
Time: 56.483 ms     <- 3. VALIDATE CONSTRAINT (scan, SHARE UPDATE EXCLUSIVE)
Time: 1.152 ms      <- 4. SET NOT NULL with valid CHECK present
```

Step 4 is **1.152 ms against 80.019 ms** for the identical logical change: a ~70x reduction in
time spent holding `ACCESS EXCLUSIVE`. The scanning work did not disappear — it moved to step 3,
where it costs 56 ms under a lock that lets reads and writes through.

Be careful reading the absolute numbers: this is a 2M-row table on local NVMe with everything in
cache, so 80 ms is not what production looks like. The ratio and the lock mode are the findings.
Doctolib's 30-million-row table took 1.7 seconds for the same scan on their staging hardware.

To see the blocking rather than just the timing, hold a transaction open against `nn` in another
session and watch step 1 queue behind it, using the `pg_locks` query from
[entry 02](02-lock-timeout-and-the-lock-queue.md).

## Public incidents

**Doctolib — Adding a NOT NULL constraint on PG faster with minimal locking** (2017-12-04,
Christophe Escobar). A 30-million-row table taking ~100 writes/second. They measured the standard
`SET NOT NULL` at 1.7 seconds on staging, judged that unacceptable against their write rate, and
documented the `CHECK ... NOT VALID` + `VALIDATE` path — reporting the `NOT VALID` step at roughly
6 milliseconds. This is the origin of the pattern as it is usually cited.
<https://medium.com/doctolib-engineering/adding-a-not-null-constraint-on-pg-faster-with-minimal-locking-38b2c00c4d1c>

**GoCardless — Zero-downtime Postgres migrations: the hard parts** (page last edited 2024-06).
Lists the combined form as something to avoid outright:

> Don't rewrite a table while you have an exclusive lock on it (e.g. no
> `ALTER TABLE foos ADD COLUMN bar varchar DEFAULT 'baz' NOT NULL`)

<https://gocardless.com/blog/zero-downtime-postgres-migrations-the-hard-parts>

## How MigrationPilot catches it

- **MP002** (`require-check-not-null-pattern`, critical) — "ALTER TABLE ... SET NOT NULL requires a
  full table scan to validate. Use the CHECK constraint pattern instead for large tables."
- **MP018** (`no-force-set-not-null`) — flags attempts to force the constraint through on tables
  where the scan is expected to be expensive.

On PostgreSQL 18, **MP081** (`prefer-pg18-not-null-not-valid`) supersedes this advice — see
[entry 05](05-pg18-not-null-not-valid.md).

## Confidence

**High** — mechanism quoted from the manual, lab reproduces the timing difference with captured
output, two named public sources with dates.

Last verified 2026-08-11 against PostgreSQL 17.10.
