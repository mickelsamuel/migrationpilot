# MigrationPilot

[![npm version](https://img.shields.io/npm/v/migrationpilot.svg)](https://www.npmjs.com/package/migrationpilot)
[![npm downloads](https://img.shields.io/npm/dm/migrationpilot.svg)](https://www.npmjs.com/package/migrationpilot)
[![CI](https://github.com/mickelsamuel/migrationpilot/actions/workflows/ci.yml/badge.svg)](https://github.com/mickelsamuel/migrationpilot/actions/workflows/ci.yml)
[![Node](https://img.shields.io/badge/node-%3E%3D22-3c873a.svg)](https://nodejs.org)
[![VS Code](https://img.shields.io/badge/VS%20Code-Marketplace-007ACC.svg)](https://marketplace.visualstudio.com/items?itemName=migrationpilot.migrationpilot)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

**Block unsafe Postgres migrations before merge.**

Local, deterministic analysis for PostgreSQL migrations. Uses PostgreSQL's parser, checks 112 rules, and exits non-zero in CI. No account required. MIT.

```bash
npx migrationpilot analyze migration.sql
```

[Try it in your browser](https://migrationpilot.dev/playground) · [GitHub Action](#github-action) · [Documentation](https://migrationpilot.dev/docs)

## Benchmark

| Tool | Strict detection | False positives |
|---|---:|---:|
| **MigrationPilot** | **30/33 (90.9%)** | **1/17 (5.9%)** |
| Squawk | 20/33 (60.6%) | **1/17 (5.9%)** |
| pgfence | 25/33 (75.8%) | 3/17 (17.6%) |

56 labelled files. Author-built corpus. Tools pinned.

[Methodology](bench/RESULTS.md) · [Corpus](bench/corpus) · [What MigrationPilot missed](bench/RESULTS.md#what-migrationpilot-missed) · Reproduce: `pnpm build && node bench/run.mjs`

## A finding

```sql
-- migration.sql
ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE (email);
```

```console
$ migrationpilot analyze migration.sql

  ✗ MigrationPilot —  RED  Score: 80/100
  migration.sql
  ─  ─  ─  ─  ─  ─  ─  ─  ─  ─  ─  ─  ─  ─  ─  ─  ─  ─  ─  ─  ─  ─  ─  ─  ─  ─  ─  ─  ─  ─
  1 statement · 2 critical · rollback GREEN

┌─────┬─────────────────────────────────────────────┬─────────────────────────┬────────┬────────────┐
│ #   │ Statement                                   │ Lock Type               │ Risk   │ Long lock? │
├─────┼─────────────────────────────────────────────┼─────────────────────────┼────────┼────────────┤
│ 1   │ ALTER TABLE users ADD CONSTRAINT users_e... │ ACCESS EXCLUSIVE        │  YELL… │ YES        │
└─────┴─────────────────────────────────────────────┴─────────────────────────┴────────┴────────────┘

  Violations:

  ✗ [MP004] CRITICAL (line 1)
    DDL statement acquires ACCESS EXCLUSIVE lock without a preceding SET lock_timeout. Without a timeout, this statement could block the lock queue indefinitely if it can't acquire the lock, causing cascading query failures.

    Safe alternative:
    -- Set a timeout so DDL fails fast instead of blocking the queue
    SET lock_timeout = '5s';
    ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE (email)
    RESET lock_timeout;

    Why: Without lock_timeout, if the table is locked by another query, your DDL waits indefinitely. All subsequent queries pile up behind it in the lock queue, causing cascading timeouts across your application. GoCardless enforces a 750ms lock_timeout for this reason.
    Docs: https://migrationpilot.dev/rules/mp004

  ✗ [MP027] CRITICAL (line 1)
    Adding UNIQUE constraint "users_email_unique" on "users" scans the entire table under ACCESS EXCLUSIVE lock. Create the index concurrently first, then use USING INDEX.

    Safe alternative:
    -- Step 1: Create the unique index concurrently (non-blocking)
    CREATE UNIQUE INDEX CONCURRENTLY users_email_unique_idx ON users (...);

    -- Step 2: Add the constraint using the pre-built index (instant)
    ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE USING INDEX users_email_unique_idx;

    Why: ALTER TABLE ADD CONSTRAINT UNIQUE builds a unique index while holding ACCESS EXCLUSIVE lock, blocking all reads and writes for the entire scan. Instead, create the unique index concurrently (non-blocking), then attach it as a constraint with USING INDEX.
    Docs: https://migrationpilot.dev/rules/mp027

  Risk Factors:
    Lock Severity        ██████████ 40/40 — ACCESS EXCLUSIVE (long-held)
    Rule Violations      ████████░░ 80/100 — 2 critical

  112 rules checked in 11ms
```

Exit code is 2. The headline is RED because critical violations fired; the per-statement Risk column stays YELLOW because table size and query frequency are unknown without a database connection. See [Production context](#production-context).

## Contents

[Install](#install) · [AI coding agents](#ai-coding-agents) · [CI](#ci) · [What it checks](#what-it-checks) · [Beyond one file](#beyond-one-file) · [Configuration](#configuration) · [Output](#output) · [Production context](#production-context) · [Comparison](#comparison) · [Pricing](#pricing) · [Architecture](#architecture) · [API](#programmatic-api)

## Install

```bash
npx migrationpilot analyze migration.sql   # no install
npm install -g migrationpilot              # global
```

Node 22 or newer. The PostgreSQL parser ships compiled in, so there is nothing else to set up. Exit codes are the same everywhere: `0` clean, `1` warnings under `--fail-on warning`, `2` critical.

Packaged builds land with v1.6.0, including single-file executables for Linux, macOS and Windows on [the release page](https://github.com/mickelsamuel/migrationpilot/releases) for machines without Node:

```bash
docker run --rm -v "$PWD:/work" ghcr.io/mickelsamuel/migrationpilot:1 analyze migration.sql
```

On Windows in Git Bash, MSYS rewrites paths inside the mount flag, so use the Windows-form working directory instead:

```bash
docker run --rm -v "$(pwd -W):/work" ghcr.io/mickelsamuel/migrationpilot:1 analyze migration.sql
```

## AI coding agents

Agents write migrations now. They are good at SQL and bad at knowing which statement takes an `ACCESS EXCLUSIVE` lock on a table with 40 million rows, and by then the outage has already happened.

**MCP server.** Seven tools, the important one being `check_before_apply`: a pass/fail gate the agent calls before it writes or runs DDL. It resolves your `.migrationpilotrc.yml` exactly like the CLI does, so its verdict is the verdict CI will give.

```json
{
  "mcpServers": {
    "migrationpilot": { "command": "npx", "args": ["migrationpilot-mcp"] }
  }
}
```

| Tool | Purpose |
|---|---|
| `check_before_apply` | `{sql, pgVersion?, configPath?}` returns `{verdict: pass\|fail, failOn, violations[], summary}` |
| `analyze_migration` | Violations, risk score and lock analysis for one migration |
| `analyze_migration_dir` | Per-file results plus an aggregate for a whole folder |
| `get_rule` | What a rule reports, why it matters, whether it auto-fixes |
| `suggest_fix` | Auto-fixed SQL plus the violations that need a human |
| `explain_lock` | The lock one DDL statement takes and what it blocks |
| `list_rules` | The full catalogue |

**Claude Code plugin.** [`integrations/claude-code/`](integrations/claude-code/) pairs a skill that tells Claude to check migrations with a `PreToolUse` hook that blocks the tool call when it doesn't. It fails open on purpose: a missing install, unparseable SQL, or a timeout lets the call through with a note on stderr, because a guardrail that breaks your workflow when it can't run gets uninstalled.

```bash
claude plugin install ./integrations/claude-code
```

**Cursor and Copilot.** Copy [`integrations/cursor/migrationpilot.mdc`](integrations/cursor/migrationpilot.mdc) into `.cursor/rules/`, or paste [`integrations/copilot/copilot-instructions-snippet.md`](integrations/copilot/copilot-instructions-snippet.md) into `.github/copilot-instructions.md`. Both tell the agent when to run MigrationPilot and that suppressing a rule to get past a violation is the user's call, not the agent's.

## CI

### GitHub Action

```yaml
# .github/workflows/migration-check.yml
name: Migration Safety Check
on: [pull_request]

# New repositories default the workflow token to read-only; the report comment
# needs pull-request write.
permissions:
  contents: read
  pull-requests: write

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: mickelsamuel/migrationpilot@v1
        with:
          migration-path: "migrations/*.sql"
          fail-on: critical
```

Posts a report as a PR comment, fails the check on critical violations, and writes a SARIF file. To feed it into Code Scanning, add an upload step (needs Advanced Security on private repos):

```yaml
      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: migrationpilot-results.sarif
```

Without the `permissions` block the Action still runs. It warns, analyzes every file matching the glob instead of only the ones the PR changed, and skips the comment. The check verdict, the SARIF file and the inline annotations come from the analysis either way.

| Input | Description | Default |
|---|---|---|
| `migration-path` | Glob for SQL files (required) | |
| `github-token` | Token for PR comments | `${{ github.token }}` |
| `pg-version` | Target PostgreSQL version | `17` |
| `fail-on` | `critical`, `warning`, `irreversible`, `never` | `critical` |
| `exclude` | Comma-separated rule IDs to skip | |
| `config-file` | Path to `.migrationpilotrc.yml` | auto-detected |
| `database-url` | Connection for production context | |
| `license-key` | Org plan license key | |

Outputs: `risk-level`, `violations`, `sarif-file`.

### Pre-commit

`migrationpilot hook install` writes a plain git hook and is Husky-aware. With the [pre-commit](https://pre-commit.com) framework instead:

```yaml
repos:
  - repo: https://github.com/mickelsamuel/migrationpilot
    rev: v1.6.0
    hooks:
      - id: migrationpilot
        args: [--fail-on, warning]
```

Clean files print nothing. Only migrations with violations are reported.

### GitLab CI

```yaml
include:
  - remote: 'https://raw.githubusercontent.com/mickelsamuel/migrationpilot/v1.6.0/integrations/gitlab/.gitlab-ci-migrationpilot.yml'

migrationpilot:
  variables:
    MIGRATIONPILOT_PATH: db/migrate
```

Runs on merge requests that touch migrations, keeps the JSON report as an artifact, and annotates the MR diff through GitLab Code Quality.

## What it checks

112 rules: 34 critical, 78 warning, 20 auto-fixable with `--fix`. Ten that matter most:

| Rule | Fix | What it catches |
|---|:--:|---|
| MP001 | Yes | `CREATE INDEX` without `CONCURRENTLY` blocks writes for the whole build |
| MP002 | | `SET NOT NULL` scans the full table. Use the validated `CHECK` pattern |
| MP003 | | `ADD COLUMN` with a volatile `DEFAULT` rewrites the table and its indexes |
| MP007 | | `ALTER COLUMN TYPE` rewrites the table under `ACCESS EXCLUSIVE` |
| MP008 | | Several DDL statements in one transaction compound the lock duration |
| MP025 | Yes | `CONCURRENTLY` inside a transaction is a runtime `ERROR`, not a warning |
| MP027 | | `UNIQUE` constraint without `USING INDEX` scans the table under an exclusive lock |
| MP055 | | Dropping a primary key breaks logical replication |
| MP070 | | A failed concurrent build leaves an invalid index the retry silently inherits |
| MP097 | | Dropping the index behind a constraint is rejected and aborts the migration |

[Browse all 112 rules](https://migrationpilot.dev/docs/rules), or run `migrationpilot explain MP027` for one. [The handbook](docs/handbook/README.md) is 20 chapters on why each hazard bites and what to do instead.

Rules adapt to `--pg-version` (9 through 18): `REINDEX CONCURRENTLY` from 12, `DETACH PARTITION CONCURRENTLY` from 14, the native `NOT NULL ... NOT VALID` path from 18.

## Beyond one file

`analyze --fix` rewrites the 20 fixable violations in place. The rest of the surface:

| Command | What it does |
|---|---|
| `check <dir>` | Whole directory, plus [cross-file sequence analysis](docs/sequence-analysis.md) |
| [`simulate`](docs/simulate.md) | Runs the migration against an ephemeral in-process PostgreSQL 18 (PGlite) and reports what actually happened |
| [`plan-fix`](docs/plan-fix.md) | Step-by-step expand-contract plan for violations with no one-line fix, with deploy boundaries |
| [`mutation-test`](docs/mutation-testing.md) | Mutates passing migrations into dangerous near-neighbours to find holes in your config |
| `predict` | Duration estimate for an operation, calibrated by `--row-count` and `--size` |
| `template` | Generates expand-contract SQL for renames, type changes, `NOT NULL`, and more |
| `plan` | Visual execution timeline: lock, duration, blocking impact, transaction boundaries |
| `rollback` | Reverse DDL, [graded by how recoverable it is](docs/rollback-grading.md) |
| `drift` | Diffs two live schemas |
| `precommit` | Multi-file entry point the pre-commit framework calls |

Twenty-four commands in total. `migrationpilot --help` lists them.

**Sequence analysis** is what a per-file linter cannot see. Three migrations that each look fine can still take one table down together:

```console
$ migrationpilot check migrations/

  ⚠ [SQ001] WARNING cumulative-lock-budget
    "orders" is locked for an estimated 2m across 2 statements in 2 files — over the 1m budget for one deploy.
  ⚠ [SQ002] WARNING hot-table-multi-touch
    "orders" is locked by 3 files in this sequence. Each one queues behind live traffic on its own — fold them into one migration so the table takes the hit once.
```

Tune it with `--lock-budget <seconds>` and `--hot-table-threshold <files>`, turn it off with `--no-sequence`, and make it blocking with `--fail-on-sequence`.

**`--fail-on irreversible`** is stricter than `critical`: it also blocks migrations that destroy data with no down file.

## Configuration

Zero-config is the default. `check` with no directory detects your framework, finds its migrations, and analyzes them in apply order. Fourteen are supported: Flyway, Liquibase, Alembic, Django, Knex, Prisma, TypeORM, Drizzle, Sequelize, goose, dbmate, Sqitch, Rails, Ecto. Force one with `--framework prisma`, or pipe any generator through `--from-command`:

```bash
migrationpilot check --from-command "python manage.py sqlmigrate myapp 0042"
```

```yaml
# .migrationpilotrc.yml
extends: "migrationpilot:strict"
pgVersion: 16
failOn: warning
rules:
  MP037: false                 # off
  MP004: { severity: warning } # downgrade
  MP013: { threshold: 5000 }   # retune
ignore:
  - "migrations/seed_*.sql"
```

Five presets: `recommended` (default), `strict`, `ci`, `startup`, `enterprise`. Inline, `-- migrationpilot-disable MP001` suppresses a rule for the next statement and `-- migrationpilot-disable-file MP001` does it for the whole file. Name no rule and it suppresses all of them.

Ed25519 license keys validate client-side. `--offline` skips update checks and every other network call. There is no telemetry.

## Output

`--format text` (default), `json`, `sarif`, or `markdown`, plus `--quiet` for one gcc-style line per violation and `--verbose` for per-statement pass/fail.

```json
{
  "$schema": "https://migrationpilot.dev/schemas/report-v1.json",
  "version": "1.6.0",
  "file": "migrations/001.sql",
  "riskLevel": "RED",
  "riskScore": 80,
  "violations": []
}
```

SARIF feeds GitHub Code Scanning, VS Code and IntelliJ: `migrationpilot analyze migration.sql --format sarif --output results.sarif`.

## Production context

Pass `--database-url` and MigrationPilot opens one read-only connection to read `pg_class`, `pg_stat_statements` and `pg_stat_activity`. It reads no user data and runs no DDL.

That turns risk scoring from a guess into a measurement, and gives three rules the numbers they have nothing to say without: MP013 (DDL on a high-traffic table), MP014 (long-held locks on a table with millions of rows), MP019 (`ACCESS EXCLUSIVE` while connections are piling up).

| Factor | Weight | Needs `--database-url` |
|---|---|:--:|
| Lock severity | 0-40 | No |
| Table size | 0-30 | Yes |
| Query frequency | 0-30 | Yes |

GREEN is 0-24, YELLOW 25-49, RED 50-100.

## Comparison

| | MigrationPilot | Squawk | Atlas |
|---|:---:|:---:|:---:|
| Rules, all free | **112** | 40 | 50+ analyzers, none free since v0.38 |
| Auto-fix | **20 rules** | 0 | 0 |
| Cross-file sequence analysis | Yes | No | No |
| Real execution against ephemeral PG | Yes | No | Yes, needs Docker |
| MCP server for agents | Yes | No | No |
| Framework detection | **14** | 0 | 0 |
| Config presets | **5** | 0 | 0 |
| SARIF for Code Scanning | Yes | No | No |
| License | **MIT** | Apache-2.0 / MIT | Apache-2.0 core, no free lint |

Squawk: 40 rules as of v2.62.0 (Aug 2026). Atlas moved `migrate lint` to Pro-only in v0.38 (Oct 2025) and later removed it from the Community Edition, so it could not be benchmarked without a paid account. The [methodology](bench/RESULTS.md#why-atlas-is-not-in-the-table) records the exact command and its refusal.

## Pricing

Everything the linter does is free and unmetered: all 112 rules including the production-context ones, auto-fix, sequence analysis, simulate, every output format, the GitHub Action, the MCP server. No account, no seat count, no telemetry, MIT.

The $499/year Org plan turns the free linter into an enforceable control: one policy across repositories that developers cannot quietly disable, a JSONL audit trail of every check, and direct support from the maintainer.

[Org plan](mailto:hello@migrationpilot.dev?subject=Org%20Plan) · [Full pricing](https://migrationpilot.dev/pricing)

## Architecture

```
src/
├── parser/ locks/         # libpg-query WASM, lock classification
├── rules/ fixer/          # 112 rules and the 20-rule auto-fixer
├── analysis/ scoring/     # shared pipeline, transaction boundaries, risk 0-100
├── sequence/ lockqueue/   # cross-file SQ rules, lock queue modelling
├── simulate/ mutate/      # PGlite execution, mutation-testing operators
├── cascade/ graph/ schema/ prediction/ templates/
├── production/ frameworks/ plugins/ output/ generator/
├── mcp/ action/ config/ hooks/ watch/ drift/ history/
├── policy/ auth/ license/ team/ audit/ billing/ usage/ doctor/
├── index.ts               # programmatic API, 69 value exports plus types
└── cli.ts                 # 24 commands
```

## Programmatic API

```typescript
import { analyzeSQL, allRules, parseMigration, classifyLock } from 'migrationpilot';

const result = await analyzeSQL(sql, 'migration.sql', 17, allRules);
console.log(result.violations, result.overallRisk);
```

Sixty-nine value exports plus full TypeScript types. `allRules` is the same rule set the CLI runs.

## Development

```bash
pnpm install
pnpm test        # 1945 tests across 72 files
pnpm build       # CLI 1.4MB, Action 1.7MB, API 639KB, MCP 1.7MB
pnpm lint && pnpm typecheck
pnpm dev analyze path/to/migration.sql
```

[CONTRIBUTING.md](CONTRIBUTING.md) · [SECURITY.md](SECURITY.md) · [CHANGELOG.md](CHANGELOG.md)

## License

MIT
