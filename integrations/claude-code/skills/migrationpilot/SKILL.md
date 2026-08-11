---
name: migrationpilot
description: Check PostgreSQL DDL and migrations for lock and downtime hazards before writing or running them. Use before creating or editing any migration file, before writing CREATE INDEX / ALTER TABLE / DROP / ADD CONSTRAINT, and before running any migration command (psql, prisma migrate, alembic upgrade, flyway migrate, rails db:migrate, knex, goose, dbmate, sqitch, atlas, golang-migrate). Also use when asked whether a migration is safe, what lock a statement takes, or why a MigrationPilot rule (MP001-MP083) fired.
---

# MigrationPilot: check migrations before they ship

A migration that takes an `ACCESS EXCLUSIVE` lock on a busy table is a
production outage, not a code review comment. The damage is done the moment
the statement runs, and no amount of reverting undoes the minutes of blocked
traffic. So the check has to happen *before* the SQL is written or executed —
not after.

## When to use this

Run the check before you:

- write or edit a file under `migrations/`, `db/migrate/`, `alembic/versions/`,
  `prisma/migrations/`, `supabase/migrations/`, or any similar folder
- write raw DDL: `CREATE INDEX`, `ALTER TABLE`, `DROP …`, `ADD CONSTRAINT`,
  `ALTER TYPE`, `REINDEX`, `REFRESH MATERIALIZED VIEW`, `TRUNCATE`
- run a migration: `psql -f`, `prisma migrate deploy`, `alembic upgrade`,
  `flyway migrate`, `liquibase update`, `rails db:migrate`, `knex migrate:latest`,
  `goose up`, `dbmate up`, `sqitch deploy`, `atlas migrate apply`, `migrate … up`
- answer "is this migration safe?", "what lock does this take?", or "why did
  MP0xx fire?"

Checking a migration you did not write is just as valuable as checking your
own. If the user pastes DDL and asks anything about it, check it.

## How to check

**If the MigrationPilot MCP server is connected**, call the tools directly:

| Question | Tool |
|---|---|
| May I write or run this DDL? | `check_before_apply` — returns `pass`/`fail` under the project's own config |
| What's wrong with this SQL? | `analyze_migration` — violations, risk score, lock analysis |
| Is the whole folder clean? | `analyze_migration_dir` |
| What lock does this take? | `explain_lock` |
| Why did MP0xx fire, and what do I do? | `get_rule` |
| Can this be fixed automatically? | `suggest_fix` |

`check_before_apply` is the gate. It resolves the project's own
`.migrationpilotrc.yml` — disabled rules, severity overrides, `failOn`
threshold — so its verdict matches what the team's CI will do. A `fail` verdict
means do not write the file and do not run the command.

**Otherwise use the CLI:**

```bash
migrationpilot analyze path/to/migration.sql          # one file
cat migration.sql | migrationpilot analyze --stdin    # SQL you have in hand
migrationpilot check ./migrations                     # a whole directory
migrationpilot analyze migration.sql --format json    # machine-readable
migrationpilot analyze migration.sql --fix            # apply the safe rewrites
migrationpilot explain MP001                          # what a rule means
```

Not installed? `npx migrationpilot analyze migration.sql`, or
`npm install -g migrationpilot`.

## Reading the result

JSON output (`--format json`) carries what you need:

```jsonc
{
  "riskLevel": "RED",            // GREEN | YELLOW | RED
  "riskScore": 78,
  "violations": [
    {
      "ruleId": "MP001",
      "severity": "critical",     // critical | warning
      "message": "CREATE INDEX \"idx_users_email\" without CONCURRENTLY will lock all writes on \"users\" …",
      "line": 1,
      "safeAlternative": "CREATE INDEX CONCURRENTLY idx_users_email ON users (email);",
      "whyItMatters": "…",
      "docsUrl": "https://migrationpilot.dev/rules/mp001"
    }
  ],
  "summary": { "criticalCount": 1, "warningCount": 0 }
}
```

Exit codes: `0` clean, `1` warnings (when `--fail-on warning`), `2` critical.

- **`critical`** — do not ship it. Rewrite using `safeAlternative`, then check again.
- **`warning`** — tell the user what it is and let them decide. Don't silently ignore it.
- **`GREEN` with no violations** — proceed.

Prefer the rewrite MigrationPilot hands you over inventing your own. It already
accounts for the lock the original statement would have taken.

## Rules of engagement

- **Never suppress a violation to get past it.** `-- migrationpilot-disable MP0xx`
  and `rules: { MP0xx: false }` are the user's call, not yours. Propose it,
  explain the risk, and let them decide.
- **Re-check after every rewrite.** A fix for one rule routinely trips another —
  wrapping DDL in a transaction to add a lock timeout can trip MP025
  (`CONCURRENTLY` cannot run inside a transaction).
- **If it won't parse, say so.** A parse failure is not a pass. PostgreSQL 18-only
  syntax is not yet parseable and needs a human read.
- **Report the verdict honestly.** If a migration is risky and the user wants it
  anyway, that is their decision to make with the facts in front of them.

## The common fixes

| Pattern | Safe form |
|---|---|
| `CREATE INDEX` | `CREATE INDEX CONCURRENTLY` (outside a transaction) |
| `DROP INDEX` | `DROP INDEX CONCURRENTLY` |
| `SET NOT NULL` on a populated table | `ADD CONSTRAINT … CHECK (col IS NOT NULL) NOT VALID` → `VALIDATE CONSTRAINT` → `SET NOT NULL` |
| `ADD FOREIGN KEY` | Add `NOT VALID`, then `VALIDATE CONSTRAINT` separately |
| `ADD CONSTRAINT … CHECK` | Add `NOT VALID`, then validate |
| Renaming a column or table | Expand-contract across deploys: add new, backfill, dual-write, drop old |
| Changing a column's type | New column + backfill in batches + swap; never in place on a large table |
| Any DDL at all | Prefix `SET lock_timeout = '5s';` so it fails fast instead of queueing |

`migrationpilot explain MP0xx` (or the `get_rule` tool) has the full reasoning
for any rule. There are 83 of them; don't guess at what one means.
