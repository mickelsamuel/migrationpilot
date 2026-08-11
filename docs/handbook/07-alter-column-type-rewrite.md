---
id: MPH-007
title: ALTER COLUMN TYPE rewrites
rules: [MP007, MP044, MP038]
pg_versions: "all supported versions (14–18)"
lock_mode: ACCESS EXCLUSIVE
severity: critical
confidence: High
last_verified: 2026-08-11
verified_against: PostgreSQL 17.10
incidents:
  - name: "Doctolib: How to change a column type in your production's PostgreSQL database"
    date: "2021-11-22"
    url: "https://medium.com/doctolib/how-to-change-a-column-type-in-your-production-s-postgresql-database-35d6fa194cb8"
  - name: "Braintree/PayPal: PostgreSQL at Scale — Database Schema Changes Without Downtime"
    date: "2019-02-01"
    url: "https://medium.com/paypal-tech/postgresql-at-scale-database-schema-changes-without-downtime-20d3749ed680"
---

# ALTER COLUMN TYPE rewrites

`ALTER TABLE ... ALTER COLUMN ... TYPE` usually rewrites the entire table and every index on it,
under `ACCESS EXCLUSIVE`. On a table large enough that you care about the type, this is measured in
hours, and there is no `CONCURRENTLY` variant to rescue you.

Some type changes are free. Knowing which is the difference between a one-line migration and a
multi-week project.

## Affected versions

All supported versions (14–18). Behaviour has not meaningfully changed.

## Mechanism

A type change requires PostgreSQL to re-encode every value in the column's on-disk representation,
and to rebuild every index that references it. It does this by rewriting the whole table into a new
relfilenode under `ACCESS EXCLUSIVE`, which

> Conflicts with locks of all modes ... This mode guarantees that the holder is the only
> transaction accessing the table in any way.

([13.3. Explicit Locking](https://www.postgresql.org/docs/current/explicit-locking.html))

The exemption is **binary coercible** changes. If the new type's on-disk representation is
identical and no constraint needs checking, PostgreSQL only updates the catalog. From the
[ALTER TABLE manual](https://www.postgresql.org/docs/current/sql-altertable.html), on the `TYPE`
form:

> As an exception, when changing the type of an existing column, if the `USING` clause does not
> change the column contents and the old type is either binary coercible to the new type or an
> unconstrained domain over the new type, a table rewrite is not needed.

Measured on PostgreSQL 17.10 (see lab):

| Change | Rewrites? | Why |
|---|---|---|
| `varchar(n)` → `text` | **No** | binary coercible, dropping a constraint |
| `varchar(100)` → `varchar(200)` | No | widening, no verification needed |
| `text` → `varchar(200)` | **Yes** | every value must be length-checked |
| `int` → `bigint` | **Yes** | 4 bytes to 8 bytes on disk |
| `numeric(10,2)` → `numeric(12,2)` | No | same storage |
| `timestamp` → `timestamptz` | **Yes** | value conversion (and depends on `TimeZone`) |

The `int` → `bigint` case deserves its own warning, because it is the one everybody eventually
hits: a `serial` primary key exhausts at 2,147,483,647, the fix is `bigint`, and the fix rewrites
the largest table you own at exactly the moment it is busiest. Plan it before you need it —
[entry 18](18-unbatched-backfills.md) and MP068 exist for this.

Note also that a rewrite needs free disk for a second complete copy of the table and its indexes.
Running out of space mid-rewrite is a worse incident than the lock.

## Unsafe SQL

```sql
-- Rewrites the entire table and all indexes under ACCESS EXCLUSIVE.
ALTER TABLE events ALTER COLUMN id TYPE bigint;
```

## Safe SQL

There is no in-place safe version. The safe approach is the expand/contract shuffle: build a new
column beside the old one, backfill it, keep the two in sync, then swap.

```sql
-- 1. New column. Metadata only.
SET lock_timeout = '2s';
ALTER TABLE events ADD COLUMN id_new bigint;

-- 2. Keep new writes in sync with a trigger.
CREATE OR REPLACE FUNCTION events_sync_id_new() RETURNS trigger AS $$
BEGIN
  NEW.id_new := NEW.id;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

SET lock_timeout = '2s';
CREATE TRIGGER events_sync_id_new
  BEFORE INSERT OR UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION events_sync_id_new();

-- 3. Backfill historical rows in batches (entry 18). Repeat until zero rows updated:
UPDATE events SET id_new = id
WHERE id IN (SELECT id FROM events WHERE id_new IS NULL ORDER BY id LIMIT 5000);

-- 4. Build the replacement index/constraint without blocking.
CREATE UNIQUE INDEX CONCURRENTLY events_pkey_new ON events (id_new);

-- 5. Enforce NOT NULL without a scan (entry 04).
ALTER TABLE events ADD CONSTRAINT events_id_new_nn CHECK (id_new IS NOT NULL) NOT VALID;
ALTER TABLE events VALIDATE CONSTRAINT events_id_new_nn;
SET lock_timeout = '2s';
ALTER TABLE events ALTER COLUMN id_new SET NOT NULL;
ALTER TABLE events DROP CONSTRAINT events_id_new_nn;

-- 6. Swap, in one brief transaction, after the application can handle the new column.
BEGIN;
SET LOCAL lock_timeout = '2s';
ALTER TABLE events DROP CONSTRAINT events_pkey;
ALTER TABLE events ADD CONSTRAINT events_pkey PRIMARY KEY USING INDEX events_pkey_new;
ALTER TABLE events DROP COLUMN id;
ALTER TABLE events RENAME COLUMN id_new TO id;
COMMIT;
```

Step 6 drops and re-adds a primary key, which has consequences for logical replication — read
[entry 17](17-replication-breaking-ops.md) before running it. The `DROP COLUMN` and `RENAME` in
that step will also break running application code holding cached plans; see
[entries 13](13-drop-column-blast-radius.md) and [15](15-rename-breakage.md).

For a very large table, Doctolib's approach — build the new schema on a replica and cut over with
logical replication — is often less total risk than an in-place shuffle. It is more setup and less
suspense.

## Reproducible lab

Uses `relfilenode` to detect rewrites exactly, rather than inferring from timing.

```bash
docker run --rm -d --name mp-lab -e POSTGRES_PASSWORD=lab -p 55432:5432 postgres:17
until docker exec mp-lab pg_isready -U postgres -q; do sleep 1; done

docker exec -i mp-lab psql -U postgres -X <<'SQL'
CREATE TABLE ty AS
  SELECT g AS id, g::int AS n, g::text AS s FROM generate_series(1,300000) g;
SELECT relfilenode AS before FROM pg_class WHERE relname='ty';

ALTER TABLE ty ALTER COLUMN n TYPE bigint;
SELECT relfilenode AS after_int_to_bigint FROM pg_class WHERE relname='ty';

ALTER TABLE ty ALTER COLUMN s TYPE varchar(200);
SELECT relfilenode AS after_text_to_varchar200 FROM pg_class WHERE relname='ty';

ALTER TABLE ty ALTER COLUMN s TYPE text;
SELECT relfilenode AS after_varchar_to_text FROM pg_class WHERE relname='ty';
SQL

docker rm -f mp-lab
```

Verified output on PostgreSQL 17.10:

```
 before                   | 16429
 after_int_to_bigint      | 16434   <- changed: REWRITE
 after_text_to_varchar200 | 16439   <- changed: REWRITE
 after_varchar_to_text    | 16439   <- unchanged: no rewrite
```

The asymmetry in the last two lines is the useful finding. Going `text` → `varchar(200)` rewrites
the table, because every existing value has to be checked against the new length limit. Going back
`varchar(200)` → `text` is free, because dropping a constraint cannot invalidate any existing
value. Widening is cheap; narrowing is not. See also [entry 20](20-multi-statement-ddl-lock-accumulation.md)
on why bundling several of these into one migration multiplies the damage.

## Public incidents

**Doctolib — How to change a column type in your production's PostgreSQL database** (2021-11-22,
Gauthier Francois). Their `notifications` table reached 1,882,824,827 rows against the `int4`
ceiling of 2,147,483,647 — roughly 90 days of headroom before inserts would start failing. Their
conclusion about the direct approach:

> All strategies requiring the 'ALTER TABLE' command had to be discarded. Indeed, this command
> requires a 'LOCK' on each table as long as the migration operation is not finished.

They migrated via logical replication onto a rebuilt schema instead, and completed with under five
minutes of downtime. This is the clearest published example of a team concluding that `ALTER TABLE`
was simply not available to them at their table size.
<https://medium.com/doctolib/how-to-change-a-column-type-in-your-production-s-postgresql-database-35d6fa194cb8>

**Braintree/PayPal — PostgreSQL at Scale** (2019-02-01, James Coleman). Documents the
expand/contract column-swap approach as standing policy for a payments database.
<https://medium.com/paypal-tech/postgresql-at-scale-database-schema-changes-without-downtime-20d3749ed680>

## How MigrationPilot catches it

- **MP007** (`no-column-type-change`, critical) — flags `ALTER COLUMN ... TYPE` on existing
  columns.
- **MP044** (`no-data-loss-type-narrowing`) — flags narrowing conversions, which rewrite *and* can
  fail partway through on out-of-range data.
- **MP038** (`prefer-bigint-over-int`) — catches the problem at `CREATE TABLE` time, which is the
  only genuinely cheap moment to fix it.

## Confidence

**High** — mechanism quoted from the manual, rewrites proven by relfilenode with captured output
including a negative case, two named public sources with dates.

Last verified 2026-08-11 against PostgreSQL 17.10.
