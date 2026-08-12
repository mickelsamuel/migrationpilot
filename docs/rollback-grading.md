# Rollback Grading: can you get back?

`migrationpilot rollback` generates the reverse SQL. Grading answers the question you actually ask before merging: **if this goes wrong at 2am, can we get back?**

Every migration `analyze` and `check` look at now carries a grade.

| Grade | Meaning |
|---|---|
| **GREEN** | Every statement has an exact inverse. Run the down migration and you're where you started. |
| **YELLOW** | Reversible with care. Something the reverse can't restore from the migration alone — an index definition, a default expression, a constraint body — but no row data is destroyed. |
| **RED** | Irreversible. Undoing it can't bring the data back. |

The grade is the worst statement in the file. One `DROP COLUMN` in an otherwise clean migration makes the whole file RED, which is correct: that's the statement that decides whether you can roll back.

## What lands where

### GREEN

`CREATE TABLE` · `CREATE INDEX` · `CREATE VIEW` · `CREATE SEQUENCE` · `CREATE SCHEMA` · `CREATE EXTENSION` · `CREATE TRIGGER` · `ADD COLUMN` · `SET NOT NULL` · `SET DEFAULT` · `ADD CONSTRAINT` · `RENAME COLUMN` · `RENAME TABLE` · `ENABLE`/`DISABLE ROW LEVEL SECURITY` · `ALTER TYPE ... RENAME VALUE` · `SET`/`RESET` · `BEGIN`/`COMMIT`

Each of these has an inverse that puts the schema back exactly. Adding something is undone by dropping the thing you added.

### YELLOW

| Statement | Why care |
|---|---|
| `DROP INDEX` | Recreatable, but the definition isn't in this migration — it's in source control |
| `DROP VIEW` / `DROP SEQUENCE` / `DROP TRIGGER` / `DROP FUNCTION` | Same: a definition, not data |
| `DROP CONSTRAINT` | The body isn't recorded, and re-adding it fails if violating rows were written meanwhile |
| `DROP DEFAULT` | The previous default expression isn't recorded anywhere |
| `DROP NOT NULL` | Re-applying it fails if any row went NULL while the constraint was off |
| `ALTER COLUMN TYPE` (widening) | The original type isn't recorded, so the reverse cast is a hand-written one |
| `ALTER TYPE ... ADD VALUE` | PostgreSQL can't remove an enum value. Undoing it means a new type, a data migration, and dropping the old one |
| `UPDATE` | Backfilling a new column is undone by dropping it; overwriting an existing column isn't |
| `INSERT` | The rows have to be deleted by a `WHERE` clause you write |
| Anything with no generated reverse | Flagged so it can't pass as clean |

### RED

| Statement | Why irreversible |
|---|---|
| `DROP TABLE` | The rows are gone. A down migration recreates the shape, never the data |
| `DROP MATERIALIZED VIEW` | Same |
| `DROP SCHEMA` | Everything in it |
| `DROP DATABASE` | Everything, full stop |
| `DROP COLUMN` | Re-adding the column gives you NULLs |
| `TRUNCATE` | Empties the table with no way back |
| `DELETE` | Deleted rows can't be restored by a down migration |
| `ALTER COLUMN TYPE` (narrowing) | Values that no longer fit are truncated, and the originals are unrecoverable. Same signal [MP044](rules/MP044.md) reports per statement |
| `DROP TYPE`/`DROP DOMAIN ... CASCADE` | CASCADE drops every column declared with the type, values included |

A narrowing target is a smaller integer or float type (`smallint`, `integer`, `real`) or a length-capped character type (`varchar(n)`, `char(n)`). The AST only carries the new type, so a narrowing is inferred from the target — the same limitation MP044 has.

Note what's **not** RED: `DROP INDEX ... CASCADE` and `DROP VIEW ... CASCADE`. CASCADE on those only reaches other definitions. [MP022](rules/MP022.md) covers the general CASCADE warning.

## Where the classification lives

There's one source of truth: the rollback generator. Each reversal in `src/generator/rollback.ts` carries its own verdict — `clean`, `care` or `irreversible` — and the grader in `src/generator/grade.ts` only rolls those up. The generated down migration and the grade can't disagree, because they're the same decision read twice.

## Companion down migrations

RED with a hand-written down migration is a deliberate choice. RED with nothing next to it is the one worth failing a build over, so the grader looks for a companion:

**As a sibling file**

```
001_drop_sessions.sql       →  001_drop_sessions.down.sql
                               001_drop_sessions.rollback.sql
                               001_drop_sessions.undo.sql
                               001_drop_sessions_down.sql
001_drop_sessions.up.sql    →  001_drop_sessions.down.sql   (golang-migrate)
V2__drop_sessions.sql       →  U2__drop_sessions.sql        (Flyway undo)
```

**As a directory**: `down/`, `rollback/`, `revert/` or `undo/`, either beside the migration or beside its folder.

**Inline**, for the tools that keep both directions in one file:

```sql
-- +goose Down          (goose)
-- migrate:down         (dbmate)
--rollback DROP ...     (Liquibase)
--//@UNDO               (Liquibase formatted SQL)
```

## `--fail-on irreversible`

```bash
migrationpilot check ./migrations --fail-on irreversible
```

Exits 2 when a migration grades RED **and** ships no down file. It's a superset of `--fail-on critical`: critical violations still fail the build. A CI knob that silently stopped failing on critical violations would be a trap, so it doesn't.

It's available anywhere `failOn` is:

```yaml
# .migrationpilotrc.yml
failOn: irreversible
```

Exit codes are unchanged otherwise — `0` clean, `1` warnings under `--fail-on warning`, `2` critical or an ungated irreversible migration.

## In the output

Text output carries the grade in the header line, and spells out the statements behind a YELLOW or RED:

```
  ✗ MigrationPilot —  RED  Score: 70/100
  migrations/006_drop_legacy_notes.sql
  ─  ─  ─  ─  ─  ─  ─  ─  ─  ─  ─  ─  ─  ─  ─  ─  ─  ─  ─  ─
  1 statement · 1 critical · 2 warnings · rollback RED

  Reversibility: RED — 1 statement cannot be undone

  ✗ ALTER TABLE users DROP COLUMN legacy_notes (line 1)
    Dropping users.legacy_notes destroys that column's values. Re-adding the column gives you NULLs, not the data.

  ✗ No down migration found next to this file.
    Write one, or gate this in CI with --fail-on irreversible.
```

Risk level and rollback grade answer different questions, and that example shows the gap: the risk score says the statement is dangerous to run, and the rollback grade says you cannot take it back. A migration can be RED on one and GREEN on the other — a `CREATE INDEX` that locks writes for an hour is easy to undo, and a `DROP COLUMN` that finishes instantly is not.

A GREEN migration gets the badge and nothing else — there's nothing to say.

`check` adds a per-file grade to the summary and counts the irreversible ones:

```
  6 files scanned
  1 irreversible migration — data loss on rollback

  ✗ .../005_widen_age.sql (4 violations) rollback YELLOW
  ✗ .../006_drop_legacy_notes.sql (3 violations) rollback RED
```

## JSON

`reversibility` is an additive field on the per-file report. Nothing that was there before moved.

```jsonc
{
  "file": "migrations/006_drop_legacy_notes.sql",
  "riskLevel": "RED",
  "violations": [ /* ... */ ],
  "summary": { /* ... */ },
  "reversibility": {
    "grade": "RED",
    "counts": { "clean": 0, "care": 0, "irreversible": 1 },
    "reasons": [
      {
        "grade": "RED",
        "statement": "ALTER TABLE users DROP COLUMN legacy_notes",
        "reason": "Dropping users.legacy_notes destroys that column's values. ...",
        "line": 1
      }
    ],
    "companionDown": { "present": false }
  }
}
```

`companionDown` only appears once the filesystem has been checked, which the CLI does for anything not GREEN. `kind` is `"file"` (with a `path`) or `"inline"`.

## Programmatic use

```typescript
import { parseMigration, gradeReversibility, resolveCompanionDown } from 'migrationpilot';

const { statements } = await parseMigration(sql);
const grade = gradeReversibility(statements);

if (grade.grade === 'RED') {
  const down = await resolveCompanionDown(path, sql);
  if (!down.present) throw new Error(`${path} destroys data and has no down migration`);
}
```

`gradeReversibility` is pure — no filesystem, no network. `analyzeSQL` already calls it, so anything going through the normal pipeline gets `analysis.reversibility` for free.
