# MigrationPilot for Claude Code

A Claude Code plugin that stops unsafe PostgreSQL migrations before they are
written or run.

It ships two things:

- **A skill** that tells Claude to check migrations against MigrationPilot
  before writing DDL, and how to read the result.
- **A `PreToolUse` hook** that enforces it. When Claude writes a `.sql` file
  under a migrations directory, or runs a migration command, the hook analyzes
  the SQL and blocks the tool call if the project's own config says it would
  fail CI.

The skill is advice. The hook is the guardrail — it works whether or not Claude
remembered to ask.

## Install

The hook shells out to the `migrationpilot` CLI, so install that first:

```bash
npm install -g migrationpilot
# or, per-project:
npm install --save-dev migrationpilot
```

Then add the plugin. From a local checkout of this repository:

```bash
claude plugin install ./integrations/claude-code
```

Or point Claude Code at the directory in your settings:

```json
{
  "extraKnownMarketplaces": {
    "migrationpilot": {
      "source": { "source": "github", "repo": "mickelsamuel/migrationpilot" }
    }
  }
}
```

Verify it loaded:

```bash
claude plugin validate ./integrations/claude-code
```

### Pair it with the MCP server

The plugin covers writing and running migrations. The MCP server gives Claude
the analysis tools to reason with — including `check_before_apply`, the gate it
can call on its own before proposing any DDL:

```json
{
  "mcpServers": {
    "migrationpilot": {
      "command": "npx",
      "args": ["migrationpilot-mcp"]
    }
  }
}
```

## What the hook intercepts

| Tool | Trigger |
|---|---|
| `Write`, `Edit`, `MultiEdit` | A `.sql` file under a migration-ish path — `migrations/`, `db/migrate/`, `alembic/versions/`, `prisma/migrations/`, `supabase/migrations/`, `sqitch/`, `flyway/`, `liquibase/`, `changelog/` — or a versioned migration filename such as `V1__init.sql`, `20240101120000_add_index.sql`, `001_init.up.sql` |
| `Bash` | A migration runner: `psql`, `prisma migrate`, `alembic upgrade`, `flyway migrate`, `liquibase update`, `rails db:migrate`, `knex migrate:*`, `sequelize db:migrate`, `goose up`, `dbmate up`, `sqitch deploy`, `atlas migrate apply`, `golang-migrate`, `sqlx migrate run`, `drizzle-kit`, `typeorm migration:run`, Django `manage.py migrate`, `node-pg-migrate` |

For an `Edit`, the hook reconstructs the file as it would be *after* the edit
before analyzing it. Checking the replacement text alone would miss the case
that matters most — an edit that quietly deletes a `CONCURRENTLY`.

For a `Bash` command it analyzes any `.sql` files the command reads and any
inline `-c "…"` SQL. When a runner is recognised but its SQL is out of reach
(`prisma migrate deploy`, say), the hook does not block; it hands Claude a note
suggesting it check the migrations directory first.

## What it does with the result

- **Blocking violations** → the tool call is blocked (exit 2) and Claude is
  shown each violation, why it matters, the safe alternative, and the docs link.
- **Non-blocking violations** → the call proceeds, and the findings are passed
  to Claude as context so it can raise them with you.
- **Clean** → silence.

What counts as blocking is the project's own `.migrationpilotrc.yml`. The hook
runs `migrationpilot analyze --stdin --format json --offline` from your project
directory, so disabled rules, severity overrides, and the `failOn` threshold all
apply exactly as they do in CI. One config, one verdict, everywhere.

## It fails open, deliberately

If MigrationPilot is not installed, the SQL will not parse, the CLI times out,
or anything else goes wrong, the hook allows the tool call and writes a note to
stderr. The only path that blocks is: MigrationPilot ran, returned valid JSON,
and reported blocking violations.

A guardrail that breaks your workflow when it can't run gets uninstalled — and
then it guards nothing.

## Configuration

| Variable | Effect |
|---|---|
| `MIGRATIONPILOT_HOOK_DISABLE=1` | Turn the hook off entirely |
| `MIGRATIONPILOT_HOOK_FAILON=critical\|warning\|never` | Override the project's `failOn` for this hook only. `warning` blocks on warnings too; `never` blocks nothing but still reports |
| `MIGRATIONPILOT_BIN=/path/to/migrationpilot` | Use a specific binary. Disables the `npx` fallback |
| `MIGRATIONPILOT_HOOK_PATHS=infra/sql,ops` | Extra path fragments to treat as migration directories |
| `MIGRATIONPILOT_HOOK_BASH_PATTERNS=my-migrate-tool` | Extra regexes for commands to intercept |
| `MIGRATIONPILOT_HOOK_TIMEOUT=20000` | Per-analysis timeout in milliseconds |

## Blocked output

```
MigrationPilot blocked this change: 1 blocking violation(s) in 1 file(s)/statement(s).

db/migrations/003_add_email_index.sql  [risk: YELLOW]
  MP001 (critical) line 1 — require-concurrent-index-creation
    CREATE INDEX "idx_users_email" without CONCURRENTLY will lock all writes on
    "users" for the entire duration of index creation.
    Why: Without CONCURRENTLY, PostgreSQL takes an ACCESS EXCLUSIVE lock on the
    table, blocking all reads and writes for the entire duration of index
    creation. On tables with millions of rows, this can mean minutes of complete
    downtime.
    Safe alternative:
      CREATE INDEX CONCURRENTLY idx_users_email ON users (email)
    Docs: https://migrationpilot.dev/rules/mp001

Rewrite the migration using the safe alternatives above, then try again.
```

## Testing it yourself

The hook reads a `PreToolUse` payload on stdin, so you can drive it directly:

```bash
echo '{"tool_name":"Write","tool_input":{"file_path":"db/migrations/003.sql","content":"CREATE INDEX idx_users_email ON users (email);"}}' \
  | node integrations/claude-code/hooks/hook.js
echo "exit: $?"   # 2 = blocked
```

## Layout

```
integrations/claude-code/
├── .claude-plugin/plugin.json    # plugin manifest
├── hooks/
│   ├── hooks.json                # PreToolUse registration
│   └── hook.js                   # the guardrail
├── skills/migrationpilot/
│   └── SKILL.md                  # when and how to check a migration
└── package.json                  # pins the hook to CommonJS
```
