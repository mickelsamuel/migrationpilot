# MigrationPilot snippet for GitHub Copilot

Paste the block below into `.github/copilot-instructions.md` in your repository.
Copilot loads that file automatically for every chat request in the workspace.

For a narrower scope, put it in `.github/instructions/migrations.instructions.md`
with this frontmatter, so it only applies to migration files:

```markdown
---
applyTo: "**/migrations/**/*.sql,**/db/migrate/**/*.sql,**/alembic/versions/**,**/prisma/migrations/**"
---
```

---

## PostgreSQL migrations

Before proposing, writing, or applying any PostgreSQL DDL, check it with
MigrationPilot. A migration that takes an `ACCESS EXCLUSIVE` lock on a busy
table is an outage, and the damage is done the moment it runs.

**Check when touching:** files under `migrations/`, `db/migrate/`,
`alembic/versions/`, `prisma/migrations/`, `supabase/migrations/`; raw
`CREATE INDEX` / `ALTER TABLE` / `DROP` / `ADD CONSTRAINT` / `ALTER TYPE` /
`REINDEX` / `TRUNCATE`; or any migration command (`psql -f`,
`prisma migrate deploy`, `alembic upgrade`, `flyway migrate`, `rails db:migrate`,
`knex migrate:latest`, `goose up`, `dbmate up`, `sqitch deploy`).

```bash
migrationpilot analyze path/to/migration.sql --format json
cat migration.sql | migrationpilot analyze --stdin --format json
migrationpilot check ./migrations --format json
migrationpilot analyze migration.sql --fix     # apply the safe rewrites
migrationpilot explain MP001                   # what a rule means
```

Not installed: `npx migrationpilot analyze migration.sql`. The CLI reads the
project's `.migrationpilotrc.yml` itself, so its verdict matches CI — never pass
`--no-config`.

**Reading the JSON.** Each entry in `violations[]` carries `ruleId`, `severity`
(`critical` or `warning`), `message`, `line`, `safeAlternative`, `whyItMatters`,
and `docsUrl`; `riskLevel` is `GREEN`, `YELLOW`, or `RED`. Exit codes: `0`
clean, `1` warnings (with `--fail-on warning`), `2` critical.

- `critical` — do not ship it. Rewrite using `safeAlternative`, then check again.
- `warning` — raise it with the user and let them decide; don't ignore it silently.
- No violations — proceed.

Prefer the `safeAlternative` MigrationPilot returns over inventing your own: it
already accounts for the lock the original statement would have taken.

**Rules of engagement.** Never add `-- migrationpilot-disable MP0xx` or set a
rule to `false` just to get past a violation — propose it, explain the risk, and
let the user decide. Re-check after every rewrite, because fixing one rule often
trips another (wrapping DDL in a transaction to add a lock timeout trips MP025:
`CONCURRENTLY` cannot run inside a transaction). A parse failure is not a pass.

**Common fixes**

| Pattern | Safe form |
|---|---|
| `CREATE INDEX` | `CREATE INDEX CONCURRENTLY` (outside a transaction) |
| `DROP INDEX` | `DROP INDEX CONCURRENTLY` |
| `SET NOT NULL` on a populated table | `ADD CONSTRAINT … CHECK (col IS NOT NULL) NOT VALID` → `VALIDATE CONSTRAINT` → `SET NOT NULL` |
| `ADD FOREIGN KEY` / `ADD CONSTRAINT … CHECK` | Add `NOT VALID`, then `VALIDATE CONSTRAINT` separately |
| Rename a column or table | Expand-contract across deploys: add new, backfill, dual-write, drop old |
| Change a column type | New column + batched backfill + swap; never in place on a large table |
| Any DDL | Prefix `SET lock_timeout = '5s';` so it fails fast instead of queueing |

There are 83 rules — run `migrationpilot explain MP0xx` instead of guessing what
one means.
