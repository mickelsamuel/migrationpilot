# The Postgres Migration Safety Handbook

A reference for the schema changes that take production down.

This handbook is framework-neutral. It does not care whether you use Rails, Django, Alembic,
Flyway, Liquibase, Prisma, Ecto, sqlx, or hand-written `.sql` files. Every entry describes a
PostgreSQL behaviour, cites the manual, and gives you a lab you can run yourself in under two
minutes.

It is written by the people who build [MigrationPilot](https://migrationpilot.dev), but it is not
a product manual. Each entry ends with a short note on which MigrationPilot rule catches the
problem, and you can ignore that section entirely and still get everything else. Link these pages
in code review. That is what they are for.

---

## The evidence standard

Most writing about "unsafe migrations" is a chain of blog posts citing blog posts citing a
half-remembered mailing list thread from 2014. Behaviour changes between major versions, the
posts do not, and the advice quietly rots. This handbook tries to avoid that.

Every entry follows these rules:

**1. Version claims are pinned to release notes.**
When an entry says a behaviour changed in PostgreSQL 12, it links the PostgreSQL 12 release notes
item that changed it. "Recent versions of Postgres" is not a version claim, and you will not find
that phrasing here.

**2. Lock claims are pinned to the manual.**
Lock modes and conflict pairs come from
[13.3. Explicit Locking](https://www.postgresql.org/docs/current/explicit-locking.html) and the
relevant command reference page — not from another blog post. Where a lock level is unusual
(`ADD FOREIGN KEY` taking `SHARE ROW EXCLUSIVE` rather than `ACCESS EXCLUSIVE`, say), the entry
quotes the manual directly.

**3. Every entry has a lab you can run.**
Not pseudocode. A copy-paste script that starts a real PostgreSQL in Docker, reproduces the block
or the error, prints the evidence, and cleans up after itself. If the lab does not demonstrate the
failure, the entry is wrong and should be filed as a bug against this handbook.

**4. Incidents are real, dated, and fetched.**
Every entry in an `incidents:` list is a public postmortem, engineering blog post, bug report, or
issue tracker item that was opened and read while writing the entry. Each one has a name, a date,
and a URL.

Where no public incident exists, the entry says exactly this:

> No public postmortem located as of 2026-08.

That sentence is not a failure. It is the honest state of the evidence, and it is more useful than
a plausible-sounding story. **No incident in this handbook is invented, composited, or inferred.**

A note on what got excluded: searches for migration postmortems surface a large volume of
generated content — Medium and Substack posts with precise-sounding but unverifiable details
("the migration took 4 hours and 12 minutes, costing $48,000 in revenue") and no named company,
author, or artifact. None of it is cited here. If a source could not be traced to an identifiable
engineer or organisation, it was dropped.

**5. Confidence is graded, not implied.**

| Grade | Means |
|---|---|
| **High** | Mechanism documented in the manual **and** a runnable lab **and** at least one named public incident |
| **Medium** | Mechanism documented in the manual **and** a runnable lab, but no public incident located |

There is no "Low". An entry that cannot clear Medium does not belong in the handbook.

**6. Everything carries a verification date.**
Each entry has `last_verified`. When you read one, check that date against the PostgreSQL version
you actually run. Locking behaviour is not a constant.

---

## How to cite this handbook

In a pull request:

```markdown
This adds a unique constraint on a table with 40M rows, which takes ACCESS EXCLUSIVE for
the duration of the scan. See the handbook entry on unique constraint scans:
docs/handbook/09-unique-constraint-scan.md — the CREATE UNIQUE INDEX CONCURRENTLY +
ADD CONSTRAINT ... USING INDEX pattern gets the same guarantee without the outage.
```

Cite the entry, not the handbook. The entry has the lab in it, and a reviewer who does not believe
you can run the lab.

If you are citing this from outside the repository, use the entry `id` from the front matter
(`MPH-009`), which is stable across renames.

---

## Reading an entry

Every entry has the same eight sections, in the same order:

| Section | What it answers |
|---|---|
| Affected versions | Does this apply to the PostgreSQL I actually run? |
| Mechanism | Which lock, blocking what, and why — with manual links |
| Unsafe SQL | The migration that causes the problem |
| Safe SQL | The complete, runnable replacement |
| Reproducible lab | Prove it to yourself in under two minutes |
| Public incidents | Who this has actually happened to |
| How MigrationPilot catches it | The rule IDs, if you want tooling |
| Confidence | Grade and last-verified date |

---

## Running the labs

Every lab is self-contained and assumes only Docker. The shared preamble is:

```bash
# Start a throwaway PostgreSQL. Nothing here touches your real databases.
docker run --rm -d --name mp-lab \
  -e POSTGRES_PASSWORD=lab \
  -e POSTGRES_HOST_AUTH_METHOD=trust \
  -p 55432:5432 postgres:17

# Wait for it to accept connections
until docker exec mp-lab pg_isready -U postgres -q; do sleep 1; done

# Convenience alias used by every lab below
q() { docker exec -i mp-lab psql -U postgres -v ON_ERROR_STOP=1 -X -q "$@"; }
```

And the shared teardown:

```bash
docker rm -f mp-lab
```

Labs that need a specific major version say so and pin the image tag (`postgres:12`,
`postgres:18`). Labs that demonstrate blocking use background shell jobs to hold sessions open;
each one prints the contents of `pg_locks` or `pg_stat_activity` so you can see the wait rather
than infer it.

Two labs are destructive by design (they demonstrate `DROP` blast radius). They run entirely
inside the throwaway container.

---

## Entries

| # | Entry | Lock mode | Severity | Confidence |
|---|---|---|---|---|
| 01 | [Non-concurrent index creation](01-non-concurrent-index-creation.md) | `SHARE` | critical | High |
| 02 | [Missing lock_timeout and the lock queue](02-lock-timeout-and-the-lock-queue.md) | `ACCESS EXCLUSIVE` | critical | High |
| 03 | [SET NOT NULL and the full table scan](03-set-not-null-full-scan.md) | `ACCESS EXCLUSIVE` | critical | High |
| 04 | [The CHECK-then-NOT NULL pattern](04-check-then-not-null.md) | `ACCESS EXCLUSIVE` / `SHARE UPDATE EXCLUSIVE` | critical | High |
| 05 | [PostgreSQL 18: NOT NULL NOT VALID](05-pg18-not-null-not-valid.md) | `ACCESS EXCLUSIVE` / `SHARE UPDATE EXCLUSIVE` | warning | Medium |
| 06 | [Volatile defaults and table rewrites](06-volatile-defaults-and-rewrites.md) | `ACCESS EXCLUSIVE` | critical | High |
| 07 | [ALTER COLUMN TYPE rewrites](07-alter-column-type-rewrite.md) | `ACCESS EXCLUSIVE` | critical | High |
| 08 | [Foreign keys without NOT VALID](08-foreign-key-without-not-valid.md) | `SHARE ROW EXCLUSIVE` | critical | High |
| 09 | [Unique constraint scans](09-unique-constraint-scan.md) | `ACCESS EXCLUSIVE` | critical | Medium |
| 10 | [ALTER TYPE ... ADD VALUE in a transaction](10-enum-add-value-in-transaction.md) | n/a (statement error) | critical | High |
| 11 | [CONCURRENTLY inside a transaction block](11-concurrently-inside-transaction.md) | n/a (statement error) | critical | High |
| 12 | [Invalid indexes after a failed CONCURRENTLY](12-invalid-index-after-failed-concurrently.md) | `SHARE UPDATE EXCLUSIVE` | warning | High |
| 13 | [DROP COLUMN blast radius](13-drop-column-blast-radius.md) | `ACCESS EXCLUSIVE` | warning | High |
| 14 | [DROP TABLE and CASCADE blast radius](14-drop-table-blast-radius.md) | `ACCESS EXCLUSIVE` | critical | Medium |
| 15 | [RENAME breaks running application code](15-rename-breakage.md) | `ACCESS EXCLUSIVE` | warning | High |
| 16 | [Long transactions versus DDL](16-long-transactions-vs-ddl.md) | `ACCESS EXCLUSIVE` | critical | High |
| 17 | [Replication-breaking operations](17-replication-breaking-ops.md) | `ACCESS EXCLUSIVE` / `SHARE ROW EXCLUSIVE` | critical | High |
| 18 | [Unbatched backfills](18-unbatched-backfills.md) | `ROW EXCLUSIVE` | warning | High |
| 19 | [Partition ATTACH and DETACH](19-partition-attach-detach.md) | `ACCESS EXCLUSIVE` / `SHARE UPDATE EXCLUSIVE` | critical | High |
| 20 | [Multi-statement DDL and lock accumulation](20-multi-statement-ddl-lock-accumulation.md) | `ACCESS EXCLUSIVE` | critical | High |

---

## The three rules that prevent most of this

If you read nothing else:

1. **Set `lock_timeout` on every migration session.** A migration that fails to acquire a lock in
   two seconds and aborts is a deploy you retry. A migration that waits is an outage. Entry 02.
2. **Never let a DDL statement wait behind a long-running query.** The DDL will not just wait — it
   will queue every subsequent query on that table behind itself. Entries 02 and 16.
3. **Separate the lock from the work.** Almost every safe pattern in this handbook is the same
   move: take a brief lock to record an intention (`NOT VALID`, `CONCURRENTLY`, a new column), then
   do the expensive part under a weak lock. Entries 04, 08, 09.

---

## Validating this handbook

```bash
node docs/handbook/validate.mjs
```

Zero dependencies, no install step. It parses every entry's front matter, checks it against the
schema, verifies the eight required sections are present and in order, checks that every rule ID
referenced actually exists in `src/rules/`, checks that every entry with a `High` confidence grade
has at least one incident, and checks that the index table above lists every entry file.

CI should run it. A handbook that drifts from its own evidence standard is worse than no handbook.

---

## Contributing an entry

The bar is the evidence standard above, in full. Concretely, a new entry needs:

- A lock claim traceable to the manual, not to another blog post.
- A lab that fails on the unsafe SQL and passes on the safe SQL, runnable by someone with only
  Docker installed.
- Either a real dated incident with a working URL, or the "No public postmortem located" sentence.
  Not a paraphrase of either.
- A `last_verified` date and the PostgreSQL version you verified against.

If you find an entry that is wrong — a lock level that changed, a lab that no longer reproduces, a
dead incident link — that is a bug, and a fix for it is more valuable than a new entry.
