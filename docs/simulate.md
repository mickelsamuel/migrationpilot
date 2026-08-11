# Simulate: Run the Migration Before You Merge It

`migrationpilot analyze` reads your migration. `migrationpilot simulate` runs it.

It boots a real PostgreSQL — the engine compiled to WebAssembly, via [PGlite](https://pglite.dev) — in the same process, in memory, executes your migration statement by statement, reports what happened, and throws the database away. No server, no connection string, no container, nothing left on disk.

That catches a class of problem static analysis will never reach, because the answer isn't in the SQL text. It's in what the server does with it.

```
│ 3   │ CREATE INDEX CONCURRENTLY idx_sessions_user… │ MP023 MP070    │ FAILED 25001           │

  Statement 3 failed (line 11)

    ERROR:  CREATE INDEX CONCURRENTLY cannot run inside a transaction block
    SQLSTATE: 25001
```

That's PostgreSQL's message, not ours.

## Install

The engine is an **optional dependency**, so `simulate` needs one extra install:

```bash
npm install @electric-sql/pglite
```

Everything else in MigrationPilot works without it. If you run `simulate` before installing it, you get one line telling you what to run, not a stack trace:

```
$ migrationpilot simulate migrations/003_add_index.sql
simulate needs the optional PGlite engine — run: npm install @electric-sql/pglite
It is kept optional because it is 25 MB and only `simulate` needs it.
```

That exits `1`. See [Install footprint](#install-footprint) for why it isn't bundled.

## What it catches that reading the SQL cannot

- **`CONCURRENTLY` inside a transaction block.** Legal syntax, valid AST, guaranteed failure. The server is the only thing that knows.
- **Casts PostgreSQL refuses.** `ALTER COLUMN reference TYPE uuid USING reference::uuid` parses fine. `cannot cast type integer to uuid` only shows up when something tries.
- **References to objects that don't exist.** A migration that alters a table an earlier migration forgot to create fails here, at the exact statement that depends on it.
- **Ordering bugs across files.** Point it at a directory and the migrations run in order against one database, the way they will in production. Migration 7 gets to see what migration 3 actually did.
- **Whether the migration leaves a transaction open.** A `BEGIN` with no `COMMIT` is easy to miss in review and quietly discards everything.

And it reports the schema it ended up with: tables, columns, indexes, constraints and sequences added, altered or dropped, diffed from the catalog before and after.

## What it cannot tell you

This part matters more than the feature list, so the report prints it every run, and the JSON carries it in a `limits` array.

**Lock contention is invisible here.** PGlite is a single connection. Nothing ever queued behind anything, because there was nothing else to queue behind. A migration that would freeze production for eleven minutes completes here without complaint. Lock conflicts are what the static lock analysis is for — that's why `simulate` runs it too and prints both.

**Timings are not production timings.** The tables hold whatever this run put in them, which is usually nothing. A table rewrite over 40 million rows finishes in under a millisecond here. Treat the numbers as relative cost between statements, never as an estimate. For estimates, use `migrationpilot predict` with real row counts.

**Syntax support follows PGlite's version, not yours.** The report names the version it actually ran on (`SELECT version()`), because it changes when PGlite is upgraded. PGlite 0.5.4 embeds **PostgreSQL 18.3**. Anything newer than the embedded engine will fail here even if your production server would take it — and that failure is about the simulator, not your migration.

There's a wrinkle worth knowing. MigrationPilot's static parser is built from PostgreSQL 16/17 and rejects PG18-only spellings like `ADD CONSTRAINT ... NOT NULL col NOT VALID`; the simulator's engine executes them happily. When that happens the report says so, keeps the execution results, and marks the static half unavailable rather than giving up on the run.

**It's a WASM build.** Planner costs, I/O behaviour and available extensions all differ from a native server. If an extension is missing here, that tells you nothing about your production database.

## Usage

```bash
# One migration
migrationpilot simulate migrations/003_add_index.sql

# A whole directory, applied in order against one database
migrationpilot simulate ./migrations

# Start from an existing schema instead of an empty database
migrationpilot simulate migrations/007_add_column.sql --baseline schema.sql

# For CI dashboards
migrationpilot simulate migrations/003_add_index.sql --format json

# Execution only, no static analysis
migrationpilot simulate ./migrations --pattern "V*.sql" --no-static
```

### Options

| Flag | Default | What it does |
|---|---|---|
| `--baseline <file>` | — | SQL file loaded as the starting schema before the migration runs |
| `--pattern <glob>` | `**/*.sql` | Which files to pick up when the target is a directory |
| `--pg-version <n>` | config, else 17 | PostgreSQL version for the **static** rules. Execution always uses PGlite's own version |
| `--format <text\|json>` | `text` | Output format |
| `--search-path <name>` | `public` | Schema to introspect for the diff |
| `--no-static` | — | Skip static analysis and report execution only |
| `--exclude <rules>` | — | Rule IDs to drop from the static half |
| `--license-key <key>` | — | Include Pro rules in the static half |
| `--no-config` | — | Ignore the config file |

Exit codes: `0` everything executed, `2` a statement failed, `1` the file or `--baseline` schema couldn't be loaded.

Note what's missing: `simulate` does not fail on static severity. A migration full of critical violations that executes cleanly exits `0`. Gate on violations with `analyze` or `check` — this command's exit code answers one question, "does it run".

### `--baseline`: starting from something real

An empty database is the wrong starting point for most migrations. `--baseline` loads a SQL file first — a `pg_dump --schema-only`, a checked-in `schema.sql`, whatever represents where production is now — and the migration runs on top of it.

The diff is taken after the baseline loads, so the baseline's own tables aren't reported as your migration's work. Only what the migration changed shows up.

If the baseline itself fails to load, that's reported as a baseline error and exits `1`, not `2`. A broken `schema.sql` isn't a broken migration.

## How a run works

1. Boot a fresh PGlite instance. Every run gets its own; two runs cannot contaminate each other.
2. Load `--baseline`, if given.
3. Snapshot the catalog.
4. Split the migration into statements — from the parse tree when the file parses, from a quote/comment/dollar-quote-aware text splitter when it doesn't — and execute them one at a time, timing each.
5. Stop at the first error. Everything after it is reported as **not run**, because in a real deployment it either wouldn't run at all or would run against a database in a state nobody intended.
6. Snapshot the catalog again, diff the two, and report.

Statements go through the simple query protocol, the same one `psql` uses. The extended protocol wraps every statement in an implicit transaction, which would make `CREATE INDEX CONCURRENTLY` fail no matter how the migration was written — turning the single most useful check into a guaranteed false positive.

### When a migration fails inside a transaction

The session is rolled back before the closing snapshot, so the diff shows what actually survived — which for a failure inside `BEGIN` is nothing. That's the honest answer: production would roll it back too.

## Sample output

```
  ✗ MigrationPilot Simulate
  migrations/004_sessions.sql
  ──────────────────────────────
  Engine: PostgreSQL 18.3 (PGlite 0.5.4, ephemeral in-process, booted in 1.16s)
  4 statements · 3 executed · 1 failed · 3.5ms total

┌─────┬──────────────────────────────────────────────┬────────────────┬────────────────────────┐
│ #   │ Statement                                    │ Static         │ Runtime                │
├─────┼──────────────────────────────────────────────┼────────────────┼────────────────────────┤
│ 1   │ BEGIN                                        │ clean          │ ok 0.28ms              │
│ 2   │ CREATE TABLE sessions ( id uuid PRIMARY KEY… │ MP023          │ ok 1.8ms               │
│ 3   │ CREATE INDEX CONCURRENTLY idx_sessions_user… │ MP023 MP070    │ FAILED 25001           │
│ 4   │ COMMIT                                       │ clean          │ not run                │
└─────┴──────────────────────────────────────────────┴────────────────┴────────────────────────┘

  Statement 3 failed (line 11)

    ERROR:  CREATE INDEX CONCURRENTLY cannot run inside a transaction block
    SQLSTATE: 25001

  Executed before it:
     1  BEGIN                                                        ok 0.28ms
     2  CREATE TABLE sessions ( id uuid PRIMARY KEY, user_id intege… ok 1.8ms

  Never ran:
     4  COMMIT

  Schema changes (schema "public")
    none — the catalog is unchanged

  ⚠ The failure happened inside a transaction — everything in it was rolled back.
```

The two verdict columns are the point. `Static` is what the rules say about production risk; `Runtime` is whether the server accepted it. They answer different questions and a migration can pass one and fail the other — which is exactly what happened above. Nothing in the rule set flagged the `CONCURRENTLY`-inside-`BEGIN`, and it fails every time.

## JSON output

`--format json` is additive: the static half is the same document `analyze --format json` produces, embedded verbatim under `static`, so anything already parsing MigrationPilot reports keeps working.

```jsonc
{
  "$schema": "https://migrationpilot.dev/schemas/simulate-v1.json",
  "version": 1,
  "file": "/repo/migrations/004_sessions.sql",
  "engine": {
    "pglite": "0.5.4",
    "serverVersion": "18.3",
    "serverMajor": 18,
    "versionString": "PostgreSQL 18.3 (PGlite 0.5.4) on wasm32-unknown-linux-gnu, ..."
  },
  "baseline": null,
  "schema": "public",
  "execution": {
    "statementCount": 4,
    "executed": 3,
    "failedIndex": 3,
    "totalDurationMs": 3.511,
    "bootMs": 1160.4,
    "transactionState": "aborted",
    "statements": [
      {
        "index": 3,
        "line": 11,
        "sql": "CREATE INDEX CONCURRENTLY idx_sessions_user_id ON sessions (user_id)",
        "status": "error",
        "durationMs": 0.908,
        "rowsAffected": null,
        "rowsReturned": null,
        "error": {
          "message": "CREATE INDEX CONCURRENTLY cannot run inside a transaction block",
          "code": "25001",
          "severity": "ERROR",
          "detail": null,
          "hint": null,
          "position": null,
          "routine": "PreventInTransactionBlock"
        }
      }
    ]
  },
  "schemaChanges": {
    "tables": { "added": [], "removed": [], "modified": [] },
    "indexes": { "added": [], "removed": [] },
    "sequences": { "added": [], "removed": [] }
  },
  "static": { "$schema": "https://migrationpilot.dev/schemas/report-v1.json" },
  "staticError": null,
  "staticPgVersion": 17,
  "splitFallback": false,
  "parseErrors": [],
  "limits": ["Single connection: lock CONTENTION cannot be observed here. …"]
}
```

`status` is `ok`, `error` or `not-run`. `transactionState` is `none`, `open` or `aborted`. Point a directory at it and the shape changes to a `files` array with `notRun` alongside — same split as `analyze` versus `check`.

## In CI

```yaml
- name: Check migrations
  run: migrationpilot check ./migrations

- name: Install the simulation engine
  run: npm install --no-save @electric-sql/pglite

- name: Simulate migrations
  run: migrationpilot simulate ./migrations
```

`check` gates on risk. `simulate` gates on whether the thing runs at all. Running both means a migration that would fail on deploy fails in CI instead, which is a much cheaper place to find out.

The extra install step is the price of keeping the engine optional. If your repo already lists `@electric-sql/pglite` in `devDependencies`, drop that step — your normal `npm ci` covers it.

## Install footprint

The PostgreSQL WASM engine is **8.4 MiB compressed, 25.4 MB unpacked** across 301 files, with no transitive dependencies of its own. Everything else MigrationPilot depends on comes to about 3.4 MB combined — so bundling it would have made the package roughly 8× bigger for everyone.

Most people meet MigrationPilot through a one-shot `npx migrationpilot check ./migrations` in CI, which never needs an engine. So `@electric-sql/pglite` is declared as an **optional peer dependency**: npm and pnpm won't install it unless you ask, `analyze` and `check` are unaffected, and only people who actually want to simulate pay for it.

Two consequences worth knowing:

- **You install it explicitly** — `npm install @electric-sql/pglite`. There's no auto-install and no prompt.
- **It loads lazily.** Even with the package present, it's reached through a dynamic `import()` and kept out of the CLI bundle, so nothing reads 16 MB of WASM off disk until `simulate` actually runs. Every other command starts exactly as fast as before.

If the engine is present but fails to load — a corrupt install, a platform without WASM — the message says that instead, and still exits `1` rather than printing a trace.
