---
id: MPH-013
title: DROP COLUMN blast radius
rules: [MP017, MP052]
pg_versions: "all supported versions (14–18)"
lock_mode: ACCESS EXCLUSIVE
severity: warning
confidence: High
last_verified: 2026-08-11
verified_against: PostgreSQL 17.10
incidents:
  - name: "PostgreSQL BUG #18325: Possible bug with plpgsql function + ALTER TABLE DROP COLUMN"
    date: "2024-02-02"
    url: "https://www.postgresql.org/message-id/18325-0ea613ec0a06757f%40postgresql.org"
  - name: "Braintree pg_ha_migrations: unsafe_remove_column and application safety"
    date: "2018-10-16"
    url: "https://github.com/braintree/pg_ha_migrations"
---

# DROP COLUMN blast radius

`ALTER TABLE ... DROP COLUMN` is fast. That is the problem — it looks harmless, so it gets waved
through review.

The lock is brief and the data is not rewritten. What breaks is everything *else*: running
application processes with cached query plans, views and functions that referenced the column, and
your ability to undo any of it.

## Affected versions

All supported versions (14–18).

## Mechanism

Three separate mechanisms, and they fail at different times.

**1. The lock is brief but real.** `DROP COLUMN` takes `ACCESS EXCLUSIVE`. It does not rewrite the
table — PostgreSQL marks the column dropped in `pg_attribute` and leaves the data in place — so
the lock is held for milliseconds. But a *brief* `ACCESS EXCLUSIVE` still queues behind any
long-running query and blocks everything behind it while it waits
([entry 02](02-lock-timeout-and-the-lock-queue.md)). Set `lock_timeout` anyway.

**2. Cached plans in live backends break.** This is the one that causes the incident. Application
connections that have prepared a statement against the table hold a cached plan describing the old
column list. Dropping a column invalidates the result type, and the next execution fails:

```
ERROR:  cached plan must not change result type
```

This hits connections that already exist — a connection pool full of long-lived backends, which
is every production application. New connections are fine, which is why the problem looks
intermittent and often "resolves itself" as the pool recycles. It is worst for ORMs that emit
`SELECT *`, because then *every* query's result type changes. PostgreSQL BUG #18325 (2024-02-02)
documents the plpgsql variant of the same invalidation, where a function fails with
`attribute 2 of type record has been dropped` and works again on a fresh connection.

**3. Dependent objects follow the column down — or block it.** Views, functions, indexes,
constraints, triggers, and publications can all reference the column. PostgreSQL refuses the drop
if a view depends on it, unless you add `CASCADE` — and `CASCADE` will then silently drop the view
too ([entry 14](14-drop-table-blast-radius.md)).

**4. It is not reversible.** Re-adding the column gives you a column full of `NULL`s. The old data
is unreachable — it is still physically in the heap, but there is no supported way to get it back.
Rolling back a deploy does not roll back a dropped column.

## Unsafe SQL

```sql
-- Fast, and breaks every pooled connection that has a cached plan for this table.
ALTER TABLE users DROP COLUMN legacy_token;
```

## Safe SQL

The safe version is a sequence across **two deploys**, not a better statement.

```sql
-- Deploy 1: stop using the column in application code. No DDL at all.
--   - Remove every read and write of legacy_token.
--   - If your ORM emits SELECT *, pin the column list explicitly.
--   - Ship it. Let it run. Confirm nothing references the column.
```

Confirm rather than assume, using the database itself:

```sql
-- Anything in the catalog still referencing it?
SELECT dependent_ns.nspname, dependent_view.relname
FROM pg_depend d
JOIN pg_rewrite r ON r.oid = d.objid
JOIN pg_class dependent_view ON dependent_view.oid = r.ev_class
JOIN pg_namespace dependent_ns ON dependent_ns.oid = dependent_view.relnamespace
JOIN pg_class source_table ON source_table.oid = d.refobjid
JOIN pg_attribute a ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
WHERE source_table.relname = 'users' AND a.attname = 'legacy_token';

-- Is anything still querying it? (requires pg_stat_statements)
SELECT calls, query FROM pg_stat_statements
WHERE query ILIKE '%legacy_token%' ORDER BY calls DESC LIMIT 20;
```

```sql
-- Deploy 2, only after deploy 1 has been live long enough to trust:
SET lock_timeout = '2s';
ALTER TABLE users DROP COLUMN legacy_token;
```

If you need the change to be reversible, rename instead of dropping, and drop later:

```sql
-- Reversible, but note it breaks cached plans exactly like a drop (entry 15).
SET lock_timeout = '2s';
ALTER TABLE users RENAME COLUMN legacy_token TO legacy_token_deprecated_20260811;
```

Renaming keeps the data, so a mistake is recoverable. It does not avoid mechanism 2 — a rename
also changes the result type of `SELECT *`. It buys you recoverability, not invisibility.

## Reproducible lab

Reproduces the cached-plan failure, which is the mechanism people do not believe until they see
it.

```bash
docker run --rm -d --name mp-lab -e POSTGRES_PASSWORD=lab -p 55432:5432 postgres:17
until docker exec mp-lab pg_isready -U postgres -q; do sleep 1; done

# All in one session, so the prepared statement's plan is cached and then invalidated.
docker exec -i mp-lab psql -U postgres -X <<'SQL'
CREATE TABLE cp (id int, keep text, doomed text);
INSERT INTO cp VALUES (1,'a','b');

PREPARE s AS SELECT * FROM cp;
EXECUTE s;
EXECUTE s;
EXECUTE s;
EXECUTE s;
EXECUTE s;   -- executed enough times to lock in a generic cached plan

ALTER TABLE cp DROP COLUMN doomed;

EXECUTE s;   -- same session, same prepared statement
SQL

docker rm -f mp-lab
```

Verified output on PostgreSQL 17.10 (final statement):

```
ALTER TABLE
ERROR:  cached plan must not change result type
```

In the lab this is one session, so it is tidy. In production the `ALTER TABLE` comes from your
migration runner and the `EXECUTE` comes from a few hundred pooled application backends that have
been up for hours. They all start failing at once, and they keep failing until the pool recycles —
which is why the graph looks like a step function rather than a spike.

To see the dependency side instead, add a view and try to drop the column:

```bash
docker exec -i mp-lab psql -U postgres -X -c \
  "CREATE VIEW v AS SELECT doomed FROM cp; ALTER TABLE cp DROP COLUMN doomed;"
# ERROR: cannot drop column doomed of table cp because other objects depend on it
```

## Public incidents

**PostgreSQL BUG #18325** (2024-02-02, reported by Antti Risteli, against PostgreSQL 16.1 and
14.10). A plpgsql function that worked before a column drop fails afterwards with:

> ERROR: attribute 2 of type record has been dropped

and — the diagnostic detail that matters — "the function works normally when called from
connections opened *after* the `ALTER TABLE` statement." That is cached-plan invalidation
observable from the outside, and it is why this class of failure looks so confusing during an
incident.
<https://www.postgresql.org/message-id/18325-0ea613ec0a06757f%40postgresql.org>

**Braintree — pg_ha_migrations** (repository public since 2018-10-16). Braintree's migration gem separates database
safety from *application* safety and forces the second to be explicit. Their README:

> dropping a column is unsafe from an application perspective, so we make the application safety
> concerns explicit by using an `unsafe_` prefix

There is no method called `safe_remove_column`. That is a deliberate design statement from a
payments company: there is no version of this operation that is safe by itself, only a version
that is safe because you did the sequencing first.
<https://github.com/braintree/pg_ha_migrations>

## How MigrationPilot catches it

- **MP017** (`no-drop-column`) — flags column drops and asks for the expand/contract sequence.
- **MP052** (`warn-dependent-objects`) — flags every column drop, rename and type change as a
  prompt to go looking. It reads the migration, not the catalog, so it cannot tell you whether a
  dependent view or function actually exists; it hands you the `pg_depend` query to run yourself.

For the `DROP TABLE` and `CASCADE` cases, see [entry 14](14-drop-table-blast-radius.md).

## Confidence

**High** — cached-plan failure reproduced in the lab with captured output, mechanism corroborated
by a PostgreSQL bug report with a date, plus a named engineering artifact from Braintree.

Last verified 2026-08-11 against PostgreSQL 17.10.
