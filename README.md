# MigrationPilot

[![npm version](https://img.shields.io/npm/v/migrationpilot.svg)](https://www.npmjs.com/package/migrationpilot)
[![CI](https://github.com/mickelsamuel/migrationpilot/actions/workflows/ci.yml/badge.svg)](https://github.com/mickelsamuel/migrationpilot/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

**Know exactly what your PostgreSQL migration will do to production — before you merge.**

MigrationPilot is a static analysis tool for PostgreSQL schema migrations. It parses your SQL with the actual PostgreSQL parser (libpg-query), classifies every lock acquired, flags dangerous patterns with 48 safety rules, scores overall risk, and suggests safe alternatives — all without touching your database. Works as a CLI, a GitHub Action, and a Node.js library.

---

## Quick Start

### CLI

```bash
npm install -g migrationpilot

# Analyze a migration file
migrationpilot analyze migrations/001_add_index.sql

# Check all migrations in a directory
migrationpilot check migrations/ --pattern "*.sql"

# Auto-fix what's fixable
migrationpilot analyze migrations/001.sql --fix
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
      - uses: mickelsamuel/migrationpilot@v1
        with:
          migration-path: "migrations/*.sql"
          fail-on: critical
```

### Pipe from any framework

```bash
# Django
python manage.py sqlmigrate myapp 0042 | migrationpilot analyze --stdin

# Prisma
npx prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-migrations migrations --script | migrationpilot analyze --stdin

# Knex
knex migrate:up --knexfile knexfile.js 2>&1 | migrationpilot analyze --stdin
```

---

## CLI Commands

| Command | Description |
|---------|-------------|
| `analyze <file>` | Analyze a single SQL migration file |
| `check <dir>` | Check all migration files in a directory |
| `plan <file>` | Show execution plan with timeline visualization |
| `init` | Generate a `.migrationpilotrc.yml` config file |
| `detect` | Auto-detect migration framework (14 supported) |
| `watch <dir>` | Watch migration files and re-analyze on change |
| `hook` | Install/uninstall git pre-commit hook |
| `list-rules` | List all 48 safety rules with metadata |

## CLI Options

| Option | Commands | Description | Default |
|--------|----------|-------------|---------|
| `--pg-version <n>` | analyze, check | Target PostgreSQL version (9-20) | `17` |
| `--format <fmt>` | analyze, check | Output: `text`, `json`, `sarif`, `markdown` | `text` |
| `--fail-on <level>` | analyze, check | Exit code threshold: `critical`, `warning`, `never` | `critical` |
| `--fix` | analyze | Auto-fix violations in-place (6 rules) | — |
| `--dry-run` | analyze | Preview auto-fix changes without writing | — |
| `--quiet` | analyze, check | One-line-per-violation (gcc-style) output | — |
| `--verbose` | analyze | Per-statement PASS/FAIL for all rules | — |
| `--stdin` | analyze | Read SQL from stdin instead of file | — |
| `--exclude <rules>` | analyze, check | Comma-separated rule IDs to skip | — |
| `--database-url <url>` | analyze, check | PostgreSQL connection for production context (Pro) | — |
| `--license-key <key>` | analyze, check | License key for Pro features | — |
| `--pattern <glob>` | check | File pattern for directory scanning | `*.sql` |
| `--no-color` | all | Disable colored output | — |
| `--json` | list-rules | Output rules as JSON array | — |

Environment variables: `MIGRATIONPILOT_LICENSE_KEY`, `NO_COLOR`, `TERM=dumb`.

---

## All 48 Rules

### Lock Safety (Critical)

| Rule | Name | Auto-fix | What it catches |
|------|------|:--------:|-----------------|
| MP001 | require-concurrent-index | Yes | `CREATE INDEX` without `CONCURRENTLY` blocks writes |
| MP002 | require-check-not-null | — | `SET NOT NULL` without CHECK pattern scans full table |
| MP003 | volatile-default-rewrite | — | `ADD COLUMN DEFAULT now()` rewrites table on PG < 11 |
| MP004 | require-lock-timeout | Yes | DDL without `SET lock_timeout` blocks queue |
| MP005 | require-not-valid-fk | — | `ADD CONSTRAINT FK` without `NOT VALID` scans full table |
| MP006 | no-vacuum-full | — | `VACUUM FULL` rewrites table under ACCESS EXCLUSIVE |
| MP007 | no-column-type-change | — | `ALTER COLUMN TYPE` rewrites table |
| MP008 | no-multi-ddl-transaction | — | Multiple DDL in one transaction compound lock time |
| MP025 | ban-concurrent-in-transaction | — | CONCURRENTLY ops inside a transaction = runtime ERROR |
| MP026 | ban-drop-table | — | `DROP TABLE` permanently removes table and data |
| MP027 | disallowed-unique-constraint | — | UNIQUE constraint without USING INDEX scans full table |
| MP030 | require-not-valid-check | Yes | CHECK constraint without `NOT VALID` scans full table |
| MP031 | ban-exclusion-constraint | — | EXCLUSION constraint builds GiST index under ACCESS EXCLUSIVE |
| MP032 | ban-cluster | — | `CLUSTER` rewrites table under ACCESS EXCLUSIVE |
| MP034 | ban-drop-database | — | `DROP DATABASE` in a migration file |
| MP035 | ban-drop-schema | — | `DROP SCHEMA` permanently removes schema + objects |
| MP036 | ban-truncate-cascade | — | `TRUNCATE CASCADE` silently truncates FK-referencing tables |
| MP046 | require-concurrent-detach-partition | — | `DETACH PARTITION` without CONCURRENTLY (PG 14+) |
| MP047 | ban-set-logged-unlogged | — | `SET LOGGED/UNLOGGED` rewrites entire table |

### Warnings

| Rule | Name | Auto-fix | What it catches |
|------|------|:--------:|-----------------|
| MP009 | require-drop-index-concurrently | Yes | `DROP INDEX` without `CONCURRENTLY` |
| MP010 | no-rename-column | — | `RENAME COLUMN` breaks app queries |
| MP011 | unbatched-backfill | — | `UPDATE` without WHERE (full table scan) |
| MP012 | no-enum-add-in-transaction | — | `ALTER TYPE ADD VALUE` inside transaction |
| MP015 | no-add-column-serial | — | SERIAL creates implicit sequence (use IDENTITY) |
| MP016 | require-fk-index | — | FK columns without index = slow cascading deletes |
| MP017 | no-drop-column | — | `DROP COLUMN` under ACCESS EXCLUSIVE |
| MP018 | no-force-set-not-null | — | `SET NOT NULL` without CHECK pre-validation |
| MP020 | require-statement-timeout | Yes | Long-running DDL without `statement_timeout` |
| MP021 | require-concurrent-reindex | — | `REINDEX` without `CONCURRENTLY` (PG 12+) |
| MP022 | no-drop-cascade | — | `DROP CASCADE` silently drops dependents |
| MP023 | require-if-not-exists | — | `CREATE TABLE/INDEX` without `IF NOT EXISTS` |
| MP024 | no-enum-value-removal | — | `DROP TYPE` destroys enum + dependent columns |
| MP028 | no-rename-table | — | `RENAME TABLE` breaks queries, views, FKs |
| MP029 | ban-drop-not-null | — | `DROP NOT NULL` may break app assumptions |
| MP033 | require-concurrent-refresh-matview | Yes | `REFRESH MATERIALIZED VIEW` without CONCURRENTLY |
| MP037 | prefer-text-over-varchar | — | `VARCHAR(n)` has no benefit over `TEXT` in PostgreSQL |
| MP038 | prefer-bigint-over-int | — | `INT` PK/FK columns can overflow (use `BIGINT`) |
| MP039 | prefer-identity-over-serial | — | SERIAL quirks — use `GENERATED ALWAYS AS IDENTITY` |
| MP040 | prefer-timestamptz | — | `TIMESTAMP` without timezone causes timezone bugs |
| MP041 | ban-char-field | — | `CHAR(n)` wastes space, causes comparison bugs |
| MP042 | require-index-name | — | Unnamed indexes are hard to reference |
| MP043 | ban-domain-constraint | — | Domain constraints validate against ALL using columns |
| MP044 | no-data-loss-type-narrowing | — | Narrowing column type (e.g., `BIGINT → INT`) can lose data |
| MP045 | require-primary-key | — | Tables without PK break replication |
| MP048 | ban-alter-default-volatile | — | Volatile `SET DEFAULT` on existing column is misleading |

### Production Context (Pro)

| Rule | Name | What it catches |
|------|------|-----------------|
| MP013 | high-traffic-table-ddl | DDL on tables with 10K+ queries |
| MP014 | large-table-ddl | Long-held locks on tables with 1M+ rows |
| MP019 | no-exclusive-lock-high-connections | ACCESS EXCLUSIVE with many active connections |

**Auto-fix**: 6 rules can be automatically fixed with `--fix`: MP001, MP004, MP009, MP020, MP030, MP033.

---

## Features

### Auto-fix

```bash
migrationpilot analyze migration.sql --fix         # Fix in-place
migrationpilot analyze migration.sql --fix --dry-run  # Preview changes
```

Automatically fixes: missing CONCURRENTLY, lock_timeout, statement_timeout, NOT VALID on CHECK constraints, CONCURRENTLY on materialized view refresh.

### Framework Detection

```bash
migrationpilot detect
# → Detected: Prisma (prisma/migrations/)
```

Detects 14 frameworks: Flyway, Liquibase, Alembic, Django, Knex, Prisma, TypeORM, Drizzle, Sequelize, goose, dbmate, Sqitch, Rails, Ecto.

### Watch Mode

```bash
migrationpilot watch migrations/ --pattern "*.sql"
```

Re-analyzes on file changes with intelligent debouncing.

### Pre-commit Hook

```bash
migrationpilot hook install   # Installs git hook (supports Husky)
migrationpilot hook uninstall
```

### Execution Plan

```bash
migrationpilot plan migration.sql
```

Visual timeline showing lock type, duration estimate, blocking impact, and transaction boundaries for each statement.

### Config File

```yaml
# .migrationpilotrc.yml
extends: "migrationpilot:strict"   # Built-in preset
pgVersion: 16
failOn: warning
rules:
  MP037: false                     # Disable a rule
  MP004:
    severity: warning              # Downgrade severity
  MP013:
    threshold: 5000                # Custom threshold
ignore:
  - "migrations/seed_*.sql"
```

Three built-in presets: `migrationpilot:recommended` (default), `migrationpilot:strict` (all rules at critical, fail on warning), `migrationpilot:ci`.

### Inline Disable

```sql
-- migrationpilot-disable MP001
CREATE INDEX idx_users_email ON users (email);

-- migrationpilot-disable-next-line MP004
ALTER TABLE users ADD COLUMN bio TEXT;
```

### Severity Overrides

Override any rule's severity via config:

```yaml
rules:
  MP009:
    severity: critical   # Upgrade from warning to critical
  MP007:
    severity: warning    # Downgrade from critical to warning
```

### PG Version Awareness

Rules adapt their advice based on `--pg-version`:

- **PG 10+**: Recommends `GENERATED ALWAYS AS IDENTITY` over SERIAL
- **PG 11+**: Non-volatile `ADD COLUMN DEFAULT` is safe (no rewrite)
- **PG 12+**: `REINDEX CONCURRENTLY` available
- **PG 14+**: `DETACH PARTITION CONCURRENTLY` available
- **PG 18+**: `SET NOT NULL NOT VALID` + `VALIDATE NOT NULL` pattern

---

## Output Formats

| Format | Flag | Use case |
|--------|------|----------|
| Text | `--format text` (default) | Terminal with colors, tables, risk bars |
| JSON | `--format json` | Scripting, CI pipelines (versioned `$schema`) |
| SARIF | `--format sarif` | GitHub Code Scanning, VS Code, IntelliJ |
| Markdown | `--format markdown` | Docs, wikis, Notion |
| Quiet | `--quiet` | One-line-per-violation (gcc-style) |
| Verbose | `--verbose` | Per-statement PASS/FAIL for all 48 rules |

### JSON Schema

JSON output includes a `$schema` URL and version field for reliable parsing:

```json
{
  "$schema": "https://migrationpilot.dev/schemas/report-v1.json",
  "version": "1.1.0",
  "file": "migrations/001.sql",
  "riskLevel": "RED",
  "riskScore": 80,
  "violations": [...]
}
```

### SARIF

```bash
# CLI
migrationpilot analyze migration.sql --format sarif > results.sarif

# GitHub Action (auto-generated)
- uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: ${{ steps.migration-check.outputs.sarif-file }}
```

---

## Production Context (Pro)

With a Pro license + `--database-url`, MigrationPilot connects read-only to query system catalogs:

| Data Source | What it provides |
|-------------|-----------------|
| `pg_class` | Table row counts, total size, index count |
| `pg_stat_statements` | Affected queries by call frequency |
| `pg_stat_activity` | Active connections on target tables |

This data feeds into risk scoring (table size 0-30 pts, query frequency 0-30 pts) and unlocks rules MP013, MP014, MP019.

**Safety**: Only reads `pg_stat_*` and `pg_class`. Never reads user data. Never runs DDL. Single read-only connection with timeouts.

---

## Risk Scoring

| Factor | Weight | Free | Pro |
|--------|--------|:----:|:---:|
| Lock Severity | 0-40 | Yes | Yes |
| Table Size | 0-30 | — | Yes |
| Query Frequency | 0-30 | — | Yes |

| Level | Score | Meaning |
|-------|-------|---------|
| GREEN | 0-24 | Safe to deploy |
| YELLOW | 25-49 | Review recommended |
| RED | 50-100 | Dangerous — use safe alternative |

---

## GitHub Action

### Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `migration-path` | Glob pattern for SQL files | Yes | — |
| `github-token` | GitHub token for PR comments | No | `${{ github.token }}` |
| `license-key` | Pro license key | No | — |
| `database-url` | PostgreSQL connection (Pro) | No | — |
| `pg-version` | Target PostgreSQL version | No | `17` |
| `fail-on` | Fail threshold: `critical`, `warning`, `never` | No | `critical` |

### Outputs

| Output | Description |
|--------|-------------|
| `risk-level` | Overall: `RED`, `YELLOW`, or `GREEN` |
| `violations` | Total violation count |
| `sarif-file` | Path to SARIF file for Code Scanning upload |

### With Production Context + Code Scanning (Pro)

```yaml
- uses: mickelsamuel/migrationpilot@v1
  id: migration-check
  with:
    migration-path: "migrations/*.sql"
    license-key: ${{ secrets.MIGRATIONPILOT_LICENSE_KEY }}
    database-url: ${{ secrets.DATABASE_URL }}
    fail-on: critical

- uses: github/codeql-action/upload-sarif@v3
  if: always()
  with:
    sarif_file: ${{ steps.migration-check.outputs.sarif-file }}
```

---

## PostgreSQL Lock Reference

| DDL Operation | Lock Type | Blocks Reads | Blocks Writes | Long-held |
|---------------|-----------|:---:|:---:|:---:|
| `CREATE INDEX` | SHARE | No | Yes | Yes |
| `CREATE INDEX CONCURRENTLY` | SHARE UPDATE EXCLUSIVE | No | No | No |
| `DROP INDEX` | ACCESS EXCLUSIVE | Yes | Yes | No |
| `DROP INDEX CONCURRENTLY` | SHARE UPDATE EXCLUSIVE | No | No | No |
| `ADD COLUMN` (no default) | ACCESS EXCLUSIVE | Yes | Yes | No |
| `ADD COLUMN DEFAULT now()` | ACCESS EXCLUSIVE | Yes | Yes | Yes* |
| `ALTER COLUMN TYPE` | ACCESS EXCLUSIVE | Yes | Yes | Yes |
| `SET NOT NULL` | ACCESS EXCLUSIVE | Yes | Yes | Yes |
| `ADD CONSTRAINT FK` | ACCESS EXCLUSIVE | Yes | Yes | Yes |
| `ADD CONSTRAINT FK NOT VALID` | ACCESS EXCLUSIVE | Yes | Yes | No |
| `VALIDATE CONSTRAINT` | SHARE UPDATE EXCLUSIVE | No | No | No |
| `RENAME COLUMN/TABLE` | ACCESS EXCLUSIVE | Yes | Yes | No |
| `DROP TABLE` | ACCESS EXCLUSIVE | Yes | Yes | No |
| `TRUNCATE` | ACCESS EXCLUSIVE | Yes | Yes | No |
| `CLUSTER` | ACCESS EXCLUSIVE | Yes | Yes | Yes |
| `VACUUM FULL` | ACCESS EXCLUSIVE | Yes | Yes | Yes |
| `VACUUM` | SHARE UPDATE EXCLUSIVE | No | No | No |
| `REINDEX` | ACCESS EXCLUSIVE | Yes | Yes | Yes |
| `REINDEX CONCURRENTLY` | SHARE UPDATE EXCLUSIVE | No | No | No |
| `REFRESH MATERIALIZED VIEW` | ACCESS EXCLUSIVE | Yes | Yes | Yes |
| `REFRESH MATERIALIZED VIEW CONCURRENTLY` | SHARE UPDATE EXCLUSIVE | No | No | No |
| `SET LOGGED/UNLOGGED` | ACCESS EXCLUSIVE | Yes | Yes | Yes |
| `DETACH PARTITION` | ACCESS EXCLUSIVE | Yes | Yes | No |
| `DETACH PARTITION CONCURRENTLY` | SHARE UPDATE EXCLUSIVE | No | No | No |

\* On PG < 11, volatile defaults cause full table rewrite. On PG 11+, evaluated per-row at read time.

---

## Comparison

| | MigrationPilot | Squawk | Atlas |
|---|:---:|:---:|:---:|
| Total rules | **48** | 31 | ~15 |
| Free rules | **45** | 31 | 0 (paywalled since v0.38) |
| Auto-fix | **6 rules** | 0 | 0 |
| Output formats | **6** (text, JSON, SARIF, markdown, quiet, verbose) | 3 | 2 |
| Framework detection | **14 frameworks** | 0 | 0 |
| Watch mode | Yes | No | No |
| Pre-commit hooks | Yes | No | No |
| Execution plan | Yes | No | No |
| Config file + presets | **3 presets** | 0 | 0 |
| PG-version-aware | **Full** (9-20) | Partial | Partial |
| Programmatic API | **Node.js** | No | Go |
| GitHub Action | Yes | No | Yes |
| SARIF for Code Scanning | Yes | No | No |
| Inline disable comments | Yes | No | No |
| Open source | **MIT** | Apache 2.0 | Proprietary |

---

## Pricing

| Feature | Free | Pro ($29/mo) | Enterprise |
|---------|:----:|:---:|:----------:|
| 45 safety rules (MP001-MP048 excl. 013/014/019) | Yes | Yes | Yes |
| All output formats (text, JSON, SARIF, markdown) | Yes | Yes | Yes |
| GitHub Action PR comments | Yes | Yes | Yes |
| Auto-fix (6 rules) | Yes | Yes | Yes |
| Config file, presets, inline disable | Yes | Yes | Yes |
| Production context (table sizes, query frequency) | — | Yes | Yes |
| Production rules (MP013, MP014, MP019) | — | Yes | Yes |
| Enhanced risk scoring | — | Yes | Yes |
| Priority support | — | Yes | Yes |
| Team license management | — | — | Yes |
| SSO / SAML + audit log | — | — | Yes |

Get a license key at [migrationpilot.dev/pricing](https://migrationpilot.dev/pricing).

---

## Architecture

```
src/
├── parser/        # DDL parsing with libpg-query WASM (actual PG parser)
├── locks/         # Lock type classification (pure lookup table)
├── rules/         # 48 safety rules (MP001-MP048), engine, registry, helpers
├── production/    # Production context queries (Pro: pg_stat_*, pg_class)
├── scoring/       # Risk scoring (RED/YELLOW/GREEN, 0-100)
├── generator/     # Safe migration SQL generation
├── output/        # CLI, JSON, SARIF, markdown, PR comment, execution plan
├── analysis/      # Shared pipeline, transaction boundaries, migration ordering
├── fixer/         # Auto-fix engine (6 rules)
├── frameworks/    # Migration framework detection (14 frameworks)
├── watch/         # File watcher with debounce
├── hooks/         # Git pre-commit hook installer
├── config/        # Config loader (.migrationpilotrc.yml, presets)
├── license/       # HMAC-SHA256 license key validation
├── billing/       # Stripe checkout + webhook + email delivery
├── action/        # GitHub Action entry point
├── index.ts       # Programmatic API (17 exports)
└── cli.ts         # CLI entry point (8 commands)
```

---

## Programmatic API

```typescript
import { analyzeSQL, allRules, parseMigration, classifyLock } from 'migrationpilot';

const result = analyzeSQL(sql, allRules, { pgVersion: 16 });
console.log(result.violations);
console.log(result.overallRisk);
```

Full TypeScript types included. See [API documentation](https://migrationpilot.dev/docs/api).

---

## Development

```bash
pnpm install
pnpm test          # 550+ tests across 31 files
pnpm dev analyze path/to/migration.sql
pnpm build         # CLI 835KB, Action 1.2MB, API 219KB
pnpm lint
pnpm typecheck
```

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## Security

See [SECURITY.md](SECURITY.md) for our security policy.

## License

MIT
