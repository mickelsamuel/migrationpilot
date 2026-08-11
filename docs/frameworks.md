# Migration frameworks

Run `migrationpilot check` with no arguments inside your repo. It works out which
migration tool you use, finds the SQL that tool will run, puts it in the order
the tool will run it in, and analyzes that.

```
$ migrationpilot check
Detected Prisma — analyzing 14 migrations from prisma/migrations/
  Ordering: migration folder name (timestamp), the order Prisma applies them in
```

No `--pattern`, no path, no config file. If MigrationPilot can't read your SQL —
because your migrations are Python, or Ruby, or built at runtime — it says so and
tells you which command produces the SQL, instead of reporting a clean run over
nothing.

## Support matrix

| Framework | Support | What gets read | Ordering source |
|---|---|---|---|
| Prisma | full | `prisma/migrations/*/migration.sql` | migration folder timestamp |
| Drizzle | full | the `out` directory's `.sql` files | `meta/_journal.json` (`idx`) |
| Flyway | full | `V*__*.sql`, `R__*.sql` in the configured locations | version order, then repeatable by description |
| Liquibase (formatted SQL) | full | files starting `--liquibase formatted sql` | file path order |
| goose | full | the `-- +goose Up` section of each file | numeric filename prefix |
| dbmate | full | the `-- migrate:up` section of each file | numeric filename prefix |
| Sqitch | full | `deploy/*.sql` | change order in `sqitch.plan` |
| TypeORM | extracted | string literals in `queryRunner.query(...)` | filename timestamp |
| Knex | extracted | string literals in `knex.raw(...)` | filename order |
| Sequelize | extracted | string literals in `sequelize.query(...)` | filename order |
| Django | recipe | nothing — SQL comes from `manage.py sqlmigrate` | dependency graph |
| Alembic | recipe | nothing — SQL comes from `alembic … --sql` | revision chain |
| Rails | recipe | nothing — ActiveRecord renders SQL at apply time | filename timestamp |
| Liquibase (XML/YAML/JSON) | recipe | nothing — SQL comes from `liquibase updateSQL` | changelog order |

**full** — the migrations already are SQL on disk. MigrationPilot reads the files,
orders them the way the framework does, and analyzes all of it.

**extracted** — the migrations are code. Raw SQL written as a plain string literal
is pulled out and analyzed for real. SQL that the file builds at runtime is
listed per file with the reason it couldn't be read. Nothing is inferred.

**recipe** — the SQL doesn't exist until the framework generates it. MigrationPilot
reports what it found, explains why there's nothing to analyze, and gives you the
command that produces the SQL. Pipe that command's output back in with
`--from-command` and you get a real analysis.

---

## Tier 1: SQL on disk

### Prisma

Reads every `prisma/migrations/<timestamp>_<name>/migration.sql` and orders them by
folder name, which is what Prisma does. A folder with no `migration.sql` is
reported, not skipped silently.

Custom locations are honored: `migrations.path` and `schema` in `prisma.config.ts`,
and the `prisma.schema` key in `package.json`. If `migration_lock.toml` names a
provider other than `postgresql`, you get a note — the rules are PostgreSQL-specific.

```
migrationpilot check                    # auto-detect
migrationpilot check . --framework prisma
```

### Drizzle

The `out` directory comes from `drizzle.config.ts` (default `./drizzle`). Order
comes from `meta/_journal.json`, sorted by `idx` — not from filenames, because the
journal is what drizzle-kit actually applies.

SQL files missing from the journal still get analyzed, last, each with a note that
drizzle-kit won't apply them yet. `--> statement-breakpoint` markers are SQL
comments, so they pass straight through.

### Flyway

Locations come from `flyway.conf` (`flyway.locations=`) or `flyway.toml`, with
`filesystem:` and `classpath:` prefixes both handled — a classpath location is
looked for under `src/main/resources/`, `src/test/resources/`, and the bare path.
With no config, MigrationPilot checks `sql/`, `db/migration/`,
`src/main/resources/db/migration/` and `migrations/`.

Ordering is Flyway's: versioned migrations first, compared part by part and
numerically, so `V10` lands after `V2` and `V1.1` after `V1`. Repeatable `R__`
migrations run last, ordered by description.

Undo migrations (`U__`) are listed as skipped. They only run on `flyway undo`, so
analyzing them alongside the forward path would be misleading. Custom
`sqlMigrationPrefix`, `sqlMigrationSeparator`, `repeatableSqlMigrationPrefix`,
`undoSqlMigrationPrefix` and `sqlMigrationSuffixes` settings are read from either
config file.

### Liquibase

Two very different cases, and MigrationPilot is explicit about which one you're in.

Formatted SQL changelogs — files whose first non-empty line is
`--liquibase formatted sql` — are real SQL and get read directly. `--changeset` and
`--rollback` lines are comments, so the rollback half is ignored for free, which is
what you want.

XML, YAML and JSON changelogs describe changes abstractly. `<addColumn>` doesn't
become SQL until Liquibase renders it for your database, so MigrationPilot won't
pretend to know what it will look like. Render it yourself:

```
liquibase updateSQL --changelog-file=db/changelog.xml --url=<jdbc-url> > pending.sql
migrationpilot analyze pending.sql
```

or in one step:

```
migrationpilot check --from-command "liquibase updateSQL --changelog-file=db/changelog.xml --url=<jdbc-url>"
```

The rendered output includes Liquibase's own `DATABASECHANGELOG` bookkeeping
statements. That's expected.

### goose

Only the `-- +goose Up` half of each file is analyzed. The down half is blanked
out rather than deleted, so violation line numbers still point at the right line
of the real file. `-- +goose NO TRANSACTION` shows up as a note on that migration.
`StatementBegin`/`StatementEnd` markers are comments and stay put.

Go migrations (`.go`) are listed as skipped: their SQL lives in Go code, and there
is no honest way to read it statically.

Directories checked: `migrations/`, `db/migrations/`, `sql/migrations/`,
`db/migration/`, `internal/migrations/`, plus `$GOOSE_MIGRATION_DIR`. A directory
only counts when its files carry `+goose` annotations.

### dbmate

Same shape as goose: only the `-- migrate:up` section is analyzed, line numbers
preserved, and `transaction:false` becomes a note. Several up/down pairs in one
file are handled. `$DBMATE_MIGRATIONS_DIR` is honored, otherwise
`db/migrations/` then `migrations/`.

### Sqitch

Order comes from `sqitch.plan`, since Sqitch filenames carry no version. Pragmas
(`%project`), tags (`@v1.0.0`) and comments are skipped; what's left is the change
list, in order. Deploy scripts are read from `<top_dir>/deploy/<change>.<extension>`,
with `top_dir`, `deploy_dir`, `extension` and `plan_file` read from `sqitch.conf`.

A script in `deploy/` that the plan doesn't list is reported as skipped — Sqitch
would never deploy it. Reworked changes appear twice in the plan; the current
deploy script is analyzed once, with a note.

---

## Tier 2: SQL that has to be generated

### TypeORM, Knex, Sequelize

These migrations are code. Where the SQL is a plain string literal, MigrationPilot
reads it exactly:

```ts
await queryRunner.query('CREATE INDEX "idx_users_email" ON "users" ("email")');
await knex.raw(`ALTER TABLE users ALTER COLUMN email SET NOT NULL`);
```

Both of those are analyzed for real, and violations point at the line in the `.ts`
or `.js` file.

Only the `up` migration is scanned. The down half never runs on the way to
production, and treating its `DROP TABLE` as a pending change would be a false
alarm.

Four things are reported instead of guessed at:

| In the file | What you get |
|---|---|
| `` knex.raw(`ALTER TABLE ${table} ...`) `` | `template literal interpolates a value at runtime` |
| `knex.raw('ALTER TABLE ' + table)` | `SQL is assembled with string concatenation` |
| `knex.raw(sql)` | `SQL comes from a variable or expression, not a literal` |
| `knex.schema.createTable(...)` | `uses the schema-builder API — the SQL is generated at runtime` |

A file with some readable and some unreadable calls is analyzed for what's
readable, with a note naming the lines that weren't. A file with nothing readable
is listed under "Not analyzed" with its reason. Either way, you can see exactly
how much of the migration was covered.

To cover the rest, print the SQL your ORM will run and pipe it in:

```
migrationpilot check --from-command "<command that prints SQL to stdout>"
```

For Knex, `.toSQL()` / `.toString()` on a schema-builder chain gives you that SQL.
For TypeORM, running the migration against a scratch database with
`logging: ["query"]` will log it.

### Django

Django migrations are Python. `manage.py sqlmigrate` prints the SQL for one
migration — it needs a database connection to resolve constraint names, so run it
against a copy of the database you'll apply to.

```
python manage.py sqlmigrate myapp 0002_add_index
migrationpilot check --from-command "python manage.py sqlmigrate myapp 0002_add_index"
```

`python manage.py showmigrations` lists the unapplied migrations worth checking.

### Alembic

Offline mode prints the SQL instead of executing it:

```
alembic upgrade head --sql
```

Offline mode starts from base by default, so that emits the whole history. For
just what's pending, give it a range:

```
migrationpilot check --from-command "alembic upgrade <current_revision>:head --sql"
```

Alembic writes SQL to stdout and logging to stderr, so the pipe stays clean.

### Rails

Rails has no built-in "print the SQL for this migration" command. Two options,
neither perfect, both honest:

**Echo the DDL from a scratch-database run.** Prepend a module that prints instead
of executing:

```
bin/rails runner '
  ActiveRecord::Base.connection.singleton_class.prepend(Module.new do
    def execute(sql, name = nil); puts sql; end
  end)
  require Rails.root.join("db/migrate/20240207120000_add_email_index").to_s
  AddEmailIndex.new.migrate(:up)
'
```

This only catches DDL that goes through `execute`. Anything the adapter runs by
another path won't print.

**db/structure.sql.** With `config.active_record.schema_format = :sql`, Rails keeps
a SQL dump of the schema. `migrationpilot analyze db/structure.sql` works, but it
reports on every table in the dump rather than on the change you're shipping,
which is rarely what you want in CI.

---

## Options

### `--framework <id>`

Skip detection and use one adapter against the directory you pass (your project
root, not the migrations directory):

```
migrationpilot check . --framework flyway
```

Valid ids: `prisma`, `drizzle`, `flyway`, `liquibase`, `goose`, `dbmate`, `sqitch`,
`typeorm`, `sequelize`, `knex`, `django`, `alembic`, `rails`.

If that framework isn't there, the run fails rather than falling back to something
else.

### `--from-command <cmd>`

Run a command and analyze what it prints to stdout:

```
migrationpilot check --from-command "alembic upgrade head --sql"
```

The command runs in your shell, in the current directory (or the directory you
pass). If it exits non-zero, MigrationPilot refuses to analyze the partial output
and shows you stderr — a half-generated migration is not something to report on.
If it prints nothing, you're told that too.

### Explicit directories still work

`migrationpilot check ./migrations` behaves exactly as it always has: glob the
directory, analyze what matches. Detection only kicks in when you pass no
directory, no `--pattern`, and your config file doesn't set `migrationPath`. An
existing CI setup keeps working unchanged.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | clean, or nothing to analyze yet (a Prisma project with no migrations) |
| 1 | warnings with `--fail-on warning`, **or** a framework was detected but nothing could be analyzed |
| 2 | critical violations |

That second case is deliberate. If you run `migrationpilot check` in a Django repo
and it can't read a single statement, exiting 0 would tell CI everything is fine
when nothing was checked. It exits 1 and prints the recipe instead — including
under `--fail-on never`, which suppresses violations, not the inability to look.
