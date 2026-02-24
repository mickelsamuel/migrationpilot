import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'How to Add Database Migration Checks to Your CI/CD Pipeline — MigrationPilot',
  description: 'Set up automated database migration linting in GitHub Actions, GitLab CI, and other CI/CD systems to catch dangerous schema changes before they reach production.',
  keywords: ['database migration ci cd', 'database migration github actions', 'migration linting ci', 'postgresql ci cd', 'database schema checks ci'],
  alternates: {
    canonical: '/blog/database-migration-ci-cd',
  },
  openGraph: {
    title: 'How to Add Database Migration Checks to Your CI/CD Pipeline',
    description: 'Set up automated database migration linting in GitHub Actions, GitLab CI, and other CI/CD systems to catch dangerous schema changes before they reach production.',
    type: 'article',
    url: '/blog/database-migration-ci-cd',
  },
};

export default function DatabaseMigrationCICD() {
  return (
    <main className="min-h-screen">
      <nav className="fixed top-0 w-full z-50 border-b border-slate-800/50 bg-slate-950/80 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-6 py-4">
          <a href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-sm">MP</div>
            <span className="font-semibold text-lg">MigrationPilot</span>
          </a>
          <div className="hidden md:flex items-center gap-6 text-sm text-slate-400">
            <a href="/docs" className="hover:text-white transition-colors">Docs</a>
            <a href="/blog" className="hover:text-white transition-colors">Blog</a>
            <a href="/#pricing" className="hover:text-white transition-colors">Pricing</a>
            <a href="https://github.com/mickelsamuel/migrationpilot" className="hover:text-white transition-colors">GitHub</a>
          </div>
        </div>
      </nav>

      <article className="pt-32 pb-20 px-6">
        <div className="max-w-3xl mx-auto">
          <div className="mb-8">
            <a href="/blog" className="text-sm text-blue-400 hover:text-blue-300 transition-colors">&larr; Back to Blog</a>
          </div>

          <div className="flex items-center gap-3 text-sm text-slate-500 mb-4">
            <time dateTime="2026-02-24">February 24, 2026</time>
            <span className="w-1 h-1 rounded-full bg-slate-700" />
            <span>10 min read</span>
          </div>

          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
            How to Add Database Migration Checks to Your CI/CD Pipeline
          </h1>

          <p className="text-xl text-slate-400 mb-12 leading-relaxed">
            Code review catches logic bugs, linting catches style issues, and type checking catches
            type errors. But what catches dangerous database migrations? Most teams ship migration
            SQL without any automated safety checks. Here is how to fix that.
          </p>

          <div className="prose prose-invert max-w-none">
            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">Why CI Checks for Migrations</h2>

            <p className="text-slate-300 leading-relaxed mb-4">
              Database migrations have a unique risk profile compared to application code:
            </p>

            <ul className="list-disc list-inside text-slate-300 space-y-2 mb-6 ml-4">
              <li><strong className="text-slate-200">Irreversible by default.</strong> A deployed app rollback takes seconds. A schema change rollback can take hours or be impossible (data loss from DROP COLUMN).</li>
              <li><strong className="text-slate-200">Production-specific risk.</strong> A migration that runs in 100ms on dev can take 10 minutes on production with 50M rows.</li>
              <li><strong className="text-slate-200">Cascading failures.</strong> A single bad lock can queue all queries, exhaust connection pools, and take down the entire application.</li>
              <li><strong className="text-slate-200">Low review expertise.</strong> Most engineers review SQL migrations less carefully than application code because the risks are not obvious.</li>
            </ul>

            <p className="text-slate-300 leading-relaxed mb-6">
              Automated CI checks solve these problems by catching known-dangerous patterns before
              the migration is merged. The check runs in seconds, requires no database connection,
              and provides actionable feedback directly in the pull request.
            </p>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">What to Check</h2>

            <p className="text-slate-300 leading-relaxed mb-4">
              An effective migration linter should catch these categories of issues:
            </p>

            <h3 className="text-xl font-semibold mt-8 mb-3 text-slate-200">Lock safety</h3>
            <ul className="list-disc list-inside text-slate-300 space-y-2 mb-6 ml-4">
              <li>CREATE INDEX without CONCURRENTLY (blocks writes)</li>
              <li>Missing lock_timeout before DDL (can queue all traffic)</li>
              <li>ADD COLUMN with volatile DEFAULT (full table rewrite)</li>
              <li>SET NOT NULL without CHECK pattern (ACCESS EXCLUSIVE scan)</li>
              <li>UNIQUE constraint without USING INDEX (builds index under ACCESS EXCLUSIVE)</li>
              <li>Foreign key without NOT VALID (scans both tables under lock)</li>
            </ul>

            <h3 className="text-xl font-semibold mt-8 mb-3 text-slate-200">Data safety</h3>
            <ul className="list-disc list-inside text-slate-300 space-y-2 mb-6 ml-4">
              <li>DROP TABLE, DROP COLUMN (irreversible data loss)</li>
              <li>TRUNCATE CASCADE (cascading data deletion)</li>
              <li>Data type narrowing (silent data truncation)</li>
              <li>DROP NOT NULL on columns that should never be null</li>
            </ul>

            <h3 className="text-xl font-semibold mt-8 mb-3 text-slate-200">Best practices</h3>
            <ul className="list-disc list-inside text-slate-300 space-y-2 mb-6 ml-4">
              <li>Prefer TEXT over VARCHAR (no performance difference in PostgreSQL)</li>
              <li>Prefer BIGINT over INT for primary keys (avoid future overflow)</li>
              <li>Prefer TIMESTAMPTZ over TIMESTAMP (timezone-aware)</li>
              <li>Prefer IDENTITY over SERIAL (SQL standard, better semantics)</li>
              <li>Always name indexes explicitly (for reliable migrations later)</li>
            </ul>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">GitHub Actions Setup</h2>

            <p className="text-slate-300 leading-relaxed mb-4">
              The simplest way to add migration checks to a GitHub repository. Create a workflow file:
            </p>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-6">
              <code className="text-sm text-slate-300 font-mono">{`# .github/workflows/migration-check.yml
name: Migration Safety Check

on:
  pull_request:
    paths:
      - 'migrations/**'
      - 'db/migrate/**'
      - 'prisma/migrations/**'

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: mickelsamuel/migrationpilot@v1
        with:
          migration-path: "migrations/*.sql"
          fail-on: critical`}</code>
            </pre>

            <p className="text-slate-300 leading-relaxed mb-6">
              This workflow runs whenever a PR modifies files in the migrations directory. It analyzes
              every SQL file, posts a safety report as a PR comment, and fails the check if any critical
              violations are found.
            </p>

            <h3 className="text-xl font-semibold mt-8 mb-3 text-slate-200">Customizing the check</h3>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-6">
              <code className="text-sm text-slate-300 font-mono">{`# More detailed configuration
- uses: mickelsamuel/migrationpilot@v1
  with:
    # Path to migration files (glob pattern)
    migration-path: "migrations/*.sql"

    # Fail the check on "critical" or "warning" violations
    fail-on: critical

    # Exclude specific rules (comma-separated)
    # e.g., if you intentionally want DROP TABLE in a cleanup migration
    exclude: "MP026,MP017"

    # PostgreSQL version for version-specific advice
    pg-version: "16"

    # Output SARIF for GitHub Code Scanning integration
    sarif-file: "results.sarif"`}</code>
            </pre>

            <h3 className="text-xl font-semibold mt-8 mb-3 text-slate-200">SARIF integration with GitHub Code Scanning</h3>

            <p className="text-slate-300 leading-relaxed mb-4">
              For richer integration, MigrationPilot can output SARIF (Static Analysis Results Interchange Format),
              which GitHub Code Scanning understands natively. Violations appear as inline annotations directly
              in the PR diff:
            </p>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-6">
              <code className="text-sm text-slate-300 font-mono">{`# .github/workflows/migration-check.yml
name: Migration Safety Check

on:
  pull_request:
    paths: ['migrations/**']

jobs:
  check:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      security-events: write  # Required for SARIF upload

    steps:
      - uses: actions/checkout@v4

      - uses: mickelsamuel/migrationpilot@v1
        with:
          migration-path: "migrations/*.sql"
          fail-on: critical
          sarif-file: "migrationpilot.sarif"

      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: "migrationpilot.sarif"`}</code>
            </pre>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">GitLab CI Setup</h2>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-6">
              <code className="text-sm text-slate-300 font-mono">{`# .gitlab-ci.yml
migration-check:
  image: node:22-slim
  stage: test
  rules:
    - changes:
        - migrations/*.sql
  script:
    - npx migrationpilot check migrations/*.sql --fail-on critical
  allow_failure: false`}</code>
            </pre>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">Bitbucket Pipelines Setup</h2>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-6">
              <code className="text-sm text-slate-300 font-mono">{`# bitbucket-pipelines.yml
pipelines:
  pull-requests:
    '**':
      - step:
          name: Migration Safety Check
          image: node:22-slim
          script:
            - npx migrationpilot check migrations/*.sql --fail-on critical
          condition:
            changesets:
              includePaths:
                - "migrations/**"`}</code>
            </pre>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">Generic CI (Any System)</h2>

            <p className="text-slate-300 leading-relaxed mb-4">
              MigrationPilot works as a plain CLI tool, so it runs anywhere Node.js is available:
            </p>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-6">
              <code className="text-sm text-slate-300 font-mono">{`# Install and run
npm install -g migrationpilot

# Check migrations — exits with code 2 on critical violations
migrationpilot check migrations/*.sql --fail-on critical

# Or use npx (no install needed)
npx migrationpilot check migrations/*.sql --fail-on critical

# Output formats for different CI systems
migrationpilot check migrations/*.sql --format json      # Machine-readable
migrationpilot check migrations/*.sql --format sarif      # Code scanning
migrationpilot check migrations/*.sql --format markdown   # Wiki/docs
migrationpilot check migrations/*.sql --quiet             # gcc-style one-liner`}</code>
            </pre>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">Framework-Specific Migration Paths</h2>

            <p className="text-slate-300 leading-relaxed mb-4">
              Different migration frameworks store SQL files in different locations. Here are the
              common paths:
            </p>

            <div className="overflow-x-auto mb-8">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left py-3 px-4 text-slate-300 font-semibold">Framework</th>
                    <th className="text-left py-3 px-4 text-slate-300 font-semibold">Migration Path</th>
                  </tr>
                </thead>
                <tbody className="text-slate-400">
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4">Flyway</td>
                    <td className="py-3 px-4 font-mono text-sm">src/main/resources/db/migration/*.sql</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4">Liquibase</td>
                    <td className="py-3 px-4 font-mono text-sm">src/main/resources/db/changelog/*.sql</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4">Rails</td>
                    <td className="py-3 px-4 font-mono text-sm">db/migrate/*.rb (use schema.sql)</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4">Django</td>
                    <td className="py-3 px-4 font-mono text-sm">*/migrations/*.py (use sqlmigrate)</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4">Alembic</td>
                    <td className="py-3 px-4 font-mono text-sm">alembic/versions/*.py</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4">Prisma</td>
                    <td className="py-3 px-4 font-mono text-sm">prisma/migrations/*/migration.sql</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4">Knex</td>
                    <td className="py-3 px-4 font-mono text-sm">migrations/*.js (pipe through knex)</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4">goose</td>
                    <td className="py-3 px-4 font-mono text-sm">migrations/*.sql</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4">dbmate</td>
                    <td className="py-3 px-4 font-mono text-sm">db/migrations/*.sql</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4">Sqitch</td>
                    <td className="py-3 px-4 font-mono text-sm">deploy/*.sql</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <h3 className="text-xl font-semibold mt-8 mb-3 text-slate-200">ORM frameworks (Django, Rails, Alembic)</h3>

            <p className="text-slate-300 leading-relaxed mb-4">
              For frameworks that generate SQL from ORM code (Django, Rails, Alembic), you can pipe
              the generated SQL through stdin:
            </p>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-6">
              <code className="text-sm text-slate-300 font-mono">{`# Django: Generate SQL from migration, then analyze
python manage.py sqlmigrate myapp 0042 | npx migrationpilot analyze --stdin

# Alembic: Generate SQL from revision
alembic upgrade head --sql | npx migrationpilot analyze --stdin

# Rails: Use schema.sql format
# Set config.active_record.schema_format = :sql in application.rb
# Then analyze the generated SQL file
npx migrationpilot analyze db/structure.sql`}</code>
            </pre>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">Pre-Commit Hook (Local Check)</h2>

            <p className="text-slate-300 leading-relaxed mb-4">
              For even earlier feedback, add a pre-commit hook that runs before code leaves the developer&apos;s machine:
            </p>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-6">
              <code className="text-sm text-slate-300 font-mono">{`# Install the pre-commit hook
npx migrationpilot hook install

# Or add to your existing husky setup
# .husky/pre-commit
npx migrationpilot check migrations/*.sql --fail-on critical --quiet`}</code>
            </pre>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">Configuration File</h2>

            <p className="text-slate-300 leading-relaxed mb-4">
              For project-wide settings, create a configuration file in your repository root:
            </p>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-6">
              <code className="text-sm text-slate-300 font-mono">{`# .migrationpilotrc.yml
# Use a built-in preset as a starting point
extends: ci

# PostgreSQL version (affects version-specific advice)
pgVersion: 16

# Override severity for specific rules
rules:
  MP026:
    severity: warning  # Allow DROP TABLE with a warning
  MP037:
    severity: off      # Don't enforce TEXT over VARCHAR

# Exclude rules globally
exclude:
  - MP015  # Allow SERIAL (team preference)`}</code>
            </pre>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">What the PR Comment Looks Like</h2>

            <p className="text-slate-300 leading-relaxed mb-4">
              When running as a GitHub Action, MigrationPilot posts a detailed safety report as a
              PR comment. The comment includes:
            </p>

            <ul className="list-disc list-inside text-slate-300 space-y-2 mb-6 ml-4">
              <li>Overall risk score (RED / YELLOW / GREEN)</li>
              <li>Per-statement lock analysis (which lock each DDL acquires)</li>
              <li>Violation details with explanations of why each pattern is dangerous</li>
              <li>Safe alternative SQL you can copy-paste</li>
              <li>Auto-update on each push (no comment spam)</li>
            </ul>

            <p className="text-slate-300 leading-relaxed mb-6">
              The comment is automatically updated on each push to the PR branch, so there is no
              comment spam. If all violations are resolved, the comment shows a green checkmark.
            </p>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">Gradual Adoption Strategy</h2>

            <p className="text-slate-300 leading-relaxed mb-4">
              You do not need to fix every existing migration to start using CI checks. A practical
              adoption strategy:
            </p>

            <ol className="list-decimal list-inside text-slate-300 space-y-4 mb-6 ml-4">
              <li>
                <strong className="text-slate-200">Week 1: Warning mode.</strong> Add the check with{' '}
                <code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">allow_failure: true</code> (GitLab) or no{' '}
                <code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">fail-on</code> (GitHub Action).
                Team sees reports but is not blocked.
              </li>
              <li>
                <strong className="text-slate-200">Week 2: Block critical only.</strong> Set{' '}
                <code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">fail-on: critical</code> to block
                the most dangerous patterns (missing CONCURRENTLY, table rewrites).
              </li>
              <li>
                <strong className="text-slate-200">Month 2: Block warnings.</strong> Once the team is comfortable,
                switch to <code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">fail-on: warning</code> to
                enforce best practices too.
              </li>
              <li>
                <strong className="text-slate-200">Ongoing: Customize rules.</strong> Tune severity overrides and
                exclusions based on your team&apos;s conventions.
              </li>
            </ol>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">Get Started</h2>

            <p className="text-slate-300 leading-relaxed mb-6">
              Adding migration safety checks to CI takes less than a minute.{' '}
              <a href="https://github.com/mickelsamuel/migrationpilot" className="text-blue-400 hover:text-blue-300">MigrationPilot</a>{' '}
              is open-source (MIT), runs 80 safety rules in under a second, and requires no database
              connection. It works as a CLI, GitHub Action, GitLab CI step, or Node.js library.
            </p>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-8">
              <code className="text-sm text-slate-300 font-mono">{`# Try it now on your existing migrations
npx migrationpilot analyze migrations/*.sql`}</code>
            </pre>
          </div>
        </div>
      </article>

      <footer className="border-t border-slate-800/50 py-12 px-6">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-blue-600 flex items-center justify-center font-bold text-xs">MP</div>
            <span className="text-sm text-slate-400">MigrationPilot</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-slate-500">
            <a href="/" className="hover:text-slate-300 transition-colors">Home</a>
            <a href="/blog" className="hover:text-slate-300 transition-colors">Blog</a>
            <a href="/docs" className="hover:text-slate-300 transition-colors">Docs</a>
            <a href="https://github.com/mickelsamuel/migrationpilot" className="hover:text-slate-300 transition-colors">GitHub</a>
          </div>
          <p className="text-xs text-slate-600">&copy; 2026 MigrationPilot</p>
        </div>
      </footer>
    </main>
  );
}
