---
id: MPH-014
title: DROP TABLE and CASCADE blast radius
rules: [MP026, MP022, MP034, MP035, MP036]
pg_versions: "all supported versions (14–18)"
lock_mode: ACCESS EXCLUSIVE
severity: critical
confidence: Medium
last_verified: 2026-08-11
verified_against: PostgreSQL 17.10
incidents: []
---

# DROP TABLE and CASCADE blast radius

`DROP TABLE` is the only operation in this handbook with no recovery path. Everything else here
costs you availability; this one costs you data.

`CASCADE` makes it worse in a specific way: it converts a statement that would have *failed safely*
into one that silently destroys objects you did not name and cannot enumerate afterwards.

## Affected versions

All supported versions (14–18).

## Mechanism

**The lock.** `DROP TABLE` takes `ACCESS EXCLUSIVE`, listed in
[13.3. Explicit Locking](https://www.postgresql.org/docs/current/explicit-locking.html) among the
commands that acquire it. As with any `ACCESS EXCLUSIVE` statement, if it has to wait it blocks
every subsequent query on that table behind it ([entry 02](02-lock-timeout-and-the-lock-queue.md)).
This is the least of your problems here.

**The dependency refusal is a feature.** Without `CASCADE`, PostgreSQL refuses to drop a table that
other objects depend on:

```
ERROR:  cannot drop table orders because other objects depend on it
DETAIL:  constraint order_items_order_id_fkey on table order_items depends on table orders
HINT:  Use DROP ... CASCADE to drop the dependent objects too.
```

That error is the database telling you your change is bigger than you think. The `HINT` is
unfortunate, because the reflexive response is to paste `CASCADE` onto the end and re-run, which
suppresses the warning rather than addressing it.

**What CASCADE actually removes.** Per
[DROP TABLE](https://www.postgresql.org/docs/current/sql-droptable.html), `CASCADE` automatically
drops objects that depend on the table, and objects that depend on *those*, transitively: views,
foreign key constraints on other tables, sequences owned by its columns, triggers, and rules. You
find out what was destroyed by reading the `NOTICE` output — which most migration runners discard.

**Transactional, but only until commit.** `DROP TABLE` is transactional in PostgreSQL, so a
`ROLLBACK` genuinely undoes it. After `COMMIT` there is no undo: no recycle bin, no flashback
query. Recovery means point-in-time restore of the whole cluster.

**Related statements with the same shape.** `DROP DATABASE` and `DROP SCHEMA ... CASCADE` are the
same failure at larger radius, and neither is transactional in the useful sense —
`DROP DATABASE` cannot run inside a transaction block at all. `TRUNCATE ... CASCADE` truncates
every table connected by foreign keys, which surprises people who expect it to behave like a
bulk `DELETE`.

## Unsafe SQL

```sql
-- Destroys the table, plus every view, FK, and trigger that depended on it,
-- reporting what it destroyed only in NOTICE output your migration runner throws away.
DROP TABLE orders CASCADE;
```

## Safe SQL

Find out what depends on it, **before** you decide:

```sql
-- Everything that depends on this table, named.
SELECT DISTINCT
       dependent.relkind AS kind,
       dependent_ns.nspname || '.' || dependent.relname AS dependent_object
FROM pg_depend d
JOIN pg_class dependent ON dependent.oid = d.objid
JOIN pg_namespace dependent_ns ON dependent_ns.oid = dependent.relnamespace
WHERE d.refobjid = 'orders'::regclass
  AND d.deptype IN ('n','a')
  AND dependent.oid <> 'orders'::regclass;

-- Foreign keys pointing at it from other tables.
SELECT conrelid::regclass AS referencing_table, conname
FROM pg_constraint
WHERE confrelid = 'orders'::regclass;
```

Then retire the table in stages, so that every step is reversible until the last one:

```sql
-- Stage 1: prove nothing uses it. Rename rather than drop.
--   Anything still referencing "orders" now fails loudly and immediately,
--   and recovery is a rename back.
SET lock_timeout = '2s';
ALTER TABLE orders RENAME TO orders_deprecated_20260811;

-- Stage 2: wait. A full business cycle — month-end, quarterly jobs, that annual report.

-- Stage 3: keep the data outside the database, then drop.
--   $ pg_dump -t orders_deprecated_20260811 -Fc mydb > orders_20260811.dump
SET lock_timeout = '2s';
DROP TABLE orders_deprecated_20260811;   -- note: no CASCADE
```

Deliberately no `CASCADE` in stage 3. If it fails on a dependency, something still references the
table and you want to know that before it is gone. `CASCADE` should be a considered decision after
reading the dependency list, never a reflex after reading the `HINT`.

If you genuinely need `CASCADE`, capture what it did:

```sql
BEGIN;
DROP TABLE orders CASCADE;   -- read the NOTICE output now
-- ... check the NOTICEs. If anything named surprises you:
ROLLBACK;
-- otherwise:
-- COMMIT;
```

Because `DROP TABLE` is transactional, this dry-run pattern works, and it is the only way to see
the true blast radius before committing to it.

## Reproducible lab

```bash
docker run --rm -d --name mp-lab -e POSTGRES_PASSWORD=lab -p 55432:5432 postgres:17
until docker exec mp-lab pg_isready -U postgres -q; do sleep 1; done

docker exec -i mp-lab psql -U postgres -X <<'SQL'
CREATE TABLE orders (id int PRIMARY KEY);
CREATE TABLE order_items (
  id int PRIMARY KEY,
  order_id int REFERENCES orders(id)
);
CREATE VIEW recent_orders AS SELECT * FROM orders;

-- 1. Without CASCADE: PostgreSQL protects you.
DROP TABLE orders;

-- 2. With CASCADE, inside a transaction so we can inspect and undo.
BEGIN;
DROP TABLE orders CASCADE;
SELECT 'view still here?' AS q, count(*) FROM pg_class WHERE relname='recent_orders';
SELECT 'FK still here?' AS q, count(*) FROM pg_constraint
  WHERE conname='order_items_order_id_fkey';
ROLLBACK;

-- 3. Rolled back, so everything is back.
SELECT 'after rollback' AS q, count(*) FROM pg_class WHERE relname='orders';
SQL

docker rm -f mp-lab
```

Verified output on PostgreSQL 17.10:

```
ERROR:  cannot drop table orders because other objects depend on it
DETAIL:  constraint order_items_order_id_fkey on table order_items depends on table orders
view recent_orders depends on table orders
HINT:  Use DROP ... CASCADE to drop the dependent objects too.

NOTICE:  drop cascades to 2 other objects
DETAIL:  drop cascades to constraint order_items_order_id_fkey on table order_items
drop cascades to view recent_orders

        q         | count
------------------+-------
 view still here? |     0

       q        | count
----------------+-------
 FK still here? |     0

       q        | count
----------------+-------
 after rollback |     1
```

Three things worth noting. The refusal names *exactly* what depends on the table — it is a free
dependency report, and it is the most useful output in this lab. The `CASCADE` reports its damage
as a `NOTICE`, not a warning or an error, so anything that captures only stderr-level severity or
discards `NOTICE` output loses the record of what was destroyed. And the rollback genuinely
restores everything, which is what makes the dry-run pattern above worth using.

## Public incidents

No public postmortem located as of 2026-08.

This is a genuine gap rather than an absence of incidents. Data-destruction events are the least
likely class of failure to be written up publicly — they involve customer data loss, and the
write-up is usually a legal document rather than an engineering blog post. GitLab's well-known
2017 database incident is often cited in this space, but its root cause was an operator removing a
data directory during replication troubleshooting, not a migration `DROP` statement, so citing it
here would be misleading. Graded Medium accordingly.

If you know of a published postmortem where a migration's `DROP TABLE` or `CASCADE` destroyed
production data, it belongs in this entry.

## How MigrationPilot catches it

- **MP026** (`ban-drop-table`, critical) — flags `DROP TABLE` outright.
- **MP022** (`no-drop-cascade`) — flags `CASCADE`, the modifier that turns a safe failure into a
  silent one.
- **MP034** (`ban-drop-database`, critical) and **MP035** (`ban-drop-schema`, critical) — the same
  failure at larger radius.
- **MP036** (`ban-truncate-cascade`, critical) — `TRUNCATE ... CASCADE` follows foreign keys into
  tables you did not name.

For dropping a single column, see [entry 13](13-drop-column-blast-radius.md).

## Confidence

**Medium** — mechanism documented in the command reference, lab reproduces both the protective
refusal and the `CASCADE` blast radius, but no public postmortem located.

Last verified 2026-08-11 against PostgreSQL 17.10.
