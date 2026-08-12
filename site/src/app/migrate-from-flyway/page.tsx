import type { Metadata } from 'next';
import Navbar from '@/components/navbar';
import { Footer } from '@/components/footer';
import { CodeBlock, CommandBlock } from '@/components/code-block';
import { ButtonLink } from '@/components/button';

export const metadata: Metadata = {
  title: 'MigrationPilot vs Flyway — PostgreSQL Migration Safety Linting',
  description: 'Flyway handles migration execution. MigrationPilot handles migration safety. 112 rules catch unsafe DDL patterns that Flyway misses entirely — no JVM required.',
  keywords: ['flyway alternative', 'flyway postgresql', 'flyway migration linter', 'flyway vs migrationpilot', 'postgresql migration safety', 'flyway ddl linting'],
};

export default function MigrateFromFlywayPage() {
  return (
    <>
      <Navbar />
      <main className="pt-14">
        {/* Hero */}
        <section className="mp-container pt-16 md:pt-20 pb-16">
          <div className="max-w-4xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent-soft border border-accent/35 text-accent text-sm mb-6">
              Safety linting Flyway doesn&apos;t have
            </div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
              MigrationPilot vs Flyway
            </h1>
            <p className="text-xl text-muted max-w-2xl mb-8">
              Flyway runs your migrations. MigrationPilot tells you if they&apos;re safe to run.
              112 static analysis rules catch lock contention, data loss, and downtime risks — before you merge.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <CommandBlock command="npx migrationpilot analyze migrations/" />
              <ButtonLink href="https://github.com/mickelsamuel/migrationpilot">
                View on GitHub
              </ButtonLink>
            </div>
          </div>
        </section>

        {/* Key Differences */}
        <section className="mp-container py-16">
          <div className="max-w-4xl">
            <h2 className="text-2xl font-bold mb-8">Different Tools for Different Problems</h2>
            <div className="grid md:grid-cols-2 gap-6 mb-12">
              <div className="border border-line rounded-xl p-6">
                <h3 className="text-lg font-semibold mb-3 text-muted">Flyway</h3>
                <p className="text-muted text-sm mb-4">Migration execution engine</p>
                <ul className="space-y-2 text-sm text-muted">
                  <li className="flex items-start gap-2">
                    <span className="text-faint mt-0.5">-</span>
                    Runs SQL migrations in order against your database
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-faint mt-0.5">-</span>
                    Tracks which migrations have been applied (schema_version table)
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-faint mt-0.5">-</span>
                    Java-based — requires JVM on CI runners and developer machines
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-faint mt-0.5">-</span>
                    Configuration via flyway.conf, environment variables, or CLI flags
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-danger mt-0.5">-</span>
                    <span className="text-danger">Does not check whether your DDL is safe to run</span>
                  </li>
                </ul>
              </div>
              <div className="border border-accent/35 rounded-xl p-6 bg-accent-soft">
                <h3 className="text-lg font-semibold mb-3 text-accent">MigrationPilot</h3>
                <p className="text-muted text-sm mb-4">Migration safety linter</p>
                <ul className="space-y-2 text-sm text-muted">
                  <li className="flex items-start gap-2">
                    <span className="text-ok mt-0.5">+</span>
                    <span className="text-ok">112 rules catch unsafe DDL patterns statically</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-ok mt-0.5">+</span>
                    <span className="text-ok">Lock type analysis — shows exactly which locks each statement takes</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-ok mt-0.5">+</span>
                    <span className="text-ok">Zero config — npx one-liner, no JVM needed</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-ok mt-0.5">+</span>
                    <span className="text-ok">GitHub Action with inline PR annotations</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-ok mt-0.5">+</span>
                    <span className="text-ok">Auto-fix for 20 common issues</span>
                  </li>
                </ul>
              </div>
            </div>
            <div className="border border-line rounded-lg p-6 bg-surface">
              <p className="text-muted text-sm">
                <strong>They&apos;re complementary.</strong> Use Flyway to execute your migrations. Use MigrationPilot in CI to lint them before they reach production. MigrationPilot auto-detects Flyway migration directories and versioning patterns.
              </p>
            </div>
          </div>
        </section>

        {/* Comparison Table */}
        <section className="mp-container py-16 border-t border-line-soft">
          <div className="max-w-4xl">
            <h2 className="text-2xl font-bold mb-8">Feature Comparison</h2>
            <div className="overflow-x-auto">
              <table className="text-sm border border-line rounded-lg overflow-hidden">
                <thead>
                  <tr className="bg-raised">
                    <th className="text-left px-4 py-3 font-medium text-faint">Feature</th>
                    <th className="text-center px-4 py-3 font-medium text-faint">Flyway</th>
                    <th className="text-center px-4 py-3 font-medium text-accent">MigrationPilot</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { feature: 'Primary purpose', flyway: 'Migration execution', mp: 'Migration safety linting' },
                    { feature: 'DDL safety rules', flyway: 'None', mp: '112 rules' },
                    { feature: 'Lock type analysis', flyway: 'No', mp: 'Yes (per-statement)' },
                    { feature: 'Risk scoring', flyway: 'No', mp: 'RED/YELLOW/GREEN' },
                    { feature: 'Auto-fix', flyway: 'No', mp: '20 rules' },
                    { feature: 'GitHub Action', flyway: 'Community', mp: 'Official + inline annotations' },
                    { feature: 'SARIF output', flyway: 'No', mp: 'Yes (GitHub Code Scanning)' },
                    { feature: 'Runtime required', flyway: 'JVM (Java 8+)', mp: 'Node.js (or npx)' },
                    { feature: 'Configuration', flyway: 'flyway.conf + env vars', mp: 'Zero-config (optional YAML)' },
                    { feature: 'Install size', flyway: '~50MB (JVM + Flyway)', mp: 'npx (zero install)' },
                    { feature: 'PostgreSQL parser', flyway: 'No (execution only)', mp: 'Yes (libpg-query)' },
                    { feature: 'Schema versioning', flyway: 'Yes (schema_version table)', mp: 'No (lint only)' },
                    { feature: 'Multi-database', flyway: 'Yes (PG, MySQL, Oracle, etc.)', mp: 'PostgreSQL focused' },
                    { feature: 'Framework detection', flyway: 'N/A', mp: '14 frameworks (incl. Flyway)' },
                    { feature: 'RLS safety', flyway: 'No', mp: 'Yes (MP057)' },
                    { feature: 'Replication safety', flyway: 'No', mp: 'Yes (MP055, MP060)' },
                    { feature: 'License', flyway: 'Apache 2.0 / Commercial', mp: 'MIT' },
                  ].map((row) => (
                    <tr key={row.feature} className="border-t border-line-soft">
                      <td className="px-4 py-3 text-muted">{row.feature}</td>
                      <td className="px-4 py-3 text-center text-faint">{row.flyway}</td>
                      <td className="px-4 py-3 text-center text-ok font-medium">{row.mp}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* What Flyway Misses */}
        <section className="mp-container py-16 border-t border-line-soft">
          <div className="max-w-4xl">
            <h2 className="text-2xl font-bold mb-2">What Flyway Doesn&apos;t Catch</h2>
            <p className="text-muted mb-8">
              Flyway will happily execute any valid SQL. These dangerous patterns pass Flyway validation but cause production incidents:
            </p>
            <div className="space-y-4">
              {[
                {
                  id: 'MP001',
                  title: 'CREATE INDEX without CONCURRENTLY',
                  desc: 'Blocks all writes for the entire duration of index creation. On a 50M row table, this can be 10+ minutes of downtime.',
                  sql: 'CREATE INDEX idx_users_email ON users (email);',
                  safe: 'CREATE INDEX CONCURRENTLY idx_users_email ON users (email);',
                },
                {
                  id: 'MP003',
                  title: 'ADD COLUMN with volatile DEFAULT',
                  desc: 'Before PG 11, adding a column with a DEFAULT rewrites the entire table under ACCESS EXCLUSIVE lock.',
                  sql: 'ALTER TABLE orders ADD COLUMN created_at TIMESTAMP DEFAULT now();',
                  safe: 'ALTER TABLE orders ADD COLUMN created_at TIMESTAMP;\n-- Backfill in batches, then add default',
                },
                {
                  id: 'MP005',
                  title: 'ADD CONSTRAINT without NOT VALID',
                  desc: 'Foreign key validation scans the entire table while holding a SHARE ROW EXCLUSIVE lock.',
                  sql: 'ALTER TABLE orders ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id);',
                  safe: 'ALTER TABLE orders ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id) NOT VALID;\nALTER TABLE orders VALIDATE CONSTRAINT fk_user;',
                },
                {
                  id: 'MP007',
                  title: 'ALTER COLUMN TYPE',
                  desc: 'Changing a column type rewrites the entire table and all indexes. On large tables this causes extended downtime.',
                  sql: 'ALTER TABLE users ALTER COLUMN age TYPE bigint;',
                  safe: '-- Use expand-contract: add new column, backfill, swap',
                },
              ].map((item) => (
                <div key={item.id} className="border border-line rounded-lg p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-mono text-danger text-sm">{item.id}</span>
                    <span className="font-semibold text-fg">{item.title}</span>
                  </div>
                  <p className="text-muted text-sm mb-3">{item.desc}</p>
                  <div className="grid md:grid-cols-2 gap-3">
                    <div className="min-w-0">
                      <span className="text-xs text-danger font-medium">Dangerous (Flyway runs this)</span>
                      <CodeBlock code={item.sql} />
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs text-ok font-medium">Safe (MigrationPilot suggests this)</span>
                      <CodeBlock code={item.safe} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Add to Flyway Workflow */}
        <section className="mp-container py-16 border-t border-line-soft">
          <div className="max-w-4xl">
            <h2 className="text-2xl font-bold mb-8">Add MigrationPilot to Your Flyway Workflow</h2>
            <div className="space-y-6">
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-accent text-accent-ink flex items-center justify-center font-bold text-sm shrink-0">1</div>
                <div className="min-w-0">
                  <h3 className="font-semibold mb-1">Lint Flyway migrations in CI</h3>
                  <p className="text-muted text-sm mb-2">
                    MigrationPilot auto-detects Flyway&apos;s <code className="bg-raised px-1.5 py-0.5 rounded text-muted">V__*.sql</code> versioning pattern.
                  </p>
                  <CodeBlock code={`# .github/workflows/migration-lint.yml
name: Lint Migrations
on: pull_request
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: mickelsamuel/migrationpilot@v1
        with:
          path: sql/  # Your Flyway migrations directory`} />
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-accent text-accent-ink flex items-center justify-center font-bold text-sm shrink-0">2</div>
                <div className="min-w-0">
                  <h3 className="font-semibold mb-1">Or run locally before committing</h3>
                  <CodeBlock code={`# Analyze all Flyway migrations
npx migrationpilot analyze sql/

# Auto-fix common issues
npx migrationpilot analyze sql/ --fix --dry-run

# Install pre-commit hook
npx migrationpilot hook install`} />
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-accent text-accent-ink flex items-center justify-center font-bold text-sm shrink-0">3</div>
                <div className="min-w-0">
                  <h3 className="font-semibold mb-1">Keep Flyway for execution</h3>
                  <p className="text-muted text-sm">
                    MigrationPilot is a linter, not a migration runner. Keep using <code className="bg-raised px-1.5 py-0.5 rounded text-muted">flyway migrate</code> for execution. MigrationPilot checks your SQL files <em>before</em> Flyway touches the database.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="mp-container py-20 border-t border-line-soft">
          <div className="max-w-3xl">
            <h2 className="text-3xl font-bold mb-4">
              Flyway runs your migrations. MigrationPilot makes them safe.
            </h2>
            <p className="text-muted mb-8">
              112 safety rules. Zero config. No JVM required.
              Add to your Flyway workflow in 30 seconds.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <ButtonLink href="https://github.com/mickelsamuel/migrationpilot">
                Get Started
              </ButtonLink>
              <ButtonLink href="/docs/quick-start" variant="secondary">
                Read the Docs
              </ButtonLink>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
