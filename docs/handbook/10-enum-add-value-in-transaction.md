---
id: MPH-010
title: ALTER TYPE ... ADD VALUE in a transaction
rules: [MP012, MP054, MP024, MP060]
pg_versions: "behaviour changed in 12; error on 11 and earlier, restricted use on 12–18"
lock_mode: "n/a (statement error)"
severity: critical
confidence: High
last_verified: 2026-08-11
verified_against: PostgreSQL 17.10
incidents:
  - name: "rails/rails issue #9483: ALTER TYPE ... ADD VALUE doesn't work in migration"
    date: "2013-02-28"
    url: "https://github.com/rails/rails/issues/9483"
  - name: "prisma/prisma issue #5290: ALTER TYPE enum migrations fail in PostgreSQL"
    date: "2021-01-26"
    url: "https://github.com/prisma/prisma/issues/5290"
  - name: "typeorm/typeorm issue #1169: PostgreSQL migrations ALTER TYPE ADD VALUE transaction error"
    date: "2017-11-12"
    url: "https://github.com/typeorm/typeorm/issues/1169"
---

# ALTER TYPE ... ADD VALUE in a transaction

Adding a value to an enum is the smallest schema change there is, and it breaks more migration
frameworks than anything else in this handbook — because almost every framework wraps migrations
in a transaction by default, and this statement has rules about transactions.

The behaviour changed in PostgreSQL 12, so half the advice you will find online describes a
restriction that no longer exists, and the other half misses the restriction that replaced it.

## Affected versions

Three distinct eras:

| Versions | Behaviour |
|---|---|
| ≤ 10 | `ALTER TYPE ... ADD VALUE` **cannot** run in a transaction block at all |
| 11 | Allowed only if the enum type was created in the same transaction |
| **12 – 18** | Allowed in a transaction block, but the new value **cannot be used** until it commits |

The relaxation, from the
[PostgreSQL 12 release notes](https://www.postgresql.org/docs/release/12.0/):

> Allow enumerated values to be added more flexibly (Andrew Dunstan, Tom Lane, Thomas Munro)
> Previously, `ALTER TYPE ... ADD VALUE` could not be called in a transaction block, unless it was
> part of the same transaction that created the enumerated type. Now it can be called in a later
> transaction, so long as the new enumerated value is not referenced until after it is committed.

Every supported version (14–18) is in the third row. So if you are on a supported PostgreSQL, the
old `cannot run inside a transaction block` error is **not** what you will hit. You will hit
`unsafe use of new value`, which is a different problem with a different fix.

## Mechanism

An enum value's existence is catalog state in `pg_enum`. Before PostgreSQL 12, the restriction was
blanket: enum additions could not be rolled back safely alongside other work, so they were banned
from transaction blocks outright, producing:

```
ERROR:  ALTER TYPE ... ADD cannot run inside a transaction block
```

PostgreSQL 12 made the addition transactional but kept a narrower guard: an uncommitted enum value
cannot be *referenced*, because other backends cannot see it and the comparison machinery cannot
safely order it. Using it in the same transaction gives:

```
ERROR:  unsafe use of new value "angry" of enum type mood
HINT:  New enum values must be committed before they can be used.
```

The practical failure is a migration that does both things at once — a very natural thing to
write:

```sql
BEGIN;
ALTER TYPE order_status ADD VALUE 'refunded';
UPDATE orders SET status = 'refunded' WHERE ...;   -- fails here
COMMIT;
```

That is two migrations, not one, on every version of PostgreSQL.

Two related enum facts worth knowing while you are here:

- **You cannot remove an enum value.** There is no `ALTER TYPE ... DROP VALUE` in any version. If
  you might ever need to retire a value, a lookup table with a foreign key is the better modelling
  choice, and MP024 flags removal attempts.
- **`ALTER TYPE ... RENAME VALUE`** exists (PostgreSQL 10+) but is a breaking change for any
  running application code that writes the old spelling — same class of problem as
  [entry 15](15-rename-breakage.md). MP060 covers it.

## Unsafe SQL

```sql
-- Fails on PG 12-18 with "unsafe use of new value".
-- Fails on PG <= 11 with "cannot run inside a transaction block".
BEGIN;
ALTER TYPE order_status ADD VALUE 'refunded';
UPDATE orders SET status = 'refunded' WHERE refunded_at IS NOT NULL;
COMMIT;
```

## Safe SQL

Split it into two migrations that commit separately.

```sql
-- Migration 1: add the value. Nothing else in this migration.
-- In Rails: disable_ddl_transactions!
-- In Django: atomic = False
-- In Alembic: run outside the transaction, or use an autocommit block.
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'refunded';
```

```sql
-- Migration 2: use it. Runs after migration 1 has committed.
UPDATE orders SET status = 'refunded' WHERE refunded_at IS NOT NULL;
```

`IF NOT EXISTS` (PostgreSQL 9.6+) makes migration 1 idempotent, which matters because a failed
deploy will often re-run it.

If you would rather avoid the whole category — and on a table where the set of values changes over
time, you should — use a lookup table instead:

```sql
CREATE TABLE order_statuses (status text PRIMARY KEY);
INSERT INTO order_statuses VALUES ('pending'), ('shipped'), ('refunded');

ALTER TABLE orders
  ADD CONSTRAINT orders_status_fkey
  FOREIGN KEY (status) REFERENCES order_statuses (status) NOT VALID;
```

Adding a status is then an `INSERT`, removing one is a `DELETE`, and neither is a schema migration.

## Reproducible lab

```bash
docker run --rm -d --name mp-lab -e POSTGRES_PASSWORD=lab -p 55432:5432 postgres:17
until docker exec mp-lab pg_isready -U postgres -q; do sleep 1; done

# The failure: add and use in the same transaction
docker exec -i mp-lab psql -U postgres -X <<'SQL'
CREATE TYPE mood AS ENUM ('happy','sad');
BEGIN;
ALTER TYPE mood ADD VALUE 'angry';
SELECT 'angry'::mood;
COMMIT;
SQL

# The fix: let it commit first
docker exec -i mp-lab psql -U postgres -X <<'SQL'
CREATE TYPE mood2 AS ENUM ('happy','sad');
BEGIN; ALTER TYPE mood2 ADD VALUE 'angry'; COMMIT;
SELECT 'angry'::mood2 AS works_after_commit;
SQL

docker rm -f mp-lab
```

Verified output on PostgreSQL 17.10.

The failing case:

```
BEGIN
ALTER TYPE
ERROR:  unsafe use of new value "angry" of enum type mood
LINE 1: SELECT 'angry'::mood;
               ^
HINT:  New enum values must be committed before they can be used.
ROLLBACK
```

Note the final `ROLLBACK`: the whole transaction died, so the enum value was not added either. A
framework that reports "migration failed" here has left you with no new value and, if it retries
the same combined migration, no path forward.

The fixed case:

```
BEGIN
ALTER TYPE
COMMIT
 works_after_commit
--------------------
 angry
```

To see the pre-12 error instead, re-run the first block against `postgres:11`.

## Public incidents

These are framework bug trackers rather than outage postmortems, which is the honest shape of the
evidence for this failure: it breaks deploys, not production traffic.

**rails/rails issue #9483** (opened 2013-02-28, reporter @antage). Rails wraps migrations in a
transaction by default, so any enum addition failed:

> ALTER TYPE ... ADD cannot run inside a transaction block: ALTER TYPE model_size ADD VALUE
> 'new_value'

Reported against Rails 3.2.12 and PostgreSQL 9.2; addressed via PR #9507. The `disable_ddl_transactions!`
escape hatch is the standing fix.
<https://github.com/rails/rails/issues/9483>

**prisma/prisma issue #5290** (opened 2021-01-26, reporter @defrex). Prisma 2.14 batched several
`ALTER TYPE` statements into one transaction and hit the same error; the workaround was one
`ALTER TYPE` per migration.
<https://github.com/prisma/prisma/issues/5290>

**typeorm/typeorm issue #1169** (opened 2017-11-12, reporter @romanszedzielorz). TypeORM wrapped
migrations in `START TRANSACTION`; PostgreSQL returned SQLSTATE `25001` on
`ALTER TYPE public.item_type ADD VALUE 'b' AFTER 'a';`.
<https://github.com/typeorm/typeorm/issues/1169>

The pattern across three unrelated ORMs, over roughly a decade, is the point: this is not a
framework bug, it is a PostgreSQL rule that transaction-wrapping migration tools collide with by
default.

## How MigrationPilot catches it

- **MP012** (`no-enum-add-value-in-transaction`) — "ALTER TYPE ... ADD VALUE cannot run inside a
  transaction block on PG < 12. Even on PG 12+, enum modifications take ACCESS EXCLUSIVE on the
  type."
- **MP054** (`alter-type-add-value-in-transaction`, critical) — the version-aware rule: "will fail
  on PG < 12, and on PG 12+ the new value is not visible until COMMIT." This is the one that
  catches the `unsafe use of new value` case.
- **MP024** (`no-enum-value-removal`) — flags attempts to remove enum values, which PostgreSQL
  cannot do.
- **MP060** (`alter-type-rename-value`, critical) — flags renames, which break running application
  code.

## Confidence

**High** — mechanism quoted from the PostgreSQL 12 release notes, both failure modes reproduced in
the lab with captured output, three named dated public issues across independent frameworks.

Last verified 2026-08-11 against PostgreSQL 17.10.
