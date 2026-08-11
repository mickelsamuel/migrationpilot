---
id: MPH-008
title: Foreign keys without NOT VALID
rules: [MP005, MP069, MP016]
pg_versions: "9.5 and later take SHARE ROW EXCLUSIVE; all supported versions (14–18)"
lock_mode: SHARE ROW EXCLUSIVE
severity: critical
confidence: High
last_verified: 2026-08-11
verified_against: PostgreSQL 17.10
incidents:
  - name: "GitLab.com production incident #6642: Post Deploy migrations Failure on Auto-Deploy"
    date: "2022-03-18"
    url: "https://gitlab.com/gitlab-com/gl-infra/production/-/issues/6642"
  - name: "GitLab.com production incident #21712: Deadlock error while executing post deploy migration"
    date: "2026-04-06"
    url: "https://gitlab.com/gitlab-com/gl-infra/production/-/work_items/21712"
  - name: "Braintree/PayPal: PostgreSQL at Scale — Database Schema Changes Without Downtime"
    date: "2019-02-01"
    url: "https://medium.com/paypal-tech/postgresql-at-scale-database-schema-changes-without-downtime-20d3749ed680"
---

# Foreign keys without NOT VALID

Adding a foreign key scans the whole child table to verify every existing row has a matching
parent — and it takes locks on **two** tables while it does. The locks are weaker than most people
assume, which makes this entry more interesting than "add `NOT VALID`".

## Affected versions

All supported versions (14–18) take `SHARE ROW EXCLUSIVE`. The reduction from `ACCESS EXCLUSIVE`
landed in PostgreSQL 9.5, which reduced lock levels for some create/alter trigger and foreign key
commands (Simon Riggs, Andreas Karlsson) —
[PostgreSQL 9.5 release notes](https://www.postgresql.org/docs/release/9.5.0/). Every supported
version is well past that.

## Mechanism

The [ALTER TABLE manual](https://www.postgresql.org/docs/current/sql-altertable.html) calls out
the exception explicitly:

> Although most forms of `ADD table_constraint` require an `ACCESS EXCLUSIVE` lock, `ADD FOREIGN
> KEY` requires only a `SHARE ROW EXCLUSIVE` lock.

`SHARE ROW EXCLUSIVE`, per
[13.3. Explicit Locking](https://www.postgresql.org/docs/current/explicit-locking.html):

> Conflicts with the `ROW EXCLUSIVE`, `SHARE UPDATE EXCLUSIVE`, `SHARE`, `SHARE ROW EXCLUSIVE`,
> `EXCLUSIVE`, and `ACCESS EXCLUSIVE` lock modes. This mode protects a table against concurrent
> data changes, and is self-exclusive so that only one session can hold it at a time.

So the practical picture:

- **Reads are not blocked.** `ACCESS SHARE` does not conflict. `SELECT`s keep working.
- **Writes are blocked** on both tables, because `ROW EXCLUSIVE` conflicts.
- The lock is held for the whole verification scan of the child table.

Two consequences that catch people out:

**It locks the parent too.** The referenced table also gets `SHARE ROW EXCLUSIVE`. Adding a foreign
key to a small child table that references `users` blocks writes to `users` — usually the busiest
table you have. This is what MP069 exists for.

**Two tables means deadlock risk.** Because the statement takes locks on two tables, and your
application takes locks on the same two tables in whatever order its queries happen to run, adding
a foreign key under load is a deadlock waiting to happen. GitLab hit exactly this in April 2026
(below).

The fix is the same shape as [entry 04](04-check-then-not-null.md): `NOT VALID` first, then
`VALIDATE CONSTRAINT`, which per the manual

> acquires only a `SHARE UPDATE EXCLUSIVE` lock on the table being altered. (If the constraint is a
> foreign key then a `ROW SHARE` lock is also required on the table referenced by the constraint.)

`SHARE UPDATE EXCLUSIVE` on the child and `ROW SHARE` on the parent both permit ordinary writes. So
the scan — the long part — costs you nothing in availability.

One more thing, unrelated to locks but the reason half of these migrations cause an incident later:
**PostgreSQL does not create an index on the referencing column.** Every `DELETE` or key `UPDATE`
on the parent then has to sequential-scan the child to check the constraint. Add the index
yourself, concurrently.

## Unsafe SQL

```sql
-- Scans all of orders, holding SHARE ROW EXCLUSIVE on BOTH orders and customers.
-- Writes to both tables blocked for the duration.
ALTER TABLE orders
  ADD CONSTRAINT orders_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES customers (id);
```

## Safe SQL

```sql
-- 1. Index the referencing column first, or every parent delete becomes a seq scan.
CREATE INDEX CONCURRENTLY idx_orders_customer_id ON orders (customer_id);

-- 2. Add the constraint without the scan. Brief SHARE ROW EXCLUSIVE on both tables.
SET lock_timeout = '2s';
ALTER TABLE orders
  ADD CONSTRAINT orders_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES customers (id)
  NOT VALID;

-- 3. Clean up orphaned rows in batches, if any. New rows are already enforced.

-- 4. Validate. SHARE UPDATE EXCLUSIVE on orders, ROW SHARE on customers.
--    Both allow writes. This is the long step and it is safe.
ALTER TABLE orders VALIDATE CONSTRAINT orders_customer_id_fkey;
```

Steps 2 and 4 must be separate transactions. Validating inside the transaction that created the
constraint holds the strong lock across both and buys you nothing.

## Reproducible lab

```bash
docker run --rm -d --name mp-lab -e POSTGRES_PASSWORD=lab -p 55432:5432 postgres:17
until docker exec mp-lab pg_isready -U postgres -q; do sleep 1; done
q() { docker exec -i mp-lab psql -U postgres -X -q "$@"; }

q -c "CREATE TABLE customers AS SELECT g AS id FROM generate_series(1,200000) g;
      ALTER TABLE customers ADD PRIMARY KEY (id);
      CREATE TABLE orders AS SELECT g AS id, g AS customer_id FROM generate_series(1,200000) g;"

# What locks does the plain ADD FOREIGN KEY take, and on which tables?
q -c "BEGIN;
      ALTER TABLE orders ADD CONSTRAINT fk FOREIGN KEY (customer_id) REFERENCES customers(id);
      SELECT c.relname, l.mode, l.granted
      FROM pg_locks l JOIN pg_class c ON c.oid = l.relation
      WHERE c.relname IN ('orders','customers') AND l.mode <> 'AccessShareLock'
      ORDER BY c.relname, l.mode;
      ROLLBACK;"

# Now the NOT VALID form, and what VALIDATE takes afterwards
q -c "BEGIN;
      ALTER TABLE orders ADD CONSTRAINT fk2 FOREIGN KEY (customer_id)
        REFERENCES customers(id) NOT VALID;
      SELECT c.relname, l.mode FROM pg_locks l JOIN pg_class c ON c.oid = l.relation
      WHERE c.relname IN ('orders','customers') AND l.mode <> 'AccessShareLock'
      ORDER BY c.relname;
      COMMIT;"

q -c "BEGIN;
      ALTER TABLE orders VALIDATE CONSTRAINT fk2;
      SELECT c.relname, l.mode FROM pg_locks l JOIN pg_class c ON c.oid = l.relation
      WHERE c.relname IN ('orders','customers') AND l.mode <> 'AccessShareLock'
      ORDER BY c.relname;
      COMMIT;"

docker rm -f mp-lab
```

Verified output on PostgreSQL 17.10.

Plain `ADD FOREIGN KEY`:

```
  relname   |         mode          | granted
------------+-----------------------+---------
 customers  | RowShareLock          | t
 customers  | ShareRowExclusiveLock | t
 orders     | ShareRowExclusiveLock | t
```

`ShareRowExclusiveLock` on **both** tables. That is the surprise, and the reason a foreign key
migration can block writes to a table the migration does not appear to touch — the child table is
in the `ALTER TABLE`, but `customers` is the one your whole application writes to.

After `VALIDATE CONSTRAINT` on the `NOT VALID` form:

```
  relname   |           mode
------------+--------------------------
 customers  | RowShareLock
 orders     | ShareUpdateExclusiveLock
```

Neither of these blocks ordinary writes. `ROW SHARE` conflicts only with `EXCLUSIVE` and
`ACCESS EXCLUSIVE`; `SHARE UPDATE EXCLUSIVE` does not conflict with `ROW EXCLUSIVE`. The expensive
scan happens here, under locks that let traffic through.

To watch the blocking directly, hold `BEGIN; INSERT INTO customers ...;` open in another session
and run the unsafe form with `SET lock_timeout='2s'` — it aborts rather than completing.

## Public incidents

**GitLab.com production incident #6642** (2022-03-18). A migration converting the
`ci_builds`–`runner_id` foreign key stalled:

> A database migration which requires an exclusive lock on two tables is unable to complete. This
> is blocking auto-deploy from completing.

87 minutes (18:36–20:13 UTC), resolved by manually marking the migration applied. Note "two
tables" — the parent-table lock is exactly the mechanism described above.
<https://gitlab.com/gitlab-com/gl-infra/production/-/issues/6642>

**GitLab.com production incident #21712** (2026-04-06). A post-deploy migration
"attempting to add a foreign key to a partitioned CI table" failed on a deadlock:

> The deadlock was triggered by locking conflicts with application queries during high traffic

Resolved by skipping the migration, marking it applied, and retrying. No customer-facing impact —
the failure landed on the deployment pipeline, not the site. This is the two-table deadlock risk
described above, on a partitioned table where the lock count multiplies
([entry 19](19-partition-attach-detach.md)).
<https://gitlab.com/gitlab-com/gl-infra/production/-/work_items/21712>

**Braintree/PayPal — PostgreSQL at Scale** (2019-02-01, James Coleman). Documents the `NOT VALID`
path:

> `ALTER TABLE ... ADD FOREIGN KEY ... NOT VALID`: Adds the foreign key and begins enforcing the
> constraint for all new `INSERT/UPDATE` statements but does not validate that all existing rows
> conform.

<https://medium.com/paypal-tech/postgresql-at-scale-database-schema-changes-without-downtime-20d3749ed680>

## How MigrationPilot catches it

- **MP005** (`require-not-valid-foreign-key`, critical) — flags `ADD FOREIGN KEY` without
  `NOT VALID`.
- **MP069** (`warn-fk-lock-both-tables`) — flags that the referenced table is locked too, which is
  the part reviewers miss.
- **MP016** (`require-index-on-fk`) — flags a foreign key with no index on the referencing column.

## Confidence

**High** — lock levels quoted from the manual, lab shows the locks on both tables, three named
public sources including two dated GitLab production incidents.

Last verified 2026-08-11 against PostgreSQL 17.10.
