import type { Metadata } from 'next';
import Navbar from '@/components/navbar';
import { Footer } from '@/components/footer';
import { ButtonLink } from '@/components/button';
import { CodeBlock } from '@/components/code-block';

export const metadata: Metadata = {
  title: 'MigrationPilot vs Liquibase — PostgreSQL-Focused Migration Linting',
  description: 'Liquibase runs migrations across databases. MigrationPilot is a PostgreSQL-specialized migration linter with 112 safety rules, lock analysis, and auto-fix. Use them together.',
  keywords: [
    'liquibase alternative',
    'liquibase migration linter',
    'postgresql migration safety',
    'liquibase vs migrationpilot',
    'liquibase policy checks alternative',
    'database migration linter',
    'liquibase postgresql linting',
  ],
  alternates: {
    canonical: '/compare/liquibase',
  },
  openGraph: {
    title: 'MigrationPilot vs Liquibase — PostgreSQL-Focused Migration Linting',
    description: 'Liquibase runs migrations across databases. MigrationPilot is a PostgreSQL-specialized migration linter with 112 safety rules, lock analysis, and auto-fix.',
    url: 'https://migrationpilot.dev/compare/liquibase',
  },
};

export default function CompareLiquibasePage() {
  return (
    <>
      <Navbar />
      <main className="pt-14">
        {/* Hero */}
        <section className="mp-container pt-16 md:pt-20 pb-16">
          <div className="max-w-4xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-ok-soft border border-ok/30 text-ok text-sm mb-6">
              Complement, not replacement
            </div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
              MigrationPilot vs Liquibase
              <span className="block text-2xl md:text-3xl text-muted font-normal mt-3">
                PostgreSQL-Specialized Safety Analysis
              </span>
            </h1>
            <p className="text-xl text-muted max-w-2xl mb-8">
              Liquibase is a multi-database migration runner with some policy checks in its paid tier.
              MigrationPilot is a free, PostgreSQL-specialized linter with 112 safety rules that catches
              the lock and DDL issues Liquibase does not analyze.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <ButtonLink href="https://github.com/mickelsamuel/migrationpilot">
                Get Started Free
              </ButtonLink>
              <ButtonLink href="/docs" variant="secondary">
                Read the Docs
              </ButtonLink>
            </div>
          </div>
        </section>

        {/* Key Differences */}
        <section className="mp-container py-16">
          <div className="max-w-4xl">
            <h2 className="text-2xl font-bold mb-8 text-center">Different Tools, Different Strengths</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="border border-line rounded-xl p-6 bg-surface">
                <div className="text-lg font-semibold mb-3">Liquibase</div>
                <p className="text-sm text-muted mb-4">
                  Liquibase is a database change management tool. It tracks, manages, and applies schema changes
                  across multiple database engines using XML, YAML, JSON, or SQL changelogs.
                </p>
                <ul className="space-y-3 text-sm text-muted">
                  <li className="flex items-start gap-2">
                    <span className="text-faint mt-0.5 shrink-0">--</span>
                    Supports 50+ database engines
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-faint mt-0.5 shrink-0">--</span>
                    Tracks changesets with DATABASECHANGELOG
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-faint mt-0.5 shrink-0">--</span>
                    Policy checks available (Pro/Enterprise only)
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-faint mt-0.5 shrink-0">--</span>
                    Policy checks are general-purpose, not PostgreSQL-specific
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-faint mt-0.5 shrink-0">--</span>
                    No PostgreSQL lock analysis
                  </li>
                </ul>
              </div>
              <div className="border border-accent/35 rounded-xl p-6 bg-accent-soft">
                <div className="text-lg font-semibold mb-3 text-accent">MigrationPilot</div>
                <p className="text-sm text-muted mb-4">
                  MigrationPilot is a PostgreSQL migration linter. It analyzes SQL files for lock safety,
                  risky DDL patterns, and best practices using the real PostgreSQL parser.
                </p>
                <ul className="space-y-3 text-sm text-muted">
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-accent mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    112 PostgreSQL-specific safety rules
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-accent mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Lock type analysis (SHARE through ACCESS EXCLUSIVE)
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-accent mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    112 rules free (MIT licensed)
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-accent mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Auto-detects Liquibase changelog directories
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-accent mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Real PostgreSQL parser (libpg-query), not regex
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Feature Comparison Table */}
        <section className="mp-container py-16 border-t border-line-soft">
          <div className="max-w-4xl">
            <h2 className="text-2xl font-bold mb-8">Feature Comparison</h2>
            <div className="overflow-x-auto">
              <table className="text-sm border border-line rounded-lg overflow-hidden">
                <thead>
                  <tr className="bg-raised">
                    <th className="text-left px-4 py-3 font-medium text-faint">Capability</th>
                    <th className="text-center px-4 py-3 font-medium text-faint">Liquibase OSS</th>
                    <th className="text-center px-4 py-3 font-medium text-faint">Liquibase Pro</th>
                    <th className="text-center px-4 py-3 font-medium text-accent">MigrationPilot</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { feature: 'Primary purpose', lbOss: 'Run migrations', lbPro: 'Run migrations', mp: 'Lint migrations' },
                    { feature: 'PostgreSQL safety rules', lbOss: 'None', lbPro: 'General policy checks', mp: '112 specialized rules' },
                    { feature: 'Lock type analysis', lbOss: 'No', lbPro: 'No', mp: 'Per-statement' },
                    { feature: 'Risk scoring', lbOss: 'No', lbPro: 'No', mp: 'RED / YELLOW / GREEN (0-100)' },
                    { feature: 'Auto-fix', lbOss: 'No', lbPro: 'No', mp: '20 rules' },
                    { feature: 'Safe alternative SQL', lbOss: 'No', lbPro: 'No', mp: 'Per violation' },
                    { feature: 'Migration execution', lbOss: 'Yes', lbPro: 'Yes', mp: 'No (read-only)' },
                    { feature: 'Multi-database', lbOss: '50+', lbPro: '50+', mp: 'PostgreSQL only' },
                    { feature: 'GitHub Action', lbOss: 'Community', lbPro: 'Bundled', mp: 'Official (free)' },
                    { feature: 'PR comments', lbOss: 'No', lbPro: 'No', mp: 'Yes + inline annotations' },
                    { feature: 'VS Code extension', lbOss: 'No', lbPro: 'No', mp: 'Yes' },
                    { feature: 'SARIF output', lbOss: 'No', lbPro: 'No', mp: 'Yes' },
                    { feature: 'Config presets', lbOss: 'No', lbPro: 'Custom policies', mp: '5 built-in presets' },
                    { feature: 'Rollback DDL generation', lbOss: 'Yes', lbPro: 'Yes', mp: 'Yes' },
                    { feature: 'Framework detection', lbOss: 'Liquibase only', lbPro: 'Liquibase only', mp: '14 frameworks' },
                    { feature: 'Price', lbOss: 'Free', lbPro: 'Custom (enterprise)', mp: 'Free (all 112 rules)' },
                    { feature: 'License', lbOss: 'Apache 2.0', lbPro: 'Commercial', mp: 'MIT' },
                  ].map((row) => (
                    <tr key={row.feature} className="border-t border-line-soft">
                      <td className="px-4 py-3 text-muted">{row.feature}</td>
                      <td className="px-4 py-3 text-center text-faint">{row.lbOss}</td>
                      <td className="px-4 py-3 text-center text-muted">{row.lbPro}</td>
                      <td className="px-4 py-3 text-center text-ok font-medium">{row.mp}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Key Differentiators */}
        <section className="mp-container py-16 border-t border-line-soft">
          <div className="max-w-4xl">
            <h2 className="text-2xl font-bold mb-8">Why Add MigrationPilot to Your Liquibase Workflow</h2>
            <div className="grid md:grid-cols-2 gap-6">
              {[
                {
                  title: 'PostgreSQL Lock Expertise',
                  description: 'Liquibase policy checks are database-agnostic. MigrationPilot understands PostgreSQL lock levels (SHARE, SHARE UPDATE EXCLUSIVE, ACCESS EXCLUSIVE) and knows exactly when a DDL statement will block your application.',
                },
                {
                  title: 'Free Safety Linting',
                  description: 'Liquibase policy checks require a Pro or Enterprise license. MigrationPilot offers all 112 rules for free under an MIT license. No sales calls, no license keys.',
                },
                {
                  title: 'Real PostgreSQL Parser',
                  description: 'MigrationPilot uses libpg-query (the real PostgreSQL parser compiled to WASM). It parses SQL exactly like PostgreSQL does. No regex heuristics, no false positives from syntax edge cases.',
                },
                {
                  title: 'Automatic Remediation',
                  description: 'MigrationPilot auto-fixes 12 common issues: adds CONCURRENTLY to CREATE INDEX, inserts lock_timeout, adds NOT VALID to constraints, and more. Liquibase tells you something is wrong; MigrationPilot fixes it.',
                },
                {
                  title: 'PR-Level Feedback',
                  description: 'The GitHub Action posts safety reports as PR comments with inline annotations on changed files. Reviewers see risk scores, lock types, and safe alternatives without leaving the PR.',
                },
                {
                  title: 'Works Alongside Liquibase',
                  description: 'MigrationPilot auto-detects Liquibase migration directories. Keep Liquibase for execution and versioning. Add MigrationPilot as a CI lint step to catch dangerous SQL before Liquibase runs it.',
                },
              ].map((item) => (
                <div key={item.title} className="border border-line rounded-xl p-6 bg-surface">
                  <h3 className="font-semibold mb-2">{item.title}</h3>
                  <p className="text-sm text-muted leading-relaxed">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* When to Use Each */}
        <section className="mp-container py-16 border-t border-line-soft">
          <div className="max-w-4xl">
            <h2 className="text-2xl font-bold mb-8">When to Use Each Tool</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="border border-line rounded-xl p-6 bg-surface">
                <h3 className="text-lg font-semibold mb-4">Use Liquibase when you need to...</h3>
                <ul className="space-y-3 text-sm text-muted">
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-ok mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Manage migrations across multiple database engines
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-ok mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Use XML/YAML/JSON changelogs instead of raw SQL
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-ok mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Track changelogs with DATABASECHANGELOG
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-ok mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Apply schema changes and rollbacks in your Java/JVM stack
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-ok mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Enforce enterprise database governance policies (Pro)
                  </li>
                </ul>
              </div>
              <div className="border border-accent/35 rounded-xl p-6 bg-accent-soft">
                <h3 className="text-lg font-semibold mb-4 text-accent">Use MigrationPilot when you need to...</h3>
                <ul className="space-y-3 text-sm text-muted">
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-accent mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Deep PostgreSQL-specific safety analysis
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-accent mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Know which locks each DDL statement acquires
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-accent mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Automatically fix dangerous DDL patterns
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-accent mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Get PR-level safety reports with risk scores
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-accent mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Free, open-source migration linting without enterprise pricing
                  </li>
                </ul>
              </div>
            </div>
            <div className="mt-8 border border-line rounded-xl p-6 bg-surface">
              <h3 className="font-semibold mb-2">Best approach: Use both together</h3>
              <p className="text-sm text-muted leading-relaxed">
                MigrationPilot does not replace Liquibase. Keep Liquibase for changelog management and migration execution.
                Add MigrationPilot as a CI lint step that runs before Liquibase applies changes. If your changelogs include raw SQL
                blocks, MigrationPilot analyzes them for safety. Think of it as ESLint for your migration SQL.
              </p>
            </div>
          </div>
        </section>

        {/* Setup with Liquibase */}
        <section className="mp-container py-16 border-t border-line-soft">
          <div className="max-w-4xl">
            <h2 className="text-2xl font-bold mb-8">Add MigrationPilot to Your Liquibase Project</h2>
            <div className="space-y-6">
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-accent text-accent-ink flex items-center justify-center font-bold text-sm shrink-0">1</div>
                <div className="min-w-0">
                  <h3 className="font-semibold mb-1">Lint SQL changelogs locally</h3>
                  <CodeBlock code={`# Analyze SQL migration files in your Liquibase changelog directory
npx migrationpilot analyze src/main/resources/db/changelog/*.sql

# MigrationPilot auto-detects Liquibase directories
npx migrationpilot detect`} />
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-accent text-accent-ink flex items-center justify-center font-bold text-sm shrink-0">2</div>
                <div className="min-w-0">
                  <h3 className="font-semibold mb-1">Add to your CI pipeline</h3>
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
          path: src/main/resources/db/changelog/
          fail-on: critical`} />
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-accent text-accent-ink flex items-center justify-center font-bold text-sm shrink-0">3</div>
                <div className="min-w-0">
                  <h3 className="font-semibold mb-1">Configure rules for your team</h3>
                  <CodeBlock code={`# .migrationpilotrc.yml
extends: recommended
pgVersion: 16
exclude:
  - MP008  # Allow multi-DDL if Liquibase wraps in transactions`} />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="mp-container py-20 border-t border-line-soft">
          <div className="max-w-3xl">
            <h2 className="text-3xl font-bold mb-4">
              Liquibase manages changes. MigrationPilot makes them safe.
            </h2>
            <p className="text-muted mb-8">
              112 PostgreSQL safety rules. 20 auto-fixes. Lock analysis. Risk scoring.
              Free and open-source. Add it to your Liquibase pipeline in 30 seconds.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <ButtonLink href="https://github.com/mickelsamuel/migrationpilot">
                Get Started Free
              </ButtonLink>
              <ButtonLink href="/docs" variant="secondary">
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
