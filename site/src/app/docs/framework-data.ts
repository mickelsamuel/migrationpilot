export interface FrameworkGuide {
  slug: string;
  name: string;
  language: string;
  description: string;
  detectHint: string;
  migrationPath: string;
  setup: string;
  ciExample: string;
}

export const frameworks: FrameworkGuide[] = [
  {
    slug: 'prisma',
    name: 'Prisma',
    language: 'TypeScript / JavaScript',
    description: 'Prisma uses declarative schema files and generates SQL migrations via prisma migrate.',
    detectHint: 'MigrationPilot auto-detects Prisma via the prisma/ directory.',
    migrationPath: 'prisma/migrations/**/*.sql',
    setup: `# Generate a migration (creates SQL file)
npx prisma migrate dev --name add_users

# Analyze the generated migration
npx migrationpilot analyze prisma/migrations/*/migration.sql

# Check all migrations
npx migrationpilot check prisma/migrations --pattern "*/migration.sql"`,
    ciExample: `- uses: mickelsamuel/migrationpilot@v1
  with:
    path: prisma/migrations/
    pattern: "*/migration.sql"`,
  },
  {
    slug: 'django',
    name: 'Django',
    language: 'Python',
    description: 'Django generates Python migration files that execute SQL. Use sqlmigrate to extract the SQL.',
    detectHint: 'MigrationPilot auto-detects Django via manage.py and migrations/ directories.',
    migrationPath: '**/migrations/*.sql',
    setup: `# Generate SQL from a Django migration
python manage.py sqlmigrate myapp 0001 > migration.sql

# Analyze the generated SQL
npx migrationpilot analyze migration.sql

# Or pipe directly
python manage.py sqlmigrate myapp 0001 | npx migrationpilot analyze --stdin`,
    ciExample: `- name: Check Django migrations
  run: |
    python manage.py sqlmigrate myapp 0001 > /tmp/migration.sql
    npx migrationpilot analyze /tmp/migration.sql --fail-on critical`,
  },
  {
    slug: 'knex',
    name: 'Knex.js',
    language: 'JavaScript',
    description: 'Knex.js uses JavaScript migration files. Write raw SQL migrations for best results.',
    detectHint: 'MigrationPilot auto-detects Knex via knexfile.js or the migrations/ directory.',
    migrationPath: 'migrations/**/*.sql',
    setup: `# If using raw SQL migrations
npx migrationpilot check ./migrations

# For JS migrations, extract the SQL manually or use --stdin
# Knex doesn't have a built-in SQL preview command`,
    ciExample: `- uses: mickelsamuel/migrationpilot@v1
  with:
    path: migrations/
    pattern: "*.sql"`,
  },
  {
    slug: 'typeorm',
    name: 'TypeORM',
    language: 'TypeScript / JavaScript',
    description: 'TypeORM generates migration files with up/down methods. Use query logging to extract SQL.',
    detectHint: 'MigrationPilot auto-detects TypeORM via ormconfig or typeorm in package.json.',
    migrationPath: 'src/migrations/**/*.sql',
    setup: `# Generate a migration
npx typeorm migration:generate -n AddUsers

# TypeORM generates TypeScript files, not raw SQL.
# For best results, use typeorm migration:run --dry-run to preview SQL,
# then analyze the output:
npx typeorm migration:run --dry-run 2>&1 | npx migrationpilot analyze --stdin`,
    ciExample: `- name: Check TypeORM migrations
  run: npx typeorm migration:run --dry-run 2>&1 | npx migrationpilot analyze --stdin --fail-on critical`,
  },
  {
    slug: 'drizzle',
    name: 'Drizzle ORM',
    language: 'TypeScript',
    description: 'Drizzle generates SQL migration files via drizzle-kit.',
    detectHint: 'MigrationPilot auto-detects Drizzle via drizzle.config.ts or the drizzle/ directory.',
    migrationPath: 'drizzle/**/*.sql',
    setup: `# Generate migrations
npx drizzle-kit generate

# Analyze generated SQL files
npx migrationpilot check ./drizzle --pattern "*.sql"`,
    ciExample: `- uses: mickelsamuel/migrationpilot@v1
  with:
    path: drizzle/
    pattern: "*.sql"`,
  },
  {
    slug: 'sequelize',
    name: 'Sequelize',
    language: 'JavaScript',
    description: 'Sequelize uses JavaScript migration files with queryInterface methods.',
    detectHint: 'MigrationPilot auto-detects Sequelize via .sequelizerc or the migrations/ directory.',
    migrationPath: 'migrations/**/*.sql',
    setup: `# Sequelize migrations are JavaScript files.
# For raw SQL migrations, point MigrationPilot at your SQL files.
# For JS migrations, extract SQL manually or use raw queries.

npx migrationpilot check ./migrations --pattern "*.sql"`,
    ciExample: `- uses: mickelsamuel/migrationpilot@v1
  with:
    path: migrations/
    pattern: "*.sql"`,
  },
  {
    slug: 'rails',
    name: 'Ruby on Rails',
    language: 'Ruby',
    description: 'Rails Active Record migrations are Ruby files. Extract SQL with schema statements.',
    detectHint: 'MigrationPilot auto-detects Rails via Gemfile with activerecord or the db/migrate/ directory.',
    migrationPath: 'db/migrate/**/*.sql',
    setup: `# Generate raw SQL from a Rails migration
bundle exec rails db:migrate:status

# For raw SQL analysis, use structure.sql format:
# In config/application.rb:
#   config.active_record.schema_format = :sql

# Then analyze the generated SQL:
npx migrationpilot analyze db/structure.sql`,
    ciExample: `- name: Check Rails migrations
  run: |
    bundle exec rails db:migrate:status
    npx migrationpilot analyze db/structure.sql --fail-on critical`,
  },
  {
    slug: 'ecto',
    name: 'Ecto (Elixir)',
    language: 'Elixir',
    description: 'Ecto migrations are Elixir modules. Use raw SQL execute statements for best results.',
    detectHint: 'MigrationPilot auto-detects Ecto via mix.exs with ecto or the priv/repo/migrations/ directory.',
    migrationPath: 'priv/repo/migrations/**/*.sql',
    setup: `# Ecto migrations are Elixir files.
# For SQL analysis, use execute() with raw SQL in your migrations:
#
#   execute "CREATE INDEX CONCURRENTLY ..."
#
# Extract SQL from migration files or use ecto.migrate --log-sql`,
    ciExample: `- name: Check Ecto migrations
  run: |
    mix ecto.migrate --log-sql 2>&1 | npx migrationpilot analyze --stdin --fail-on critical`,
  },
  {
    slug: 'flyway',
    name: 'Flyway',
    language: 'SQL',
    description: 'Flyway uses versioned SQL migration files (V1__description.sql). Perfect fit for MigrationPilot.',
    detectHint: 'MigrationPilot auto-detects Flyway via flyway.conf or the sql/ directory with V*.sql files.',
    migrationPath: 'sql/**/*.sql',
    setup: `# Flyway migrations are raw SQL — ideal for MigrationPilot
npx migrationpilot check ./sql --pattern "V*.sql"

# Or analyze a single migration
npx migrationpilot analyze sql/V2__add_users.sql`,
    ciExample: `- uses: mickelsamuel/migrationpilot@v1
  with:
    path: sql/
    pattern: "V*.sql"`,
  },
  {
    slug: 'liquibase',
    name: 'Liquibase',
    language: 'SQL / XML / YAML',
    description: 'Liquibase supports multiple changelog formats. Use SQL changelogs for best results.',
    detectHint: 'MigrationPilot auto-detects Liquibase via liquibase.properties or changelog files.',
    migrationPath: 'changelogs/**/*.sql',
    setup: `# For SQL changelogs, analyze directly
npx migrationpilot check ./changelogs --pattern "*.sql"

# For XML/YAML changelogs, generate SQL preview first:
liquibase update-sql > /tmp/migration.sql
npx migrationpilot analyze /tmp/migration.sql`,
    ciExample: `- name: Check Liquibase migrations
  run: |
    liquibase update-sql > /tmp/migration.sql
    npx migrationpilot analyze /tmp/migration.sql --fail-on critical`,
  },
  {
    slug: 'alembic',
    name: 'Alembic',
    language: 'Python',
    description: 'Alembic migrations are Python files. Use alembic upgrade --sql to extract SQL.',
    detectHint: 'MigrationPilot auto-detects Alembic via alembic.ini or the alembic/ directory.',
    migrationPath: 'alembic/versions/**/*.sql',
    setup: `# Generate SQL from an Alembic revision
alembic upgrade head --sql > /tmp/migration.sql

# Analyze the generated SQL
npx migrationpilot analyze /tmp/migration.sql

# Or pipe directly
alembic upgrade head --sql | npx migrationpilot analyze --stdin`,
    ciExample: `- name: Check Alembic migrations
  run: |
    alembic upgrade head --sql | npx migrationpilot analyze --stdin --fail-on critical`,
  },
  {
    slug: 'goose',
    name: 'goose',
    language: 'Go / SQL',
    description: 'goose uses SQL or Go migration files. SQL migrations work directly with MigrationPilot.',
    detectHint: 'MigrationPilot auto-detects goose via the migrations/ directory with SQL files containing -- +goose markers.',
    migrationPath: 'migrations/**/*.sql',
    setup: `# goose SQL migrations work directly with MigrationPilot
npx migrationpilot check ./migrations

# Analyze a single migration
npx migrationpilot analyze migrations/001_add_users.sql`,
    ciExample: `- uses: mickelsamuel/migrationpilot@v1
  with:
    path: migrations/
    pattern: "*.sql"`,
  },
  {
    slug: 'dbmate',
    name: 'dbmate',
    language: 'SQL',
    description: 'dbmate uses plain SQL migration files. Perfect fit for MigrationPilot.',
    detectHint: 'MigrationPilot auto-detects dbmate via database.yml or the db/migrations/ directory.',
    migrationPath: 'db/migrations/**/*.sql',
    setup: `# dbmate migrations are raw SQL — ideal for MigrationPilot
npx migrationpilot check ./db/migrations

# Analyze a single migration
npx migrationpilot analyze db/migrations/001_add_users.sql`,
    ciExample: `- uses: mickelsamuel/migrationpilot@v1
  with:
    path: db/migrations/
    pattern: "*.sql"`,
  },
  {
    slug: 'sqitch',
    name: 'Sqitch',
    language: 'SQL',
    description: 'Sqitch uses change-based SQL migration scripts organized in deploy/revert/verify directories.',
    detectHint: 'MigrationPilot auto-detects Sqitch via sqitch.conf or the deploy/ directory.',
    migrationPath: 'deploy/**/*.sql',
    setup: `# Analyze deploy scripts (the forward migrations)
npx migrationpilot check ./deploy

# Analyze a single change
npx migrationpilot analyze deploy/add_users.sql`,
    ciExample: `- uses: mickelsamuel/migrationpilot@v1
  with:
    path: deploy/
    pattern: "*.sql"`,
  },
];
