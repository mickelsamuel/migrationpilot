import type { Metadata } from 'next';
import Navbar from '@/components/navbar';
import { Footer } from '@/components/footer';
import { CodeBlock } from '@/components/code-block';

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
    <>
      <Navbar active="blog" />
      <main className="pt-14">
        <article className="mp-container pt-16 md:pt-20 pb-20">
          <div className="max-w-3xl">
            <div className="mb-8">
              <a href="/blog" className="text-sm text-accent hover:text-accent-hover transition-colors">&larr; Back to Blog</a>
            </div>

            <div className="flex items-center gap-3 text-sm text-faint mb-4">
              <time dateTime="2026-02-24">February 24, 2026</time>
              <span className="w-1 h-1 rounded-full bg-line" />
              <span>4 min read</span>
            </div>

            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
              How to Add Database Migration Checks to Your CI/CD Pipeline
            </h1>

            <p className="text-xl text-muted mb-12 leading-relaxed">
              Code review catches logic bugs, linting catches style issues, and type checking catches
              type errors. But what catches dangerous database migrations? Most teams ship migration
              SQL without any automated safety checks. Here is how to fix that.
            </p>

            <img
              src="/charts/cicd-flow.png"
              alt="Migration CI/CD flow: write migration, push PR, GitHub Action analyzes SQL, classifies locks, checks 112 rules, scores risk, posts PR comment"
              className="rounded-lg border border-line mb-12 w-full"
              width={800}
              height={450}
            />

            <div className="prose prose-invert max-w-none">
              <h2 className="text-2xl font-bold mt-12 mb-4 text-fg">Why CI Checks for Migrations</h2>

              <p className="text-muted leading-relaxed mb-4">
                Database migrations have a unique risk profile compared to application code:
              </p>

              <ul className="list-disc list-inside text-muted space-y-2 mb-6 ml-4">
                <li><strong className="text-fg">Irreversible by default.</strong> A deployed app rollback takes seconds. A schema change rollback can take hours or be impossible (data loss from DROP COLUMN).</li>
                <li><strong className="text-fg">Production-specific risk.</strong> A migration that runs in 100ms on dev can take 10 minutes on production with 50M rows.</li>
                <li><strong className="text-fg">Cascading failures.</strong> A single bad lock can queue all queries, exhaust connection pools, and take down the entire application.</li>
                <li><strong className="text-fg">Low review expertise.</strong> Most engineers review SQL migrations less carefully than application code because the risks are not obvious.</li>
              </ul>

              <p className="text-muted leading-relaxed mb-6">
                Automated CI checks solve these problems by catching known-dangerous patterns before
                the migration is merged. The check runs in seconds, requires no database connection,
                and provides actionable feedback directly in the pull request.
              </p>

              <h2 className="text-2xl font-bold mt-12 mb-4 text-fg">What to Check</h2>

              <p className="text-muted leading-relaxed mb-4">
                An effective migration linter should catch these categories of issues:
              </p>

              <h3 className="text-xl font-semibold mt-8 mb-3 text-fg">Lock safety</h3>
              <ul className="list-disc list-inside text-muted space-y-2 mb-6 ml-4">
                <li>CREATE INDEX without CONCURRENTLY (blocks writes)</li>
                <li>Missing lock_timeout before DDL (can queue all traffic)</li>
                <li>ADD COLUMN with volatile DEFAULT (full table rewrite)</li>
                <li>SET NOT NULL without CHECK pattern (ACCESS EXCLUSIVE scan)</li>
                <li>UNIQUE constraint without USING INDEX (builds index under ACCESS EXCLUSIVE)</li>
                <li>Foreign key without NOT VALID (scans both tables under lock)</li>
              </ul>

              <h3 className="text-xl font-semibold mt-8 mb-3 text-fg">Data safety</h3>
              <ul className="list-disc list-inside text-muted space-y-2 mb-6 ml-4">
                <li>DROP TABLE, DROP COLUMN (irreversible data loss)</li>
                <li>TRUNCATE CASCADE (cascading data deletion)</li>
                <li>Data type narrowing (silent data truncation)</li>
                <li>DROP NOT NULL on columns that should never be null</li>
              </ul>

              <h3 className="text-xl font-semibold mt-8 mb-3 text-fg">Best practices</h3>
              <ul className="list-disc list-inside text-muted space-y-2 mb-6 ml-4">
                <li>Prefer TEXT over VARCHAR (no performance difference in PostgreSQL)</li>
                <li>Prefer BIGINT over INT for primary keys (avoid future overflow)</li>
                <li>Prefer TIMESTAMPTZ over TIMESTAMP (timezone-aware)</li>
                <li>Prefer IDENTITY over SERIAL (SQL standard, better semantics)</li>
                <li>Always name indexes explicitly (for reliable migrations later)</li>
              </ul>

              <h2 className="text-2xl font-bold mt-12 mb-4 text-fg">GitHub Actions Setup</h2>

              <p className="text-muted leading-relaxed mb-4">
                The simplest way to add migration checks to a GitHub repository. Create a workflow file:
              </p>

              <CodeBlock code={`# .github/workflows/migration-check.yml
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
          fail-on: critical`} />

              <p className="text-muted leading-relaxed mb-6">
                This workflow runs whenever a PR modifies files in the migrations directory. It analyzes
                every SQL file, posts a safety report as a PR comment, and fails the check if any critical
                violations are found.
              </p>

              <h3 className="text-xl font-semibold mt-8 mb-3 text-fg">Customizing the check</h3>

              <CodeBlock code={`# More detailed configuration
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
    sarif-file: "results.sarif"`} />

              <h3 className="text-xl font-semibold mt-8 mb-3 text-fg">SARIF integration with GitHub Code Scanning</h3>

              <p className="text-muted leading-relaxed mb-4">
                For richer integration, MigrationPilot can output SARIF (Static Analysis Results Interchange Format),
                which GitHub Code Scanning understands natively. Violations appear as inline annotations directly
                in the PR diff:
              </p>

              <CodeBlock code={`# .github/workflows/migration-check.yml
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
          sarif_file: "migrationpilot.sarif"`} />

              <h2 className="text-2xl font-bold mt-12 mb-4 text-fg">GitLab CI Setup</h2>

              <CodeBlock code={`# .gitlab-ci.yml
migration-check:
  image: node:22-slim
  stage: test
  rules:
    - changes:
        - migrations/*.sql
  script:
    - npx migrationpilot check migrations/*.sql --fail-on critical
  allow_failure: false`} />

              <h2 className="text-2xl font-bold mt-12 mb-4 text-fg">Bitbucket Pipelines Setup</h2>

              <CodeBlock code={`# bitbucket-pipelines.yml
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
                - "migrations/**"`} />

              <h2 className="text-2xl font-bold mt-12 mb-4 text-fg">Generic CI (Any System)</h2>

              <p className="text-muted leading-relaxed mb-4">
                MigrationPilot works as a plain CLI tool, so it runs anywhere Node.js is available:
              </p>

              <CodeBlock code={`# Install and run
npm install -g migrationpilot

# Check migrations — exits with code 2 on critical violations
migrationpilot check migrations/*.sql --fail-on critical

# Or use npx (no install needed)
npx migrationpilot check migrations/*.sql --fail-on critical

# Output formats for different CI systems
migrationpilot check migrations/*.sql --format json      # Machine-readable
migrationpilot check migrations/*.sql --format sarif      # Code scanning
migrationpilot check migrations/*.sql --format markdown   # Wiki/docs
migrationpilot check migrations/*.sql --quiet             # gcc-style one-liner`} />

              <h2 className="text-2xl font-bold mt-12 mb-4 text-fg">Framework-Specific Migration Paths</h2>

              <p className="text-muted leading-relaxed mb-4">
                Different migration frameworks store SQL files in different locations. Here are the
                common paths:
              </p>

              <div className="overflow-x-auto mb-8">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-line">
                      <th className="text-left py-3 px-4 text-muted font-semibold">Framework</th>
                      <th className="text-left py-3 px-4 text-muted font-semibold">Migration Path</th>
                    </tr>
                  </thead>
                  <tbody className="text-muted">
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4">Flyway</td>
                      <td className="py-3 px-4 font-mono text-sm">src/main/resources/db/migration/*.sql</td>
                    </tr>
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4">Liquibase</td>
                      <td className="py-3 px-4 font-mono text-sm">src/main/resources/db/changelog/*.sql</td>
                    </tr>
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4">Rails</td>
                      <td className="py-3 px-4 font-mono text-sm">db/migrate/*.rb (use schema.sql)</td>
                    </tr>
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4">Django</td>
                      <td className="py-3 px-4 font-mono text-sm">*/migrations/*.py (use sqlmigrate)</td>
                    </tr>
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4">Alembic</td>
                      <td className="py-3 px-4 font-mono text-sm">alembic/versions/*.py</td>
                    </tr>
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4">Prisma</td>
                      <td className="py-3 px-4 font-mono text-sm">prisma/migrations/*/migration.sql</td>
                    </tr>
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4">Knex</td>
                      <td className="py-3 px-4 font-mono text-sm">migrations/*.js (pipe through knex)</td>
                    </tr>
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4">goose</td>
                      <td className="py-3 px-4 font-mono text-sm">migrations/*.sql</td>
                    </tr>
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4">dbmate</td>
                      <td className="py-3 px-4 font-mono text-sm">db/migrations/*.sql</td>
                    </tr>
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4">Sqitch</td>
                      <td className="py-3 px-4 font-mono text-sm">deploy/*.sql</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <h3 className="text-xl font-semibold mt-8 mb-3 text-fg">ORM frameworks (Django, Rails, Alembic)</h3>

              <p className="text-muted leading-relaxed mb-4">
                For frameworks that generate SQL from ORM code (Django, Rails, Alembic), you can pipe
                the generated SQL through stdin:
              </p>

              <CodeBlock code={`# Django: Generate SQL from migration, then analyze
python manage.py sqlmigrate myapp 0042 | npx migrationpilot analyze --stdin

# Alembic: Generate SQL from revision
alembic upgrade head --sql | npx migrationpilot analyze --stdin

# Rails: Use schema.sql format
# Set config.active_record.schema_format = :sql in application.rb
# Then analyze the generated SQL file
npx migrationpilot analyze db/structure.sql`} />

              <h2 className="text-2xl font-bold mt-12 mb-4 text-fg">Pre-Commit Hook (Local Check)</h2>

              <p className="text-muted leading-relaxed mb-4">
                For even earlier feedback, add a pre-commit hook that runs before code leaves the developer&apos;s machine:
              </p>

              <CodeBlock code={`# Install the pre-commit hook
npx migrationpilot hook install

# Or add to your existing husky setup
# .husky/pre-commit
npx migrationpilot check migrations/*.sql --fail-on critical --quiet`} />

              <h2 className="text-2xl font-bold mt-12 mb-4 text-fg">Configuration File</h2>

              <p className="text-muted leading-relaxed mb-4">
                For project-wide settings, create a configuration file in your repository root:
              </p>

              <CodeBlock code={`# .migrationpilotrc.yml
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
  - MP015  # Allow SERIAL (team preference)`} />

              <h2 className="text-2xl font-bold mt-12 mb-4 text-fg">What the PR Comment Looks Like</h2>

              <p className="text-muted leading-relaxed mb-4">
                When running as a GitHub Action, MigrationPilot posts a detailed safety report as a
                PR comment. The comment includes:
              </p>

              <ul className="list-disc list-inside text-muted space-y-2 mb-6 ml-4">
                <li>Overall risk score (RED / YELLOW / GREEN)</li>
                <li>Per-statement lock analysis (which lock each DDL acquires)</li>
                <li>Violation details with explanations of why each pattern is dangerous</li>
                <li>Safe alternative SQL you can copy-paste</li>
                <li>Auto-update on each push (no comment spam)</li>
              </ul>

              <p className="text-muted leading-relaxed mb-6">
                The comment is automatically updated on each push to the PR branch, so there is no
                comment spam. If all violations are resolved, the comment shows a green checkmark.
              </p>

              <h2 className="text-2xl font-bold mt-12 mb-4 text-fg">Gradual Adoption Strategy</h2>

              <p className="text-muted leading-relaxed mb-4">
                You do not need to fix every existing migration to start using CI checks. A practical
                adoption strategy:
              </p>

              <ol className="list-decimal list-inside text-muted space-y-4 mb-6 ml-4">
                <li>
                  <strong className="text-fg">Week 1: Warning mode.</strong> Add the check with{' '}
                  <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">allow_failure: true</code> (GitLab) or no{' '}
                  <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">fail-on</code> (GitHub Action).
                  Team sees reports but is not blocked.
                </li>
                <li>
                  <strong className="text-fg">Week 2: Block critical only.</strong> Set{' '}
                  <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">fail-on: critical</code> to block
                  the most dangerous patterns (missing CONCURRENTLY, table rewrites).
                </li>
                <li>
                  <strong className="text-fg">Month 2: Block warnings.</strong> Once the team is comfortable,
                  switch to <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">fail-on: warning</code> to
                  enforce best practices too.
                </li>
                <li>
                  <strong className="text-fg">Ongoing: Customize rules.</strong> Tune severity overrides and
                  exclusions based on your team&apos;s conventions.
                </li>
              </ol>

              <h2 className="text-2xl font-bold mt-12 mb-4 text-fg">Get Started</h2>

              <p className="text-muted leading-relaxed mb-6">
                Adding migration safety checks to CI takes less than a minute.{' '}
                <a href="https://github.com/mickelsamuel/migrationpilot" className="text-accent hover:text-accent-hover">MigrationPilot</a>{' '}
                is open-source (MIT), runs 112 safety rules in under a second, and requires no database
                connection. It works as a CLI, GitHub Action, GitLab CI step, or Node.js library.
              </p>

              <CodeBlock code={`# Try it now on your existing migrations
npx migrationpilot analyze migrations/*.sql`} />
            </div>
          </div>
        </article>
      </main>
      <Footer />
    </>
  );
}
