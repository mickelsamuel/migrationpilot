# plan-fix

Some violations have no one-line fix. Making a column `NOT NULL` safely is four
statements. Changing a column's type is a new column, a sync trigger, a batched
backfill, two application releases, and only then a drop. `analyze --fix`
refuses to touch those, and `plan-fix` is what it hands you instead.

```bash
migrationpilot plan-fix migrations/003_email_not_null.sql
migrationpilot plan-fix migration.sql --pg-version 18
migrationpilot plan-fix migration.sql --format json
migrationpilot plan-fix migration.sql --rule MP007
```

Every step is runnable SQL with its own lock note. A **deploy boundary** marks a
point where the database cannot move on until the application has shipped: steps
inside one deploy can all go in the same migration, steps across a boundary
cannot.

## Relationship to `template`

`plan-fix` and [`migrationpilot template`](#) ask for the same thing from
different directions, and neither writes SQL of its own — both render the
choreographies in `src/templates/choreography.ts`:

| | you supply | output |
| --- | --- | --- |
| `template <op> --table t --column c` | the change, as flags | 3 phases: expand / migrate / contract |
| `plan-fix <file>` | a migration file | numbered steps, lock notes, deploy boundaries |

Both take `--pg-version` and follow it the same way.

So `template change-type --table orders --column amount --new-type bigint` and
`plan-fix` on a file containing that `ALTER COLUMN ... TYPE` produce the same
SQL. Use `template` when you are about to write a migration; use `plan-fix` when
you already wrote one and MigrationPilot flagged it.

## Options

| Flag | Meaning |
| --- | --- |
| `--pg-version <n>` | Target PostgreSQL version. The plan changes with it. Defaults to the config value, then 17. |
| `--format <text\|json>` | `text` (default) to read, `json` for tooling. |
| `--rule <ids>` | Only plan these rules, e.g. `--rule MP007,MP011`. |
| `--no-config` | Ignore `.migrationpilotrc.yml`. |

## What it plans

| Pattern | Rules | Steps | Deploys |
| --- | --- | --- | --- |
| `check-then-not-null` | MP002, MP018 | 4 | 1 |
| `pg18-not-null-not-valid` | MP002, MP018 (PG18+), MP081 | 2 | 1 |
| `not-null-scan-guarded` | MP002, MP018 (PG < 12) | 2 | 1 |
| `expand-contract-column-type` | MP007, MP044 | 6–7 | 3 |
| `batched-backfill` | MP011, MP067 | 2 | 1 |
| `index-then-constraint` | MP027 | 2 | 1 |
| `expand-contract-rename` | MP010, MP071 | 5 | 3 |
| `not-valid-then-validate` | MP005, MP030 | 2 | 1 |

MP005 and MP030 are auto-fixable — `--fix` adds the `NOT VALID`. They appear
here too because the `VALIDATE CONSTRAINT` that follows is the part `--fix`
cannot add for you.

`template`'s `split-table` and `remove-column` operations have no entry here:
no rule reports a violation that calls for them, so there is nothing for
`plan-fix` to key off. They stay available through `template`.

### change-type ends two ways

`template` finishes a type change by **swapping** the names — `DROP COLUMN
amount; RENAME COLUMN amount_new TO amount;` in one transaction — so application
code never changes and there is no deploy boundary.

`plan-fix` defaults to **handover** instead: the application moves to
`amount_new` across two releases and the old column is dropped afterwards. Both
are correct, and both are in the shared choreography behind a `strategy` flag.
`plan-fix` picks handover because the deploy boundaries are the whole point of
a plan — the swap hides the coordination inside one transaction that holds two
`ACCESS EXCLUSIVE` changes at once. Each plan's notes point at the other option.

When two rules flag the same statement and land on the same plan, you get one
plan headed `MP002+MP018` rather than the same thing twice.

## The plan changes with the PostgreSQL version

`SET NOT NULL` is the clearest case:

- **PG 18+** — `NOT NULL` constraints live in `pg_constraint`, so one can be
  added `NOT VALID` (instant) and validated afterwards under a lock that allows
  reads and writes. Two steps.
- **PG 12–17** — no native path, so a `CHECK (col IS NOT NULL)` constraint
  stands in as the proof PostgreSQL needs, and the final `SET NOT NULL` is
  instant because it trusts the validated `CHECK`. Four steps.
- **PG < 12** — that shortcut does not exist and the scan is unavoidable. The
  plan is about backfilling first and then taking the scan behind a short
  `lock_timeout`, with a note that upgrading removes the problem.

Batched loops follow the same rule: `COMMIT` inside a `DO` block arrived in
PostgreSQL 11, so before that the plan emits a single statement to repeat from
outside the database rather than SQL that would error.

## Example: `SET NOT NULL` on PostgreSQL 17

```
$ migrationpilot plan-fix migrations/003_email_not_null.sql

  MigrationPilot — expand-contract plan

  File:       migrations/003_email_not_null.sql
  Target:     PostgreSQL 17
  Plans:      1

  ──────────────────────────────────────────────────────────────────
  MP002+MP018 line 2  Make users.email NOT NULL without a blocking scan
  pattern check-then-not-null · 4 steps · 1 deploy
  ──────────────────────────────────────────────────────────────────

  A validated CHECK constraint is proof enough for PostgreSQL 12+, so the
  final SET NOT NULL never scans the table.

  STEP 1  Add the CHECK constraint NOT VALID
    Lock: ACCESS EXCLUSIVE  Runs for: instant
    Held for milliseconds — NOT VALID skips the scan of existing rows.

      SET lock_timeout = '5s';
      ALTER TABLE users
        ADD CONSTRAINT users_email_not_null CHECK (email IS NOT NULL) NOT VALID;

  STEP 2  Validate the constraint
    Lock: SHARE UPDATE EXCLUSIVE  Runs for: minutes
    Reads and writes continue; only other schema changes wait.

      SET lock_timeout = '5s';
      ALTER TABLE users VALIDATE CONSTRAINT users_email_not_null;

  STEP 3  Set NOT NULL — instant, backed by the validated CHECK
    Lock: ACCESS EXCLUSIVE  Runs for: instant
    Held for milliseconds — PostgreSQL 12+ trusts the validated CHECK instead of rescanning.

      SET lock_timeout = '5s';
      ALTER TABLE users ALTER COLUMN email SET NOT NULL;

  STEP 4  Drop the now-redundant CHECK constraint
    Lock: ACCESS EXCLUSIVE  Runs for: instant
    Held for milliseconds — catalog only.

      SET lock_timeout = '5s';
      ALTER TABLE users DROP CONSTRAINT users_email_not_null;

  Notes
    • All four steps are database-only — no application release sits between
      them.
    • If step 2 fails, existing rows are NULL. Backfill them, then re-run
      VALIDATE CONSTRAINT.
    • Steps 3 and 4 must not run before step 2 succeeds, or step 3 falls
      back to a full scan.
```

## Deploy boundaries

A boundary is not decoration. Where one appears, the steps after it will break
running application instances if you run them early.

The column type change is the clearest example. A trigger copies `amount` into
`amount_new` while the backfill catches up, which means the trigger has to
outlive every release that still writes `amount`, and it has to be gone before
any release stops. That is two boundaries, not one:

1. Steps 1–4 — add the column, add the trigger, backfill, verify.
2. **Boundary 1** — ship the release that reads `amount_new` and writes both.
3. Step 5 — drop the trigger. The application's dual writes now keep both correct.
4. **Boundary 2** — ship the release that writes only `amount_new`.
5. Step 6 — drop `amount`.

Dropping the trigger on the wrong side of boundary 2 would let it overwrite
`amount_new` with a stale `amount`. The rename plan has the same shape for the
same reason.

Everything before the first boundary is additive, so a rollback is a `DROP
COLUMN` on something nothing depends on yet.

## Steps that cannot run in a transaction

Steps carry a `transactional` flag, and the text output says
`Must run outside a transaction block` where it is false. Two things trigger it:

- `CREATE INDEX CONCURRENTLY` and friends, which PostgreSQL rejects inside a
  transaction block outright.
- Batched loops, because the `COMMIT` inside the `DO` block needs to be the real
  thing.

If your migration tool wraps every file in `BEGIN`/`COMMIT` — most do — put
those steps in their own file or turn the wrapper off for them.

## JSON output

`--format json` emits the same data for tooling:

```json
{
  "file": "migrations/003_amount_type.sql",
  "pgVersion": 17,
  "plans": [
    {
      "ruleId": "MP007",
      "ruleName": "no-column-type-change",
      "alsoResolves": [],
      "line": 2,
      "pattern": "expand-contract-column-type",
      "title": "Change orders.amount to numeric(12,2) without a table rewrite",
      "summary": "...",
      "deploys": 3,
      "steps": [
        {
          "number": 1,
          "title": "Add amount_new with the new type",
          "sql": "SET lock_timeout = '5s';\nALTER TABLE orders ADD COLUMN amount_new numeric(12,2);",
          "lock": "ACCESS EXCLUSIVE",
          "lockNote": "Held for milliseconds — a nullable column with no default is catalog-only.",
          "duration": "instant",
          "transactional": true,
          "deploy": 1
        }
      ],
      "boundaries": [
        { "afterStep": 4, "reason": "Ship the application release that reads amount_new and writes both..." }
      ],
      "notes": ["..."]
    }
  ],
  "unplanned": [
    { "ruleId": "MP004", "line": 2, "message": "...", "fixClass": "mechanical" }
  ]
}
```

`unplanned` is everything with no plan, tagged with why: `mechanical` means
`analyze --fix` handles it, `unfixable` means a human has to.

## Placeholders

Plans are generated from the migration file alone, so a few things cannot be
filled in and appear as `<...>`:

- The batched backfill's stop condition, when the `UPDATE` assigns something
  volatile like `now()` or assigns several columns at once. A single literal
  assignment does get a real predicate — `WHERE status IS DISTINCT FROM
  'active'` — because that one is safe to derive. A predicate built from `now()`
  would never stop matching and the loop would never exit.
- The type of the new column in a rename, which needs the current schema.
- The batch `DELETE` predicate, which is left open on purpose: the loop as
  written removes everything.

Fill those in before running anything. The loop also needs an index supporting
its predicate, or each batch degrades into a sequential scan.

## Related

- [auto-fix.md](auto-fix.md) — the 20 rules `--fix` rewrites, and why the rest do not qualify.
- `migrationpilot template` — expand-contract skeletons for a change you have not written yet.
- `migrationpilot plan` — what a migration as written will do, statement by statement.
