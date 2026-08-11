---
id: MPH-011
title: CONCURRENTLY inside a transaction block
rules: [MP025, MP008]
pg_versions: "all supported versions (14–18)"
lock_mode: "n/a (statement error)"
severity: critical
confidence: High
last_verified: 2026-08-11
verified_against: PostgreSQL 17.10
incidents:
  - name: "Braintree/PayPal: PostgreSQL at Scale — Database Schema Changes Without Downtime"
    date: "2019-02-01"
    url: "https://medium.com/paypal-tech/postgresql-at-scale-database-schema-changes-without-downtime-20d3749ed680"
  - name: "GitLab.com production incident #6198: failing post-deploy-migration is blocking gprd deployments"
    date: "2022-01-20"
    url: "https://gitlab.com/gitlab-com/gl-infra/production/-/issues/6198"
---

# CONCURRENTLY inside a transaction block

Every safe-migration guide tells you to use `CREATE INDEX CONCURRENTLY`. Almost none of them
mention that your migration framework will wrap it in a transaction and PostgreSQL will refuse to
run it.

This is a good failure — it happens at deploy time, loudly, before any damage. It is in the
handbook because the *fix* has a trap: turning off the transaction wrapper means your migration is
no longer atomic, and a half-applied migration is a real problem.

## Affected versions

All supported versions (14–18), and every version that has had `CONCURRENTLY`. This is a
permanent design constraint, not a limitation awaiting a fix.

## Mechanism

`CONCURRENTLY` variants work by splitting their job across multiple internal transactions: build
the index against a snapshot, wait for older transactions to drain, scan again to catch what
changed, then mark the index valid. Waiting for other transactions to finish is impossible from
inside a transaction that is itself still open — it would wait on itself.

So [`CREATE INDEX`](https://www.postgresql.org/docs/current/sql-createindex.html) states the
restriction plainly, and PostgreSQL enforces it:

```
ERROR:  CREATE INDEX CONCURRENTLY cannot run inside a transaction block
```

The same applies to `DROP INDEX CONCURRENTLY`, `REINDEX CONCURRENTLY`,
`REFRESH MATERIALIZED VIEW CONCURRENTLY` (which does run in a transaction, but has its own rules),
and `ALTER TABLE ... DETACH PARTITION ... CONCURRENTLY`
([entry 19](19-partition-attach-detach.md)).

Braintree's description is the concise one:

> `CREATE INDEX CONCURRENTLY ...` may not be executed inside of a transaction but does maintain
> transactions internally.

### The trap in the fix

Frameworks give you a switch: `disable_ddl_transactions!` (Rails), `atomic = False` (Django),
autocommit blocks (Alembic). Flipping it solves the error and creates a new obligation: **that
migration no longer rolls back.** If it contains three statements and the second fails, the first
one stayed.

So the rule is not "disable transactions on migrations". It is:

> A migration with `CONCURRENTLY` in it should contain **only** that statement, and must be
> written so that re-running it after a failure is safe.

That second clause matters because `CONCURRENTLY` fails more often than ordinary DDL — it waits on
other transactions, so it is the statement most likely to hit a timeout — and it leaves an invalid
index behind when it does ([entry 12](12-invalid-index-after-failed-concurrently.md)).

There is a related failure worth knowing: statements that require a transaction, run in a
migration where transactions were disabled. `LOCK TABLE` is the common one — it is only meaningful
inside a transaction, and PostgreSQL rejects it outside one with
`LOCK TABLE can only be used in transaction blocks`. That is precisely how GitLab's January 2022
deploy broke.

## Unsafe SQL

```sql
-- Whatever your framework wraps around this, the result is:
--   ERROR: CREATE INDEX CONCURRENTLY cannot run inside a transaction block
BEGIN;
CREATE INDEX CONCURRENTLY idx_orders_customer_id ON orders (customer_id);
COMMIT;
```

Equally unsafe, for the opposite reason — transactions disabled, multiple statements, no
atomicity:

```sql
-- (transaction wrapper disabled)
CREATE INDEX CONCURRENTLY idx_orders_customer_id ON orders (customer_id);
ALTER TABLE orders ADD COLUMN notes text;      -- if this fails, the index still exists
ALTER TABLE orders ADD COLUMN tags text[];     -- and now state is half-applied
```

## Safe SQL

One statement, no transaction, idempotent on retry:

```sql
-- Rails:   disable_ddl_transactions!
-- Django:  atomic = False
-- Alembic: with op.get_context().autocommit_block():
--
-- Nothing else belongs in this migration.

SET lock_timeout = '5s';

-- Clear any invalid index left by a previous failed attempt (entry 12).
DROP INDEX CONCURRENTLY IF EXISTS idx_orders_customer_id;

CREATE INDEX CONCURRENTLY idx_orders_customer_id ON orders (customer_id);
```

Put everything else in a separate, ordinary, transactional migration:

```sql
-- Normal migration, transaction wrapper left ON.
BEGIN;
SET LOCAL lock_timeout = '2s';
ALTER TABLE orders ADD COLUMN notes text, ADD COLUMN tags text[];
COMMIT;
```

Note the deliberate `DROP INDEX CONCURRENTLY IF EXISTS` before the create, rather than
`CREATE INDEX CONCURRENTLY IF NOT EXISTS`. The reasoning is in
[entry 12](12-invalid-index-after-failed-concurrently.md) and it is not intuitive:
`IF NOT EXISTS` will happily "succeed" over a broken index.

## Reproducible lab

```bash
docker run --rm -d --name mp-lab -e POSTGRES_PASSWORD=lab -p 55432:5432 postgres:17
until docker exec mp-lab pg_isready -U postgres -q; do sleep 1; done

docker exec -i mp-lab psql -U postgres -X -q -c \
  "CREATE TABLE orders AS SELECT g AS id FROM generate_series(1,1000) g;"

echo "--- CONCURRENTLY inside a transaction ---"
docker exec -i mp-lab psql -U postgres -X <<'SQL'
BEGIN;
CREATE INDEX CONCURRENTLY idx_bad ON orders (id);
COMMIT;
SQL

echo "--- LOCK TABLE outside a transaction ---"
docker exec -i mp-lab psql -U postgres -X -c "LOCK TABLE orders IN ACCESS EXCLUSIVE MODE;"

echo "--- the working form ---"
docker exec -i mp-lab psql -U postgres -X -c \
  "CREATE INDEX CONCURRENTLY idx_ok ON orders (id);"

docker rm -f mp-lab
```

Verified output on PostgreSQL 17.10 for the first block:

```
BEGIN
ERROR:  CREATE INDEX CONCURRENTLY cannot run inside a transaction block
ROLLBACK
```

The second block produces `ERROR: LOCK TABLE can only be used in transaction blocks` — the
mirror-image failure, and the one that broke GitLab's deploy pipeline. The third succeeds.

## Public incidents

**GitLab.com production incident #6198** (2022-01-20). Post-deploy migration
`20220110224913_remove_dast_scanner_profiles_builds_ci_build_id_fk` failed against one of GitLab's
busiest tables with:

> LOCK TABLE can only be used in transaction blocks

Three retries failed; the team manually marked the migration complete at 15:00 UTC to unblock
deployments, and deferred the foreign key removal to a low-traffic window. Roughly four hours of
blocked deploys. This is the inverse of the `CONCURRENTLY` error — a statement that *requires* a
transaction, in a migration configured without one — and it shows that the transaction-wrapper
switch cuts both ways.
<https://gitlab.com/gitlab-com/gl-infra/production/-/issues/6198>

**Braintree/PayPal — PostgreSQL at Scale** (2019-02-01, James Coleman). Documents the constraint
and the internal-transaction reason for it.
<https://medium.com/paypal-tech/postgresql-at-scale-database-schema-changes-without-downtime-20d3749ed680>

## How MigrationPilot catches it

- **MP025** (`ban-concurrent-in-transaction`, critical) — "CONCURRENTLY operations (CREATE INDEX,
  DROP INDEX, REINDEX) cannot run inside a transaction block. PostgreSQL will raise an ERROR at
  runtime."
- **MP008** (`no-multi-ddl-transaction`, critical) — the other half: catches migrations bundling
  several DDL statements together, which is what makes a non-transactional migration dangerous.
  See [entry 20](20-multi-statement-ddl-lock-accumulation.md).

## Confidence

**High** — restriction documented in the command reference, both error messages reproduced in the
lab with captured output, one dated production incident plus one named engineering source.

Last verified 2026-08-11 against PostgreSQL 17.10.
