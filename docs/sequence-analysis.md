# Sequence Analysis: the deploy, not the file

`migrationpilot analyze` looks at one migration. But you don't ship one migration — you ship whatever landed on main since the last deploy, applied in order, in one window.

The hazards that live between files don't show up in a per-file report. Four migrations that each take a two-second lock on `users` look fine one at a time; together they queue behind live traffic four separate times. An index built in `003` and thrown away by a rewrite in `007` is two clean files and a wasted hour. A migration that alters a table the next file creates passes every rule in the book and then fails on deploy.

`check` runs this automatically on the directory you point it at.

## Findings

Cross-file findings have their own ID space, `SQ001`–`SQ005`, so they never collide with the per-statement `MP` rules.

| ID | Name | Fires when |
|---|---|---|
| SQ001 | `cumulative-lock-budget` | Blocking lock time on one table, summed across the sequence, goes over budget |
| SQ002 | `hot-table-multi-touch` | Three or more files take a blocking lock on the same table |
| SQ003 | `create-then-rewrite` | An index or constraint is built on a table a later file rewrites or drops |
| SQ004 | `ordering-hazard` | A file uses an object that a later file creates |
| SQ005 | `blast-radius` | Always — this one is the summary, not a violation |

### SQ001 — cumulative lock budget

Every blocking statement that scans or rewrites a table is charged against a per-table budget, default 60 seconds. When the total goes over, SQ001 reports it with the statements that spent it.

Two conditions have to hold: at least **two** statements have to contribute, and the total has to cross the budget. One long lock is a per-statement problem, and MP001, MP007 and friends already say so — SQ001 exists for the total nobody was tracking. Past three times the budget it goes critical.

Work that blocks nobody costs nothing here, however long it runs. A `CREATE INDEX CONCURRENTLY` on a 400 GB table can take all afternoon and still spend zero budget, which is the whole point of running it concurrently.

Tune it with `--lock-budget <seconds>`.

### SQ002 — hot table, touched by many files

Each migration that takes a blocking lock has to get to the front of the lock queue on its own, behind whatever traffic is running. Three separate `ALTER TABLE users` files means three separate chances to sit behind a long-running query and stall every reader in the process (see [the lock queue handbook chapter](handbook/02-lock-timeout-and-the-lock-queue.md)).

Creating a table doesn't count — nothing else can be holding a lock on a table that doesn't exist yet. Threshold is three files by default, `--hot-table-threshold` to change it.

### SQ003 — work built, then thrown away

An index or constraint created in one file, on a table that a later file rewrites, gets built twice: once when you asked for it, once by the rewrite. `ALTER COLUMN TYPE`, `VACUUM FULL`, `CLUSTER` and a persistence change all rewrite. Dropping the table is the extreme case — the index is built and then deleted.

The fix is usually to move the index build after the rewrite, not to remove it.

### SQ004 — ordering hazard

A file that references a table created in a later file. Applied in order, it fails. This is critical because it isn't a risk, it's a broken deploy.

The check follows more than the obvious target: foreign key targets (`REFERENCES other_table`) and the tables named by `INSERT`, `UPDATE` and `DELETE` count as references too. Files are read in the order the runner will apply them, which catches a forward reference that version-sorting would paper over.

### SQ005 — blast radius

Not a finding. It's the answer to "what does this deploy touch?", which is the first question in every migration review: every table, how many files touch it, the worst lock it takes, and the estimated blocking lock time.

## How lock time is estimated

Without a database connection, the estimate is a per-operation default, and the report says so. A scan or rewrite that blocks other sessions is charged a flat minute — deliberately, because pretending an unmeasured rewrite is free defeats the point of a budget. A blocking lock held only for a catalog update is charged half a second: the duration isn't the risk, the queue is.

Pass `--database-url` and the estimates calibrate to real row counts, using the same duration model as `migrationpilot plan`. The JSON reports `estimateBasis: "measured"` when that happened and `"heuristic"` when it didn't.

These are estimates for comparison and budgeting. They aren't predictions of what your hardware will do.

## Usage

```bash
# On by default
migrationpilot check ./migrations

# Just the per-file report
migrationpilot check ./migrations --no-sequence

# Tighter budget, and fail the build on critical cross-file findings
migrationpilot check ./migrations --lock-budget 30 --fail-on-sequence

# Calibrated estimates
migrationpilot check ./migrations --database-url $STAGING_URL

# For dashboards
migrationpilot check ./migrations --format json
```

### Options

| Flag | Default | What it does |
|---|---|---|
| `--sequence` | on | Analyze the directory as an ordered sequence |
| `--no-sequence` | — | Skip it and report per-file only |
| `--fail-on-sequence` | off | Exit 2 when a sequence finding is critical |
| `--lock-budget <seconds>` | `60` | Blocking lock seconds allowed per table (SQ001) |
| `--hot-table-threshold <files>` | `3` | Files touching one table before SQ002 fires (SQ002) |

Sequence findings **don't** affect the exit code unless you pass `--fail-on-sequence`. Turning a cross-file finding into a build failure is a decision, not a default — nobody's CI should start failing because they upgraded a patch version.

Sequence analysis needs at least two files. On a single file it stays silent.

## Sample output

```
  ═  ═  ═  ═  ═  ═  ═  ═  ═  ═  ═  ═  ═  ═  ═  ═  ═  ═  ═  ═  ═  ═  ═  ═  ═  ═  ═  ═  ═  ═
  ✗ Sequence Analysis — 6 files applied in order

  7 statements · 2 tables touched · 2 critical · 2 warnings

  ✗ [SQ001] CRITICAL cumulative-lock-budget
    "users" is locked for an estimated 3m across 3 statements in 2 files — over the 1m budget for one deploy.
      002_index_and_constraint.sql:1 SHARE ~1m — CREATE INDEX idx_users_email ON users (email)
      002_index_and_constraint.sql:4 ACCESS EXCLUSIVE ~1m — ALTER TABLE users ADD CONSTRAINT chk_users_age CHECK (age...
      005_widen_age.sql:1 ACCESS EXCLUSIVE ~1m — ALTER TABLE users ALTER COLUMN age TYPE bigint

  ⚠ [SQ002] WARNING hot-table-multi-touch
    "users" is locked by 3 files in this sequence. Each one queues behind live traffic on its own — fold them into one migration so the table takes the hit once.
      002_index_and_constraint.sql:1 SHARE
      002_index_and_constraint.sql:4 ACCESS EXCLUSIVE
      005_widen_age.sql:1 ACCESS EXCLUSIVE
      006_drop_legacy_notes.sql:1 ACCESS EXCLUSIVE

  ⚠ [SQ003] WARNING create-then-rewrite
    index idx_users_email, constraint chk_users_age — built on "users" in 002_index_and_constraint.sql, then rewritten by an ALTER COLUMN TYPE in "005_widen_age.sql". The build is paid for twice; move it after the rewrite.

  ✗ [SQ004] CRITICAL ordering-hazard
    "003_backfill_audit_log.sql" references table "audit_log" which is created later in "004_create_audit_log.sql" — applied in order, this migration fails.

  [SQ005] blast-radius

┌──────────────────────────┬───────┬───────┬──────────────────────────┬────────────────┐
│ Table                    │ Files │ Stmts │ Worst Lock               │ Est. Lock Time │
├──────────────────────────┼───────┼───────┼──────────────────────────┼────────────────┤
│ users                    │ 4     │ 5     │ ACCESS EXCLUSIVE (long)  │ 3m             │
├──────────────────────────┼───────┼───────┼──────────────────────────┼────────────────┤
│ audit_log                │ 2     │ 2     │ ACCESS EXCLUSIVE         │ none           │
└──────────────────────────┴───────┴───────┴──────────────────────────┴────────────────┘

  Total blocking lock time: 3m
  Estimates are per-operation defaults — pass --database-url to calibrate them to real table sizes.
```

That's `tests/fixtures/sequence`, which is built to trip every finding at once.

## JSON

`check --format json` adds a `sequence` object next to `files`. Everything that was in the report before is still where it was.

```jsonc
{
  "files": [ /* unchanged per-file reports */ ],
  "sequence": {
    "fileCount": 6,
    "files": ["001_create_users.sql", "..."],
    "statementCount": 7,
    "thresholds": { "lockBudgetSeconds": 60, "hotTableFileThreshold": 3 },
    "findings": [
      {
        "id": "SQ004",
        "name": "ordering-hazard",
        "severity": "critical",
        "message": "...",
        "files": ["003_backfill_audit_log.sql", "004_create_audit_log.sql"]
      }
    ],
    "blastRadius": {
      "totalEstimatedLockSeconds": 180,
      "estimateBasis": "heuristic",
      "tables": [
        {
          "table": "users",
          "files": ["001_create_users.sql", "..."],
          "statements": 5,
          "blockingStatements": 4,
          "worstLock": "ACCESS EXCLUSIVE",
          "worstLockLongHeld": true,
          "worstLockFile": "002_index_and_constraint.sql",
          "estimatedLockSeconds": 180,
          "operations": ["CREATE TABLE", "CREATE INDEX", "ALTER TABLE"]
        }
      ]
    },
    "summary": { "totalFindings": 4, "criticalCount": 2, "warningCount": 2, "tablesTouched": 2 },
    "parseErrors": []
  }
}
```

The `sequence` key is absent when you pass `--no-sequence`, and absent for a single file. SARIF output is per-file and doesn't carry sequence findings.

## Programmatic use

```typescript
import { analyzeSequence, formatSequenceReport } from 'migrationpilot';

const analysis = await analyzeSequence([
  { path: 'migrations/001_create_users.sql', sql: '...' },
  { path: 'migrations/002_add_index.sql', sql: '...' },
], { lockBudgetSeconds: 30 });

console.log(analysis.findings.map(f => `${f.id} ${f.message}`));
console.log(formatSequenceReport(analysis));
```

`analyzeSequence` takes the files **in apply order** — it doesn't sort them. It parses on its own and never touches the filesystem or the network.

## What it doesn't do

- It doesn't know what's already been applied. Point it at a directory and it treats every file in it as part of one deploy, which matches how `check` has always worked. Point it at the diff if you want the release.
- It doesn't track columns across files, only tables. An index on a column dropped three files later isn't reported.
- A file it can't parse is skipped and listed under `parseErrors`, rather than taking the run down.
- Views, functions and types aren't tracked as created objects for SQ004 yet. Tables and matviews are.
