# MigrationPilot

**Know exactly what your PostgreSQL migration will do to production — before you merge.**

MigrationPilot analyzes your SQL schema migrations and tells you:
- What **locks** each DDL statement acquires
- Whether it **blocks reads, writes, or both**
- How **long** the lock is held (brief vs. table scan/rewrite)
- An overall **risk score** (RED / YELLOW / GREEN)
- **Safe alternatives** when dangerous patterns are detected

Works as a **CLI tool** and a **GitHub Action** that posts safety reports directly on your PRs.

---

## Quick Start

### CLI

```bash
npm install -g migrationpilot

# Analyze a single migration file
migrationpilot analyze migrations/001_add_users_email.sql

# Check all migrations in a directory
migrationpilot check migrations/ --pattern "*.sql"
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
      - uses: mickelsamuel/migrationpilot@v0.1.0
        with:
          migration-path: "migrations/*.sql"
          fail-on: critical
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
| `--format <fmt>` | Output format: `text` or `json` | `text` |
| `--fail-on <level>` | Exit code 1 on: `critical`, `warning`, or `never` | `critical` |

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
| `pg-version` | Target PostgreSQL version | No | `17` |
| `fail-on` | Fail CI on: `critical`, `warning`, `never` | No | `critical` |

### Outputs

| Output | Description |
|--------|-------------|
| `risk-level` | Overall risk: `RED`, `YELLOW`, or `GREEN` |
| `violations` | Number of violations found |

### PR Comment

MigrationPilot posts a safety report directly on your PR with:
- DDL operations table with lock types and risk levels
- Safety violations with severity and explanations
- Collapsible safe alternatives for each violation
- Risk score breakdown

The comment is automatically updated on each push — no duplicate comments.

---

## Rules

| Rule | Name | Severity | What it catches |
|------|------|----------|-----------------|
| MP001 | require-concurrent-index | Critical | `CREATE INDEX` without `CONCURRENTLY` |
| MP002 | require-check-not-null | Critical | `SET NOT NULL` without preceding CHECK constraint |
| MP003 | volatile-default-rewrite | Critical/Warning | `ADD COLUMN` with volatile `DEFAULT` (e.g., `now()`) |
| MP004 | require-lock-timeout | Critical | DDL without preceding `SET lock_timeout` |
| MP005 | require-not-valid-fk | Critical | `ADD CONSTRAINT FK` without `NOT VALID` |
| MP006 | no-vacuum-full | Critical | `VACUUM FULL` (use `pg_repack` instead) |
| MP007 | no-column-type-change | Critical | `ALTER COLUMN TYPE` (requires table rewrite) |
| MP008 | no-multi-ddl-transaction | Critical | Multiple DDL in a single `BEGIN...COMMIT` |

---

## Risk Scoring

Risk score ranges from 0-100, composed of:

| Factor | Weight | Free tier | Pro tier |
|--------|--------|-----------|----------|
| Lock Severity | 0-40 | Yes | Yes |
| Table Size | 0-30 | — | Yes |
| Query Frequency | 0-30 | — | Yes |

| Level | Score | Meaning |
|-------|-------|---------|
| GREEN | 0-24 | Safe to deploy |
| YELLOW | 25-49 | Review recommended |
| RED | 50-100 | Dangerous — requires safe alternative |

---

## PostgreSQL Lock Reference

| DDL Operation | Lock Type | Blocks Reads | Blocks Writes | Long-held |
|--------------|-----------|:---:|:---:|:---:|
| `CREATE INDEX` | SHARE | No | Yes | Yes |
| `CREATE INDEX CONCURRENTLY` | SHARE UPDATE EXCLUSIVE | No | No | No |
| `ALTER TABLE ADD COLUMN` (no default) | ACCESS EXCLUSIVE | Yes | Yes | No |
| `ALTER TABLE ADD COLUMN DEFAULT now()` | ACCESS EXCLUSIVE | Yes | Yes | Yes* |
| `ALTER COLUMN TYPE` | ACCESS EXCLUSIVE | Yes | Yes | Yes |
| `SET NOT NULL` | ACCESS EXCLUSIVE | Yes | Yes | Yes |
| `ADD CONSTRAINT FK` | ACCESS EXCLUSIVE | Yes | Yes | Yes |
| `ADD CONSTRAINT FK NOT VALID` | ACCESS EXCLUSIVE | Yes | Yes | No |
| `VALIDATE CONSTRAINT` | SHARE UPDATE EXCLUSIVE | No | No | No |
| `VACUUM FULL` | ACCESS EXCLUSIVE | Yes | Yes | Yes |
| `VACUUM` | SHARE UPDATE EXCLUSIVE | No | No | No |

\* On PG < 11, volatile defaults cause full table rewrite. On PG 11+, evaluated per-row at read time.

---

## Development

```bash
# Install dependencies
pnpm install

# Run tests (79 tests)
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
