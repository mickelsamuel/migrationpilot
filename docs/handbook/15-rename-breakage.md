---
id: MPH-015
title: RENAME breaks running application code
rules: [MP010, MP028, MP071]
pg_versions: "all supported versions (14–18)"
lock_mode: ACCESS EXCLUSIVE
severity: warning
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

# RENAME breaks running application code

`ALTER TABLE ... RENAME COLUMN` is instant, holds a lock for microseconds, rewrites nothing, and is
fully reversible. It is also one of the most reliable ways to cause an outage in this handbook.

The problem is not the database. It is that during a rolling deploy there is a window where old
application code and new schema coexist, and old code asks for a column that no longer has that
name.

## Affected versions

All supported versions (14–18). This is not a PostgreSQL defect and no version fixes it — it is a
consequence of deploying application code and schema changes as separate events.

## Mechanism

**The database side is trivial.** `RENAME` takes `ACCESS EXCLUSIVE` and updates one catalog row.
There is no scan and no rewrite. The only database-level risk is the usual one: if it has to wait
for a lock, it blocks everything behind it ([entry 02](02-lock-timeout-and-the-lock-queue.md)).

**The application side is the entire problem.** Consider an ordinary rolling deploy:

| Time | Old pods (still running) | New pods | Schema |
|---|---|---|---|
| T0 | `SELECT email FROM users` ✓ | — | `email` |
| T1 | migration runs | — | `email_address` |
| T2 | `SELECT email FROM users` ✗ | — | `email_address` |
| T3 | `SELECT email FROM users` ✗ | `SELECT email_address` ✓ | `email_address` |
| T4 | — | `SELECT email_address` ✓ | `email_address` |

Between T1 and T4 every request served by an old pod fails with:

```
ERROR:  column "email" does not exist
```

The window is however long your rollout takes — minutes, typically — and it is 100% failure for
the fraction of traffic still on old code. Rolling back the deploy does not help, because the
rollback restores the *old code*, which is the code that is broken.

**Cached plans compound it.** Even for connections whose code is correct, a rename changes the
result type of `SELECT *`, producing `cached plan must not change result type` on existing pooled
connections — the same mechanism as [entry 13](13-drop-column-blast-radius.md).

**Renames also break things outside your application:** views and functions referencing the old
name (PostgreSQL updates view definitions automatically, but your own SQL strings elsewhere are
not so lucky), reporting tools, BI dashboards, ETL jobs, and read-replica consumers.

`ALTER TABLE ... RENAME TO` on a whole table is the same failure with a bigger surface, and
`ALTER TYPE ... RENAME VALUE` on an enum is the same failure for stored values
([entry 10](10-enum-add-value-in-transaction.md)).

## Unsafe SQL

```sql
-- Instant, safe for the database, breaks every running pod that still says "email".
ALTER TABLE users RENAME COLUMN email TO email_address;
```

## Safe SQL

There is no safe single-statement rename. The safe version is expand/contract: both names work at
once, until they do not need to.

```sql
-- Migration 1: add the new column. Metadata only.
SET lock_timeout = '2s';
ALTER TABLE users ADD COLUMN email_address text;

-- Migration 2: keep both columns in sync in both directions, so old code
-- writing `email` and new code writing `email_address` both work.
CREATE OR REPLACE FUNCTION users_sync_email() RETURNS trigger AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    NEW.email_address := NEW.email;
  ELSIF NEW.email_address IS DISTINCT FROM OLD.email_address THEN
    NEW.email := NEW.email_address;
  ELSE
    NEW.email_address := COALESCE(NEW.email_address, NEW.email);
    NEW.email         := COALESCE(NEW.email, NEW.email_address);
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

SET lock_timeout = '2s';
CREATE TRIGGER users_sync_email
  BEFORE INSERT OR UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION users_sync_email();

-- Migration 3: backfill in batches (entry 18). Repeat until zero rows updated:
UPDATE users SET email_address = email
WHERE id IN (SELECT id FROM users WHERE email_address IS NULL AND email IS NOT NULL
             ORDER BY id LIMIT 5000);
```

```sql
-- Deploy: application now reads and writes email_address. Old pods still work,
-- because the trigger keeps `email` populated.
```

```sql
-- Migration 4, a later deploy, once no code references `email`:
DROP TRIGGER users_sync_email ON users;
DROP FUNCTION users_sync_email();
SET lock_timeout = '2s';
ALTER TABLE users DROP COLUMN email;   -- see entry 13 before running this
```

That is four migrations and two deploys to rename a column. It is genuinely that expensive, which
is the real lesson: **the cheapest rename is the one you do not do.** A column with a slightly
wrong name costs less than this sequence. Spend the effort on names at `CREATE TABLE` time, when
they are free.

If the table is small and you can take a maintenance window, a rename inside one is completely
reasonable. The sequence above is for when you cannot.

## Reproducible lab

Simulates the deploy window: a connection holding "old code" against a renamed schema.

```bash
docker run --rm -d --name mp-lab -e POSTGRES_PASSWORD=lab -p 55432:5432 postgres:17
until docker exec mp-lab pg_isready -U postgres -q; do sleep 1; done

docker exec -i mp-lab psql -U postgres -X <<'SQL'
CREATE TABLE users (id int, email text);
INSERT INTO users VALUES (1,'a@example.com');

-- "old application code", plan cached in a live backend
PREPARE old_code AS SELECT * FROM users WHERE id = $1;
EXECUTE old_code(1);
EXECUTE old_code(1);
EXECUTE old_code(1);
EXECUTE old_code(1);
EXECUTE old_code(1);

-- the migration
ALTER TABLE users RENAME COLUMN email TO email_address;

-- old code, still running
EXECUTE old_code(1);
SQL

echo "--- and a fresh connection using the old column name ---"
docker exec -i mp-lab psql -U postgres -X -c "SELECT email FROM users;"

docker rm -f mp-lab
```

Expected: the final `EXECUTE` in the first block fails with
`ERROR: cached plan must not change result type`, and the fresh connection fails with
`ERROR: column "email" does not exist`. Two different errors, same root cause — the deploy window.

Compare [entry 13](13-drop-column-blast-radius.md), where the identical cached-plan failure is
captured in verified output; a rename is a drop and an add as far as the result type is concerned.

## Public incidents

**GoCardless — Zero-downtime Postgres migrations: the hard parts** (page last edited 2024-06).
Their first listed rule, stated as an absolute:

> Don't rename columns/tables which are in use by the app - always copy the data and drop the old
> one once the app is no longer using it

That is the expand/contract sequence above, compressed into one sentence, from a payments company
that took 15 seconds of unexpected API downtime learning these lessons.
<https://gocardless.com/blog/zero-downtime-postgres-migrations-the-hard-parts>

**Braintree/PayPal — PostgreSQL at Scale** (2019-02-01, James Coleman). Braintree's position on
table renames is blunt:

> We avoid table renames almost entirely

<https://medium.com/paypal-tech/postgresql-at-scale-database-schema-changes-without-downtime-20d3749ed680>

Neither source is a postmortem of a rename-caused outage specifically. Both are standing
engineering policy from organisations that run PostgreSQL under payment workloads, published with
dates, and both single this operation out. Graded High on the strength of the mechanism being
reproducible and the policy being explicit and independently arrived at.

## How MigrationPilot catches it

- **MP010** (`no-rename-column`) — flags column renames.
- **MP028** (`no-rename-table`) — flags table renames.
- **MP071** (`ban-rename-in-use-column`) — flags renames of columns that appear to be actively
  referenced, which is the case where the deploy window actually bites.

## Confidence

**High** — mechanism reproducible (the cached-plan half is captured in entry 13's verified output),
two named engineering sources with dates that both call this out explicitly by name.

Last verified 2026-08-11 against PostgreSQL 17.10.
