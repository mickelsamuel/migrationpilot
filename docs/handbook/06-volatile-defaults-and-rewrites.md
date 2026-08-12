---
id: MPH-006
title: Volatile defaults and table rewrites
rules: [MP003, MP015, MP048]
pg_versions: "all supported versions (14–18); constant defaults stopped rewriting in 11"
lock_mode: ACCESS EXCLUSIVE
severity: critical
confidence: High
last_verified: 2026-08-11
verified_against: PostgreSQL 17.10
incidents:
  - name: "GoCardless: Zero-downtime Postgres migrations — the hard parts"
    date: "2024-06"
    url: "https://gocardless.com/blog/zero-downtime-postgres-migrations-the-hard-parts"
  - name: "Braintree/PayPal: PostgreSQL at Scale — Database Schema Changes Without Downtime"
    date: "2019-02-01"
    url: "https://medium.com/paypal-tech/postgresql-at-scale-database-schema-changes-without-downtime-20d3749ed680"
---

# Volatile defaults and table rewrites

"Adding a column with a default rewrites the table" is folklore that was true until 2018 and is
now wrong in a way that matters. Since PostgreSQL 11, a **constant** default is free. A
**volatile** default still rewrites the entire table and every index on it, under
`ACCESS EXCLUSIVE`.

The distinction is the whole entry. `DEFAULT 0` is instant on a billion rows. `DEFAULT
gen_random_uuid()` is an outage.

## Affected versions

All supported versions (14–18) have the fast path for constants.
[PostgreSQL 11 release notes](https://www.postgresql.org/docs/release/11.0/):

> Allow `ALTER TABLE` to add a column with a non-null default without doing a table rewrite
> (Andrew Dunstan, Serge Rielau)
> This is enabled when the default value is a constant.

If you are still reading advice written before 2018 — and a great deal of the migration-safety
canon was — it will tell you to avoid all defaults. That advice is now costing you a two-step
migration you do not need.

## Mechanism

From the [ALTER TABLE manual](https://www.postgresql.org/docs/current/sql-altertable.html), the
fast path:

> When a column is added with `ADD COLUMN` and a non-volatile `DEFAULT` is specified, the default
> value is evaluated at the time of the statement and the result stored in the table's metadata,
> where it will be returned when any existing rows are accessed ... making the `ALTER TABLE` very
> fast even on large tables.

The value is stored once, in `pg_attribute.attmissingval`, and materialised on read. No heap pages
are touched.

And the slow path:

> Adding a column with a volatile `DEFAULT` (e.g., `clock_timestamp()`), a stored generated column,
> an identity column, or a column with a domain data type that has constraints will cause the
> entire table and its indexes to be rewritten.

A rewrite means: allocate a new relfilenode, copy every live row into it, rebuild every index,
then swap. It holds `ACCESS EXCLUSIVE` throughout, so nothing reads or writes the table for the
duration. It also needs disk space for a second full copy of the table plus indexes — a rewrite
can fail partway through on a full volume, which is a worse day than the lock.

The trap list, in practice:

| `ADD COLUMN ... DEFAULT` | Rewrites? |
|---|---|
| `0`, `'pending'`, `true`, `now()` (stable within the statement — evaluated once) | No |
| `gen_random_uuid()` | **Yes** |
| `clock_timestamp()`, `random()` | **Yes** |
| `GENERATED ALWAYS AS (...) STORED` | **Yes** |
| `GENERATED ... AS IDENTITY` | **Yes** |
| a domain type carrying constraints | **Yes** |

`now()` is `STABLE`, not `VOLATILE`, so it takes the fast path and every existing row gets the
same timestamp. That is usually what you wanted; if it is not, you wanted a backfill.

Separately: `ALTER COLUMN ... SET DEFAULT` on an **existing** column never rewrites anything — it
only changes what future inserts get. If you want existing rows updated, that is a backfill
([entry 18](18-unbatched-backfills.md)), not a default.

## Unsafe SQL

```sql
-- Rewrites the whole table and all its indexes under ACCESS EXCLUSIVE.
ALTER TABLE orders ADD COLUMN public_id uuid NOT NULL DEFAULT gen_random_uuid();
```

## Safe SQL

```sql
-- Step 1: add the column with no default. Metadata only, instant.
SET lock_timeout = '2s';
ALTER TABLE orders ADD COLUMN public_id uuid;

-- Step 2: make new rows get a value. Also metadata only — existing rows untouched.
ALTER TABLE orders ALTER COLUMN public_id SET DEFAULT gen_random_uuid();

-- Step 3: backfill existing rows in batches. See entry 18.
--   Repeat until zero rows updated:
UPDATE orders SET public_id = gen_random_uuid()
WHERE id IN (
  SELECT id FROM orders WHERE public_id IS NULL ORDER BY id LIMIT 5000
);

-- Step 4: enforce NOT NULL without a blocking scan. See entries 03/04.
ALTER TABLE orders
  ADD CONSTRAINT orders_public_id_not_null CHECK (public_id IS NOT NULL) NOT VALID;
ALTER TABLE orders VALIDATE CONSTRAINT orders_public_id_not_null;
SET lock_timeout = '2s';
ALTER TABLE orders ALTER COLUMN public_id SET NOT NULL;
ALTER TABLE orders DROP CONSTRAINT orders_public_id_not_null;
```

When the default *is* a constant, none of this is necessary — just write it:

```sql
-- Safe as written on PostgreSQL 11+. No rewrite, no backfill, no ceremony.
ALTER TABLE orders ADD COLUMN status text NOT NULL DEFAULT 'pending';
```

## Reproducible lab

A rewrite is directly observable: `pg_class.relfilenode` changes when the table's storage is
replaced. This makes the test exact rather than a timing guess.

```bash
docker run --rm -d --name mp-lab -e POSTGRES_PASSWORD=lab -p 55432:5432 postgres:17
until docker exec mp-lab pg_isready -U postgres -q; do sleep 1; done

docker exec -i mp-lab psql -U postgres -X <<'SQL'
CREATE TABLE rw AS SELECT g AS id FROM generate_series(1,500000) g;
SELECT relfilenode AS before_const FROM pg_class WHERE relname='rw';

ALTER TABLE rw ADD COLUMN c1 int NOT NULL DEFAULT 42;
SELECT relfilenode AS after_constant_default FROM pg_class WHERE relname='rw';

ALTER TABLE rw ADD COLUMN c2 timestamptz NOT NULL DEFAULT clock_timestamp();
SELECT relfilenode AS after_volatile_default FROM pg_class WHERE relname='rw';

ALTER TABLE rw ADD COLUMN c3 uuid NOT NULL DEFAULT gen_random_uuid();
SELECT relfilenode AS after_uuid_default FROM pg_class WHERE relname='rw';
SQL

docker rm -f mp-lab
```

Verified output on PostgreSQL 17.10:

```
 before_const           | 16412
 after_constant_default | 16412   <- unchanged: DEFAULT 42 did NOT rewrite
 after_volatile_default | 16417   <- changed: clock_timestamp() rewrote the table
 after_uuid_default     | 16421   <- changed: gen_random_uuid() rewrote it again
```

The constant default left the relfilenode alone. Both volatile defaults replaced the table's
storage. That is the difference between a metadata update and copying every row you have.

## Public incidents

**GoCardless — Zero-downtime Postgres migrations: the hard parts** (page last edited 2024-06).
States the rule as an absolute:

> Don't rewrite a table while you have an exclusive lock on it (e.g. no
> `ALTER TABLE foos ADD COLUMN bar varchar DEFAULT 'baz' NOT NULL`)

Worth noting honestly: the specific example they give — a constant string default — stopped
rewriting in PostgreSQL 11, so that exact statement is safe on every supported version today. The
underlying principle (never rewrite under an exclusive lock) is still correct, and this is a clean
illustration of why version-pinned advice matters. Their post is also where the 15-second API
outage in [entry 02](02-lock-timeout-and-the-lock-queue.md) comes from.
<https://gocardless.com/blog/zero-downtime-postgres-migrations-the-hard-parts>

**Braintree/PayPal — PostgreSQL at Scale** (2019-02-01, James Coleman). Published just after
PostgreSQL 11 shipped, and documents the operating rules Braintree used for DDL against a payments
database with no scheduled downtime.
<https://medium.com/paypal-tech/postgresql-at-scale-database-schema-changes-without-downtime-20d3749ed680>

## How MigrationPilot catches it

- **MP003** (`volatile-default-table-rewrite`, critical) — flags `ADD COLUMN` with a volatile
  default expression, which is the case that still rewrites. It names the expression the
  migration wrote and separates the stable lookalikes — `now()`, `CURRENT_TIMESTAMP`,
  `statement_timestamp()` — which do not rewrite but do hand every pre-existing row the one
  value they evaluated to.
- **MP015** (`no-add-column-serial`) — flags `serial`/identity columns added to existing tables,
  another rewrite trigger.
- **MP048** (`ban-alter-default-volatile-existing`) — flags setting a volatile default on an
  existing column, where the risk is a surprising backfill expectation rather than a rewrite.

## Confidence

**High** — mechanism quoted from the manual and the PostgreSQL 11 release notes, rewrite proven
via relfilenode change with captured output, two named public sources with dates.

Last verified 2026-08-11 against PostgreSQL 17.10.
