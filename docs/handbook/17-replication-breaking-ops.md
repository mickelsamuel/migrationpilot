---
id: MPH-017
title: Replication-breaking operations
rules: [MP055, MP064]
pg_versions: "all supported versions (14–18)"
lock_mode: "ACCESS EXCLUSIVE (DROP CONSTRAINT) / SHARE ROW EXCLUSIVE (DISABLE TRIGGER)"
severity: critical
confidence: High
last_verified: 2026-08-11
verified_against: PostgreSQL 17.10
incidents:
  - name: "matrix-org/synapse issue #16224: All tables should have a REPLICA IDENTITY available"
    date: "2023-09-02"
    url: "https://github.com/matrix-org/synapse/issues/16224"
---

# Replication-breaking operations

Two migrations that look local to one table, and are not: dropping a primary key, and disabling
triggers. Both are safe on a standalone database and both break things badly when logical
replication is involved — CDC pipelines, blue/green upgrades, read replicas feeding a warehouse,
`pglogical`, Debezium.

The failure is not subtle. Dropping a primary key on a published table makes **every subsequent
`UPDATE` and `DELETE` on it fail**, immediately, for the whole application.

## Affected versions

All supported versions (14–18). The replica identity requirement has applied to logical
replication since it was introduced in PostgreSQL 10.

## Mechanism

### Dropping a primary key

Logical replication ships row changes by identity, not by physical location, so the subscriber
needs a way to name the row being changed. From
[29.1. Publication](https://www.postgresql.org/docs/current/logical-replication-publication.html):

> A published table must have a *replica identity* configured in order to be able to replicate
> `UPDATE` and `DELETE` operations, so that appropriate rows to update or delete can be identified
> on the subscriber side.

> By default, this is the primary key, if there is one.

And when it is missing:

> Tables with a replica identity defined as `NOTHING`, `DEFAULT` without a primary key, or
> `USING INDEX` with a dropped index, cannot support `UPDATE` or `DELETE` operations when included
> in a publication replicating these actions. Attempting such operations will result in an error on
> the publisher.

Note **"an error on the publisher"** — this is the crucial part. The failure does not quietly
degrade replication; it rejects writes on your primary database. Your application starts throwing
errors on every update.

`REPLICA IDENTITY DEFAULT` means "use the primary key". Dropping the primary key does not change
the setting — `relreplident` stays `'d'` — it just means the setting now points at nothing.

`INSERT` continues to work, per the same page: "INSERT operations can proceed regardless of any
replica identity." So the symptom is partial: new rows fine, edits and deletes broken. That makes
it look like an application bug rather than a schema change.

This matters for [entry 07](07-alter-column-type-rewrite.md), whose primary-key swap drops and
re-adds a constraint — do that on a published table without planning and you get this failure
between the two statements.

### Disabling triggers

`ALTER TABLE ... DISABLE TRIGGER` is often used to speed up a bulk load. Per the
[ALTER TABLE manual](https://www.postgresql.org/docs/current/sql-altertable.html), the lock is
milder than most DDL:

> This command acquires a `SHARE ROW EXCLUSIVE` lock.

Which blocks writes but not reads. The lock is not the problem. What it disables is:

- **Foreign key enforcement.** FK constraints are implemented as system triggers. `DISABLE TRIGGER
  ALL` turns them off, so a bulk load can insert rows that violate referential integrity. The
  constraints still *exist*, so nothing revalidates them when you re-enable. You now have a
  database that believes it is consistent and is not.
- **Audit and history triggers.** Anything you rely on for compliance stops recording, silently.
- **Replication behaviour**, where `ENABLE REPLICA` / `ENABLE ALWAYS` semantics decide what fires
  on a subscriber.

`DISABLE TRIGGER USER` leaves system triggers (and thus FK enforcement) alone, which is the safer
variant if you truly need this.

## Unsafe SQL

```sql
-- On a table in a publication: every subsequent UPDATE and DELETE fails.
ALTER TABLE orders DROP CONSTRAINT orders_pkey;

-- Silently permits referential integrity violations that nothing will re-check.
ALTER TABLE orders DISABLE TRIGGER ALL;
COPY orders FROM '/tmp/bulk.csv';
ALTER TABLE orders ENABLE TRIGGER ALL;
```

## Safe SQL

**Before touching a primary key, establish an alternative identity first.**

```sql
-- 0. Is this table published at all?
SELECT p.pubname FROM pg_publication p
JOIN pg_publication_rel pr ON pr.prpubid = p.oid
WHERE pr.prrelid = 'orders'::regclass;

-- 1. Build a replacement unique index. Must be UNIQUE, NOT NULL, and not partial.
CREATE UNIQUE INDEX CONCURRENTLY orders_uuid_key ON orders (uuid);
ALTER TABLE orders ALTER COLUMN uuid SET NOT NULL;   -- via entry 04 if the table is large

-- 2. Point replica identity at it BEFORE dropping the primary key.
SET lock_timeout = '2s';
ALTER TABLE orders REPLICA IDENTITY USING INDEX orders_uuid_key;

-- 3. Now the primary key can go without breaking writes.
SET lock_timeout = '2s';
ALTER TABLE orders DROP CONSTRAINT orders_pkey;

-- 4. Verify. 'd'=default(PK)  'i'=index  'f'=full  'n'=nothing
SELECT relreplident FROM pg_class WHERE relname = 'orders';
```

`REPLICA IDENTITY FULL` is the fallback when there is no unique index. It works, but it sends the
entire old row for every update and forces the subscriber to match on all columns — expensive on
wide tables, and it makes the subscriber do a sequential scan per change. Use it knowingly.

**For bulk loads, prefer narrowing to widening.**

```sql
-- Only disable your own triggers; leave FK enforcement on.
SET lock_timeout = '2s';
ALTER TABLE orders DISABLE TRIGGER USER;

COPY orders FROM '/tmp/bulk.csv';

ALTER TABLE orders ENABLE TRIGGER USER;
```

If you must disable FK enforcement, drop the constraint and re-add it `NOT VALID`, then
`VALIDATE` — that way the data actually gets checked afterwards
([entry 08](08-foreign-key-without-not-valid.md)), instead of being assumed correct forever.

## Reproducible lab

```bash
docker run --rm -d --name mp-lab -e POSTGRES_PASSWORD=lab -p 55432:5432 postgres:17
until docker exec mp-lab pg_isready -U postgres -q; do sleep 1; done

docker exec -i mp-lab psql -U postgres -X <<'SQL'
CREATE TABLE repl (id int PRIMARY KEY, val text);
INSERT INTO repl VALUES (1,'a'),(2,'b');
CREATE PUBLICATION pub_repl FOR TABLE repl;

SELECT relreplident FROM pg_class WHERE relname='repl';   -- 'd' = default (the PK)
UPDATE repl SET val='c' WHERE id=1;                       -- works

ALTER TABLE repl DROP CONSTRAINT repl_pkey;
SELECT relreplident FROM pg_class WHERE relname='repl';   -- still 'd', now pointing at nothing

UPDATE repl SET val='d' WHERE id=2;                       -- fails
SQL

docker exec -i mp-lab psql -U postgres -X -c "DELETE FROM repl WHERE id=2;"
docker exec -i mp-lab psql -U postgres -X -c "INSERT INTO repl VALUES (9,'z');"
docker exec -i mp-lab psql -U postgres -X -c \
  "BEGIN; ALTER TABLE repl DISABLE TRIGGER ALL;
   SELECT mode FROM pg_locks l JOIN pg_class c ON c.oid=l.relation WHERE c.relname='repl';
   ROLLBACK;"

docker rm -f mp-lab
```

Verified output on PostgreSQL 17.10:

```
 relreplident |  d          <- before: default, backed by the primary key
 UPDATE 1                   <- update works
 ALTER TABLE                <- primary key dropped
 relreplident |  d          <- unchanged setting, now pointing at nothing

ERROR:  cannot update table "repl" because it does not have a replica identity and publishes updates
HINT:  To enable updating the table, set REPLICA IDENTITY using ALTER TABLE.

ERROR:  cannot delete from table "repl" because it does not have a replica identity and publishes deletes
HINT:  To enable deleting from the table, set REPLICA IDENTITY using ALTER TABLE.

INSERT 0 1                  <- inserts still succeed

         mode
-----------------------
 ShareRowExclusiveLock     <- DISABLE TRIGGER, as documented
```

The `INSERT 0 1` between two errors is the detail to remember. A table in this state accepts new
rows and rejects every edit, which reads like an application bug and sends people looking in the
wrong place.

(The lab prints a `WARNING: "wal_level" is insufficient to publish logical changes` when creating
the publication, because the default image runs `wal_level=replica`. That is expected and does not
affect the demonstration — the publisher-side check that breaks your writes does not require a
subscriber to exist.)

## Public incidents

**matrix-org/synapse issue #16224** (opened 2023-09-02, reporter @reivilibre). Synapse tried to
use logical replication to migrate a database and discovered 59 tables without a usable replica
identity. The concrete failure:

> cannot delete from table "device_inbox" because it does not have a replica identity and
> publishes deletes

with the user-facing consequence that

> basic features like `/sync` to stop working (as it deletes from `device_inbox` at least)

This is the same error the lab reproduces, on a real product, breaking a core user-facing endpoint.
Synapse's proposed fix — set `REPLICA IDENTITY` on all tables and add a lint to keep it that way —
is exactly the preventative posture this entry argues for.
<https://github.com/matrix-org/synapse/issues/16224>

Note that Synapse arrived here via tables that never had primary keys, rather than via a migration
that dropped one. The mechanism and the error are identical; the trigger differs. No public
postmortem was located for the specific case of a migration dropping a primary key on a published
table.

## How MigrationPilot catches it

- **MP055** (`drop-pk-replica-identity-break`, critical) — "Dropping a primary key breaks logical
  replication unless REPLICA IDENTITY is explicitly set."
- **MP064** (`ban-disable-trigger`, critical) — "DISABLE TRIGGER breaks replication, audit logs,
  and FK enforcement."

## Confidence

**High** — mechanism quoted from the logical replication documentation, both failures reproduced
in the lab with captured output including the asymmetric `INSERT` behaviour, one named dated public
issue showing real user-facing impact.

Last verified 2026-08-11 against PostgreSQL 17.10.
