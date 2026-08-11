---
id: MPH-004
title: The CHECK-then-NOT NULL pattern
rules: [MP002, MP030]
pg_versions: "12 and later; all supported versions (14–18)"
lock_mode: "ACCESS EXCLUSIVE (brief) / SHARE UPDATE EXCLUSIVE (scan)"
severity: critical
confidence: High
last_verified: 2026-08-11
verified_against: PostgreSQL 17.10
incidents:
  - name: "Doctolib: Adding a NOT NULL constraint on PG faster with minimal locking"
    date: "2017-12-04"
    url: "https://medium.com/doctolib-engineering/adding-a-not-null-constraint-on-pg-faster-with-minimal-locking-38b2c00c4d1c"
  - name: "Braintree/PayPal: PostgreSQL at Scale — Database Schema Changes Without Downtime"
    date: "2019-02-01"
    url: "https://medium.com/paypal-tech/postgresql-at-scale-database-schema-changes-without-downtime-20d3749ed680"
---

# The CHECK-then-NOT NULL pattern

This is the canonical safe pattern, and it is worth understanding as a *shape* rather than a
recipe, because the same shape solves foreign keys ([entry 08](08-foreign-key-without-not-valid.md))
and unique constraints ([entry 09](09-unique-constraint-scan.md)) too.

The shape: **take a brief strong lock to declare an intention, then do the expensive verification
under a weak lock.**

The same idea applies to a `CHECK` constraint added on its own, which is why this entry covers both
`CHECK ... NOT VALID` generally and the `NOT NULL` promotion specifically.

## Affected versions

PostgreSQL 12 and later, which is every supported version (14–18). The pattern depends on
`SET NOT NULL` being able to skip its scan, added in
[PostgreSQL 12](https://www.postgresql.org/docs/release/12.0/):

> Allow `ALTER TABLE ... SET NOT NULL` to avoid unnecessary table scans (Sergei Kornilov)

On PostgreSQL 18 there is a shorter route that does not need the throwaway `CHECK` constraint at
all — see [entry 05](05-pg18-not-null-not-valid.md). The pattern here still works on 18; it is just
no longer the best available.

## Mechanism

Three manual facts do the work.

**`NOT VALID` skips the scan.** From the
[ALTER TABLE manual](https://www.postgresql.org/docs/current/sql-altertable.html):

> Normally, this form will cause a scan of the table to verify that all existing rows in the table
> satisfy the new constraint. But if the `NOT VALID` option is used, this potentially-lengthy scan
> is skipped.

A `NOT VALID` constraint is enforced for **new** inserts and updates immediately. It simply makes
no claim about rows that already exist. So from the moment step 1 commits, your data can only get
cleaner.

**`VALIDATE CONSTRAINT` takes a weak lock.** Also from the manual:

> The validation step does not need to lock out concurrent updates, since it knows that other
> transactions will be enforcing the constraint for rows that they insert or update; only
> pre-existing rows need to be checked. Hence, validation acquires only a
> `SHARE UPDATE EXCLUSIVE` lock on the table being altered.

`SHARE UPDATE EXCLUSIVE` does not conflict with `ROW EXCLUSIVE` or `ACCESS SHARE`, so reads and
writes both continue while the scan runs. It *does* conflict with itself and with `VACUUM`, which
is the one real cost: a long validation blocks autovacuum on that table.

**A valid `CHECK` lets `SET NOT NULL` skip its own scan:**

> if a valid `CHECK` constraint exists (and is not dropped in the same command) which proves no
> `NULL` can exist, then the table scan is skipped.

Chaining those three gives you a `NOT NULL` column where the strongest lock is held only for the
duration of two metadata updates.

## Unsafe SQL

```sql
-- Scans the whole table under ACCESS EXCLUSIVE. Everything blocks.
ALTER TABLE orders ALTER COLUMN customer_id SET NOT NULL;

-- Same problem for a general CHECK constraint:
ALTER TABLE orders ADD CONSTRAINT orders_amount_positive CHECK (amount > 0);
```

## Safe SQL

The general form, for any `CHECK` constraint:

```sql
SET lock_timeout = '2s';
ALTER TABLE orders
  ADD CONSTRAINT orders_amount_positive CHECK (amount > 0) NOT VALID;

-- fix or remove offending pre-existing rows here, in batches

ALTER TABLE orders VALIDATE CONSTRAINT orders_amount_positive;
```

The `NOT NULL` specialisation, in full:

```sql
-- 1. Declare intent. Brief ACCESS EXCLUSIVE, no scan.
SET lock_timeout = '2s';
ALTER TABLE orders
  ADD CONSTRAINT orders_customer_id_not_null
  CHECK (customer_id IS NOT NULL) NOT VALID;

-- 2. Clean up existing NULLs in batches (entry 18). New NULLs are already rejected.
--    Repeat until zero rows affected:
UPDATE orders SET customer_id = 0
WHERE id IN (SELECT id FROM orders WHERE customer_id IS NULL ORDER BY id LIMIT 5000);

-- 3. Verify existing rows. Scans under SHARE UPDATE EXCLUSIVE — traffic continues.
ALTER TABLE orders VALIDATE CONSTRAINT orders_customer_id_not_null;

-- 4. Promote. Scan skipped because the valid CHECK proves it. Brief ACCESS EXCLUSIVE.
SET lock_timeout = '2s';
ALTER TABLE orders ALTER COLUMN customer_id SET NOT NULL;

-- 5. Drop the scaffolding. Must be a separate statement from step 4.
ALTER TABLE orders DROP CONSTRAINT orders_customer_id_not_null;
```

Two ways people break this:

- **Combining steps 4 and 5.** The manual requires the `CHECK` not be "dropped in the same
  command". Combine them and the scan returns, silently.
- **Running steps 1 and 3 in the same transaction.** A `NOT VALID` constraint validated inside the
  transaction that created it gains nothing — you are holding one lock across both, so you have
  reinvented the unsafe version with extra steps. They must be separate transactions, and in
  practice separate migrations, with the backfill in between.

## Reproducible lab

Shows the lock modes differ, which is the actual claim. Session A holds a long read; step 3
(`VALIDATE`) should proceed anyway, while a plain `SET NOT NULL` would queue.

```bash
docker run --rm -d --name mp-lab -e POSTGRES_PASSWORD=lab -p 55432:5432 postgres:17
until docker exec mp-lab pg_isready -U postgres -q; do sleep 1; done
q() { docker exec -i mp-lab psql -U postgres -X -q "$@"; }

q -c "CREATE TABLE orders AS
      SELECT g AS id, g AS customer_id FROM generate_series(1,2000000) g;"
q -c "ALTER TABLE orders ADD CONSTRAINT ck CHECK (customer_id IS NOT NULL) NOT VALID;"

# Session A: a long-running read holding ACCESS SHARE
docker exec -i mp-lab psql -U postgres -X -q \
  -c "BEGIN; SELECT count(*) FROM orders; SELECT pg_sleep(20); COMMIT;" >/dev/null 2>&1 &
sleep 2

# VALIDATE only needs SHARE UPDATE EXCLUSIVE -> does not conflict with ACCESS SHARE
echo "--- VALIDATE while a reader holds the table ---"
time q -c "ALTER TABLE orders VALIDATE CONSTRAINT ck;"

# A plain SET NOT NULL wants ACCESS EXCLUSIVE -> will block until the reader finishes
echo "--- plain SET NOT NULL against the same reader (2s lock_timeout) ---"
q -c "SET lock_timeout='2s'; ALTER TABLE orders ALTER COLUMN customer_id SET NOT NULL;" 2>&1 | head -2

docker rm -f mp-lab
```

Verified output on PostgreSQL 17.10, 2,000,000 rows, with a reader holding the table:

```
--- VALIDATE while a reader holds the table ---
Timing is on.
ALTER TABLE
Time: 41.080 ms

--- plain SET NOT NULL against the same reader (2s lock_timeout) ---
SET
ERROR:  canceling statement due to lock timeout
```

`VALIDATE CONSTRAINT` scanned two million rows and finished in 41 ms **while another session held
the table open**, because `SHARE UPDATE EXCLUSIVE` does not conflict with `ACCESS SHARE`. The
plain `SET NOT NULL` could not get `ACCESS EXCLUSIVE` past the same reader and aborted. Identical
logical change, opposite outcome — that contrast is the entire value of the pattern.

For the timing side of the same claim, [entry 03](03-set-not-null-full-scan.md) has verified
output showing the promotion step at 1.152 ms against 80.019 ms for the naive form.

## Public incidents

**Doctolib — Adding a NOT NULL constraint on PG faster with minimal locking** (2017-12-04,
Christophe Escobar). The write-up that popularised this pattern. 30 million rows, ~100 writes per
second, `NOT VALID` step measured at roughly 6 ms. Their summary of why validation is cheap:

> PostgreSQL assumes that new data is already enforced, and checks existing data on the table to
> render the constraint as valid which is why no writing lock is needed.

<https://medium.com/doctolib-engineering/adding-a-not-null-constraint-on-pg-faster-with-minimal-locking-38b2c00c4d1c>

**Braintree/PayPal — PostgreSQL at Scale** (2019-02-01, James Coleman). Gives the same pattern as
standing policy, with the exact statement:

> Add a `CHECK` constraint requiring the column be not-null with
> `ALTER TABLE <table> ADD CONSTRAINT <name> CHECK (<column> IS NOT NULL) NOT VALID;`

<https://medium.com/paypal-tech/postgresql-at-scale-database-schema-changes-without-downtime-20d3749ed680>

## How MigrationPilot catches it

- **MP002** (`require-check-not-null-pattern`, critical) — flags bare `SET NOT NULL` and points at
  this pattern.
- **MP030** (`require-not-valid-check`, critical) — "Adding a CHECK constraint without NOT VALID
  scans the entire table under ACCESS EXCLUSIVE lock. Add with NOT VALID first, then VALIDATE
  separately." This covers the general `CHECK` case, not just `NOT NULL`.

## Confidence

**High** — every step quoted from the manual, lab demonstrates the lock-mode difference, timing
evidence captured in entry 03, two named public sources with dates.

Last verified 2026-08-11 against PostgreSQL 17.10.
