# MigrationPilot

[![CI](https://github.com/mickelsamuel/migrationpilot/actions/workflows/ci.yml/badge.svg)](https://github.com/mickelsamuel/migrationpilot/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

**Know exactly what your PostgreSQL migration will do to production — before you merge.**

MigrationPilot analyzes your SQL schema migrations and tells you:
- What **locks** each DDL statement acquires
- Whether it **blocks reads, writes, or both**
- How **long** the lock is held (brief vs. table scan/rewrite)
- An overall **risk score** (RED / YELLOW / GREEN)
- **Safe alternatives** when dangerous patterns are detected
- **Production context** (Pro): table sizes, query frequency, active connections

Works as a **CLI tool** and a **GitHub Action** that posts safety reports directly on your PRs. Outputs in text, JSON, or [SARIF](https://sarifweb.azurewebsites.net/) for GitHub Code Scanning and IDE integration.

---

## Quick Start

### CLI

```bash
npm install -g migrationpilot

# Analyze a single migration file
migrationpilot analyze migrations/001_add_users_email.sql

# Check all migrations in a directory
migrationpilot check migrations/ --pattern "*.sql"

# JSON output for scripting
migrationpilot analyze migrations/001.sql --format json

# SARIF output for Code Scanning / IDE
migrationpilot analyze migrations/001.sql --format sarif > results.sarif

# With production context (Pro tier)
migrationpilot analyze migrations/001.sql \
  --database-url "postgresql://user:pass@host/db" \
  --license-key "$MIGRATIONPILOT_LICENSE_KEY"
```

### GitHub Action

```yaml
# .github/workflows/migration-check.yml
name: Migration Safety Check
on: [pull_request]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: mickelsamuel/migrationpilot@v0.3.0
        with:
          migration-path: "migrations/*.sql"
          fail-on: critical
```

#### With Production Context + Code Scanning (Pro)

```yaml
      - uses: mickelsamuel/migrationpilot@v0.3.0
        id: migration-check
        with:
          migration-path: "migrations/*.sql"
          license-key: ${{ secrets.MIGRATIONPILOT_LICENSE_KEY }}
          database-url: ${{ secrets.DATABASE_URL }}
          fail-on: critical

      # Upload SARIF for GitHub Code Scanning
      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: ${{ steps.migration-check.outputs.sarif-file }}
```

---

## CLI Usage

```
migrationpilot analyze <file> [options]
migrationpilot check <dir> [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--pg-version <n>` | Target PostgreSQL version | `17` |
| `--format <fmt>` | Output format: `text`, `json`, `sarif` | `text` |
| `--fail-on <level>` | Exit code 1 on: `critical`, `warning`, or `never` | `critical` |
| `--database-url <url>` | PostgreSQL connection string (Pro) | — |
| `--license-key <key>` | License key for Pro features | — |

The license key can also be set via the `MIGRATIONPILOT_LICENSE_KEY` environment variable.

### Example Output

```
  MigrationPilot — migrations/002_alter_users.sql

  Risk:  YELLOW   Score: 40/100

┌───┬─────────────────────────────────────────┬──────────────────┬────────┬───────┐
│ # │ Statement                               │ Lock Type        │ Risk   │ Long? │
├───┼─────────────────────────────────────────┼──────────────────┼────────┼───────┤
│ 1 │ ALTER TABLE users ALTER COLUMN email... │ ACCESS EXCLUSIVE │ YELLOW │ YES   │
└───┴─────────────────────────────────────────┴──────────────────┴────────┴───────┘

  Violations:

  ✗ [MP004] CRITICAL
    DDL statement acquires ACCESS EXCLUSIVE lock without a preceding
    SET lock_timeout.

  ✗ [MP007] CRITICAL
    ALTER COLUMN TYPE on "users"."email" rewrites the entire table
    under ACCESS EXCLUSIVE lock.
```

---

## GitHub Action

### Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `migration-path` | Glob pattern for migration SQL files | Yes | — |
| `github-token` | GitHub token for PR comments | No | `${{ github.token }}` |
| `license-key` | MigrationPilot Pro license key | No | — |
| `database-url` | PostgreSQL connection string (Pro) | No | — |
| `pg-version` | Target PostgreSQL version | No | `17` |
| `fail-on` | Fail CI on: `critical`, `warning`, `never` | No | `critical` |

### Outputs

| Output | Description |
|--------|-------------|
| `risk-level` | Overall risk: `RED`, `YELLOW`, or `GREEN` |
| `violations` | Number of violations found |
| `sarif-file` | Path to SARIF results file for Code Scanning upload |

### PR Comment

MigrationPilot posts a safety report directly on your PR with:
- DDL operations table with lock types and risk levels
- Safety violations with severity and explanations
- Collapsible safe alternatives for each violation
- Risk score breakdown
- Affected queries from production (Pro tier)

The comment is automatically updated on each push — no duplicate comments.

---

## Rules

### Critical Rules

| Rule | Name | What it catches |
|------|------|-----------------|
| MP001 | require-concurrent-index | `CREATE INDEX` without `CONCURRENTLY` |
| MP002 | require-check-not-null | `SET NOT NULL` without preceding CHECK constraint |
| MP003 | volatile-default-rewrite | `ADD COLUMN` with volatile `DEFAULT` (e.g., `now()`) |
| MP004 | require-lock-timeout | DDL without preceding `SET lock_timeout` |
| MP005 | require-not-valid-fk | `ADD CONSTRAINT FK` without `NOT VALID` |
| MP006 | no-vacuum-full | `VACUUM FULL` (use `pg_repack` instead) |
| MP007 | no-column-type-change | `ALTER COLUMN TYPE` (requires table rewrite) |
| MP008 | no-multi-ddl-transaction | Multiple DDL in a single `BEGIN...COMMIT` |

### Warning Rules

| Rule | Name | What it catches |
|------|------|-----------------|
| MP009 | require-drop-index-concurrently | `DROP INDEX` without `CONCURRENTLY` |
| MP010 | no-rename-column | `RENAME COLUMN` breaks application queries |
| MP011 | unbatched-data-backfill | `UPDATE` without `WHERE` clause (full table scan) |
| MP012 | no-enum-add-in-transaction | `ALTER TYPE ADD VALUE` inside a transaction block |

### Production Context Rules (Pro)

| Rule | Name | What it catches |
|------|------|-----------------|
| MP013 | high-traffic-table-ddl | DDL on tables with 10K+ queries |
| MP014 | large-table-ddl | Long-held locks on tables with 1M+ rows |

---

## Production Context (Pro)

When you provide a `--database-url` (CLI) or `database-url` input (Action) with a valid Pro license, MigrationPilot connects to your database and queries:

| Data Source | What it provides |
|-------------|-----------------|
| `pg_class` | Table row counts, total size (including indexes + TOAST), index count |
| `pg_stat_statements` | Affected queries by call frequency, average execution time |
| `pg_stat_activity` | Active connections running queries against target tables |

This data feeds into:
- **Risk scoring**: Table size (0-30 points) + query frequency (0-30 points) on top of lock severity
- **Rules MP013-MP014**: Warnings about DDL on high-traffic or large tables
- **PR comments**: Affected queries table showing which queries will be impacted

**Safety**: MigrationPilot only reads from system catalogs (`pg_class`, `pg_stat_*`). It never reads user data, never runs DDL, and uses a single read-only connection with timeouts.

---

## SARIF Output

MigrationPilot supports [SARIF v2.1.0](https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html) output for integration with:

- **GitHub Code Scanning** — violations appear as code scanning alerts on your PR
- **VS Code** — via the [SARIF Viewer extension](https://marketplace.visualstudio.com/items?itemName=MS-SarifVSCode.sarif-viewer)
- **Any SARIF-compatible tool** — IntelliJ, Azure DevOps, etc.

```bash
# CLI
migrationpilot analyze migration.sql --format sarif > results.sarif

# GitHub Action (auto-generated, use with upload-sarif)
- uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: ${{ steps.migration-check.outputs.sarif-file }}
```

---

## Risk Scoring

Risk score ranges from 0-100, composed of:

| Factor | Weight | Free | Pro |
|--------|--------|:----:|:---:|
| Lock Severity | 0-40 | Yes | Yes |
| Table Size | 0-30 | — | Yes |
| Query Frequency | 0-30 | — | Yes |

| Level | Score | Meaning |
|-------|-------|---------|
| GREEN | 0-24 | Safe to deploy |
| YELLOW | 25-49 | Review recommended |
| RED | 50-100 | Dangerous — requires safe alternative |

---

## Pricing

| Feature | Free | Pro | Team | Enterprise |
|---------|:----:|:---:|:----:|:----------:|
| Static analysis (MP001-MP012) | Yes | Yes | Yes | Yes |
| SARIF output | Yes | Yes | Yes | Yes |
| GitHub Action PR comments | Yes | Yes | Yes | Yes |
| Production context queries | — | Yes | Yes | Yes |
| Production rules (MP013-MP014) | — | Yes | Yes | Yes |
| Enhanced risk scoring | — | Yes | Yes | Yes |

Get a license key at [migrationpilot.dev/pricing](https://migrationpilot.dev/pricing).

---

## PostgreSQL Lock Reference

| DDL Operation | Lock Type | Blocks Reads | Blocks Writes | Long-held |
|--------------|-----------|:---:|:---:|:---:|
| `CREATE INDEX` | SHARE | No | Yes | Yes |
| `CREATE INDEX CONCURRENTLY` | SHARE UPDATE EXCLUSIVE | No | No | No |
| `DROP INDEX` | ACCESS EXCLUSIVE | Yes | Yes | No |
| `DROP INDEX CONCURRENTLY` | SHARE UPDATE EXCLUSIVE | No | No | No |
| `ALTER TABLE ADD COLUMN` (no default) | ACCESS EXCLUSIVE | Yes | Yes | No |
| `ALTER TABLE ADD COLUMN DEFAULT now()` | ACCESS EXCLUSIVE | Yes | Yes | Yes* |
| `ALTER COLUMN TYPE` | ACCESS EXCLUSIVE | Yes | Yes | Yes |
| `SET NOT NULL` | ACCESS EXCLUSIVE | Yes | Yes | Yes |
| `ADD CONSTRAINT FK` | ACCESS EXCLUSIVE | Yes | Yes | Yes |
| `ADD CONSTRAINT FK NOT VALID` | ACCESS EXCLUSIVE | Yes | Yes | No |
| `VALIDATE CONSTRAINT` | SHARE UPDATE EXCLUSIVE | No | No | No |
| `RENAME COLUMN` | ACCESS EXCLUSIVE | Yes | Yes | No |
| `VACUUM FULL` | ACCESS EXCLUSIVE | Yes | Yes | Yes |
| `VACUUM` | SHARE UPDATE EXCLUSIVE | No | No | No |

\* On PG < 11, volatile defaults cause full table rewrite. On PG 11+, evaluated per-row at read time.

---

## Architecture

```
src/
├── parser/         # DDL parsing with libpg-query WASM
├── locks/          # Lock type classification (pure lookup)
├── rules/          # 14 static analysis rules (MP001-MP014)
├── production/     # Production context queries (Pro)
├── scoring/        # Risk scoring (RED/YELLOW/GREEN)
├── generator/      # Safe migration SQL generation
├── output/         # CLI, PR comment, and SARIF formatters
├── license/        # HMAC-SHA256 license key validation
├── billing/        # Stripe checkout + webhook + email delivery
├── action/         # GitHub Action entry point
└── cli.ts          # CLI entry point (commander)
```

---

## Development

```bash
# Install dependencies
pnpm install

# Run tests (175 tests)
pnpm test

# Run in dev mode
pnpm dev analyze path/to/migration.sql

# Build
pnpm build

# Lint
pnpm lint

# Type check
pnpm typecheck
```

---

## License

MIT
