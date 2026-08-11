---
id: MPH-005
title: "PostgreSQL 18: NOT NULL NOT VALID"
rules: [MP081, MP082]
pg_versions: "18 and later"
lock_mode: "ACCESS EXCLUSIVE (brief) / SHARE UPDATE EXCLUSIVE (validation)"
severity: warning
confidence: Medium
last_verified: 2026-08-11
verified_against: PostgreSQL 18.4
incidents: []
---

# PostgreSQL 18: NOT NULL NOT VALID

PostgreSQL 18 removed the need for the `CHECK`-constraint dance in
[entry 04](04-check-then-not-null.md). You can now add the `NOT NULL` constraint itself as
`NOT VALID` and validate it separately — one constraint instead of two, and no scaffolding to
remember to drop.

This entry exists mostly to give you the **correct syntax**, because it is not the syntax most
people guess, and guessing produces a parse error rather than a silent problem.

## Affected versions

PostgreSQL 18 and later, only. On 14–17 use [entry 04](04-check-then-not-null.md).

Two [PostgreSQL 18 release note](https://www.postgresql.org/docs/release/18.0/) items combine here.
The enabling change:

> Store column `NOT NULL` specifications in `pg_constraint` (Álvaro Herrera, Bernd Helmle)
> This allows names to be specified for `NOT NULL` constraint. This also adds `NOT NULL`
> constraints to foreign tables and `NOT NULL` inheritance control to local tables.

And the feature itself:

> Allow `ALTER TABLE` to set the `NOT VALID` attribute of `NOT NULL` constraints
> (Rushabh Lathia, Jian He)

Because `NOT NULL` is now a real catalog constraint with a name, it can carry `NOT VALID` and be
validated later, exactly like a `CHECK` or foreign key.

## Mechanism

Same two-phase shape as [entry 04](04-check-then-not-null.md), with one less moving part.

Phase 1 adds a constraint row with `convalidated = false`. The constraint is enforced against all
new inserts and updates from that moment; it makes no claim about existing rows, so no scan is
needed and `ACCESS EXCLUSIVE` is held only long enough to write the catalog row.

Phase 2 is `VALIDATE CONSTRAINT`, which per the
[ALTER TABLE manual](https://www.postgresql.org/docs/current/sql-altertable.html)

> acquires only a `SHARE UPDATE EXCLUSIVE` lock on the table being altered

and reads existing rows while traffic continues.

The new `NOT NULL` constraints appear in `pg_constraint` with `contype = 'n'`, which is how you
tell them apart from `CHECK` (`'c'`) constraints.

### The syntax, precisely

The form people expect does **not** exist:

```sql
-- ERROR: syntax error at or near "NOT"
ALTER TABLE t ALTER COLUMN val SET NOT NULL NOT VALID;
```

Verified against PostgreSQL 18.4. `NOT VALID` is an attribute of a *named constraint*, so it
attaches to `ADD CONSTRAINT`, not to `SET NOT NULL`. Likewise there is no `VALIDATE NOT NULL`
form — validation goes through `VALIDATE CONSTRAINT` by name, as for any other constraint.

## Unsafe SQL

```sql
-- Scans the whole table under ACCESS EXCLUSIVE, on 18 exactly as on 14.
ALTER TABLE orders ALTER COLUMN customer_id SET NOT NULL;
```

## Safe SQL

```sql
-- 1. Add the NOT NULL constraint as NOT VALID. No scan; brief ACCESS EXCLUSIVE.
SET lock_timeout = '2s';
ALTER TABLE orders
  ADD CONSTRAINT orders_customer_id_nn NOT NULL customer_id NOT VALID;

-- 2. Clean up pre-existing NULLs in batches (entry 18). New NULLs already rejected.

-- 3. Validate. Scans under SHARE UPDATE EXCLUSIVE; reads and writes continue.
ALTER TABLE orders VALIDATE CONSTRAINT orders_customer_id_nn;
```

That is the whole migration. There is no step 4 and no scaffolding constraint to drop — after
validation the column is genuinely `NOT NULL` and `\d orders` shows it as such.

## Reproducible lab

```bash
docker run --rm -d --name mp-lab18 -e POSTGRES_PASSWORD=lab -p 55433:5432 postgres:18
until docker exec mp-lab18 pg_isready -U postgres -q; do sleep 1; done

docker exec -i mp-lab18 psql -U postgres -X <<'SQL'
CREATE TABLE nn18 AS SELECT g AS id, g::text AS val FROM generate_series(1,2000000) g;

-- The syntax everyone tries first. It does not parse.
ALTER TABLE nn18 ALTER COLUMN val SET NOT NULL NOT VALID;

\timing on
-- The real thing: NOT VALID attaches to a named constraint.
ALTER TABLE nn18 ADD CONSTRAINT nn18_val_nn NOT NULL val NOT VALID;
\timing off
SELECT conname, contype, convalidated FROM pg_constraint WHERE conrelid='nn18'::regclass;

\timing on
ALTER TABLE nn18 VALIDATE CONSTRAINT nn18_val_nn;
\timing off
SELECT conname, contype, convalidated FROM pg_constraint WHERE conrelid='nn18'::regclass;
\d nn18
SQL

docker rm -f mp-lab18
```

Verified output on PostgreSQL 18.4, 2,000,000 rows:

```
ERROR:  syntax error at or near "NOT"
LINE 1: ALTER TABLE nn18 ALTER COLUMN val SET NOT NULL NOT VALID;
                                                       ^
ALTER TABLE
Time: 2.211 ms            <- ADD CONSTRAINT ... NOT NULL val NOT VALID

   conname   | contype | convalidated
-------------+---------+--------------
 nn18_val_nn | n       | f            <- constraint exists, not yet validated

ALTER TABLE
Time: 78.254 ms           <- VALIDATE CONSTRAINT (scan, SHARE UPDATE EXCLUSIVE)

   conname   | contype | convalidated
-------------+---------+--------------
 nn18_val_nn | n       | t

                Table "public.nn18"
 Column |  Type   | Collation | Nullable | Default
--------+---------+-----------+----------+---------
 id     | integer |           |          |
 val    | text    |           | not null |     <- genuinely NOT NULL
```

2.211 ms under `ACCESS EXCLUSIVE`, then 78.254 ms of scanning under a lock that does not block
traffic. Compare [entry 03](03-set-not-null-full-scan.md), where the naive form on the same row
count spent 80.019 ms under `ACCESS EXCLUSIVE`.

## Public incidents

No public postmortem located as of 2026-08.

This is expected: PostgreSQL 18 was released in September 2025, and the failure mode here is a
parse error at migration time rather than a production outage. A migration using the wrong syntax
does not deploy at all, which is the good kind of failure. The entry is graded Medium accordingly.

## How MigrationPilot catches it

- **MP081** (`prefer-pg18-not-null-not-valid`, warning) — on PostgreSQL 18+, detects the older
  `CHECK (col IS NOT NULL) NOT VALID` workaround and suggests the native constraint instead.
- **MP082** (`warn-not-enforced-constraint`) — related PostgreSQL 18 surface: the same release
  added `NOT ENFORCED` constraints ("Allow `CHECK` and foreign key constraints to be specified as
  `NOT ENFORCED`"), which look similar to `NOT VALID` and mean something very different. A
  `NOT VALID` constraint *is* enforced going forward; a `NOT ENFORCED` one is not enforced at all.

> **Known defect, MigrationPilot ≤ v1.5.1:** MP081's suggested fix emits
> `ALTER TABLE t ALTER COLUMN c SET NOT NULL NOT VALID;` followed by
> `ALTER TABLE t VALIDATE NOT NULL c;`. Both statements are syntax errors on PostgreSQL 18.4
> (verified 2026-08-11). The detection is correct; only the suggested replacement text is wrong.
> On any release up to v1.5.1, use the syntax in this entry's *Safe SQL* section instead, and treat
> MP081's output as a prompt rather than a patch. The advice has since been corrected on `main` —
> MP081, and the PG18 branches of MP002 and MP018, now emit the named-constraint form shown above —
> and ships in the next release.

## Confidence

**Medium** — mechanism documented in the PostgreSQL 18 release notes and the manual, lab verified
against PostgreSQL 18.4 including the negative case, but no public incident located.

Last verified 2026-08-11 against PostgreSQL 18.4.
