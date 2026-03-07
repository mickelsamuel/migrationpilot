import type { Metadata } from 'next';
import Navbar from '@/components/navbar';

export const metadata: Metadata = {
  title: 'MigrationPilot vs Liquibase — PostgreSQL-Focused Migration Linting',
  description: 'Liquibase runs migrations across databases. MigrationPilot is a PostgreSQL-specialized migration linter with 83 safety rules, lock analysis, and auto-fix. Use them together.',
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
    description: 'Liquibase runs migrations across databases. MigrationPilot is a PostgreSQL-specialized migration linter with 83 safety rules, lock analysis, and auto-fix.',
    url: 'https://migrationpilot.dev/compare/liquibase',
  },
};

export default function CompareLiquibasePage() {
  return (
    <main className="min-h-screen">
      <Navbar />

      {/* Hero */}
      <section className="pt-32 pb-16 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm mb-6">
            Complement, not replacement
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
            MigrationPilot vs Liquibase
            <span className="block text-2xl md:text-3xl text-slate-400 font-normal mt-3">
              PostgreSQL-Specialized Safety Analysis
            </span>
          </h1>
          <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-8">
            Liquibase is a multi-database migration runner with some policy checks in its paid tier.
            MigrationPilot is a free, PostgreSQL-specialized linter with 83 safety rules that catches
            the lock and DDL issues Liquibase does not analyze.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="https://github.com/mickelsamuel/migrationpilot"
              className="px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-500 font-medium transition-colors"
            >
              Get Started Free
            </a>
            <a
              href="/docs"
              className="px-6 py-3 rounded-lg border border-slate-700 hover:border-slate-600 font-medium transition-colors"
            >
              Read the Docs
            </a>
          </div>
        </div>
      </section>

      {/* Key Differences */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold mb-8 text-center">Different Tools, Different Strengths</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="border border-slate-800 rounded-xl p-6 bg-slate-900/30">
              <div className="text-lg font-semibold mb-3">Liquibase</div>
              <p className="text-sm text-slate-400 mb-4">
                Liquibase is a database change management tool. It tracks, manages, and applies schema changes
                across multiple database engines using XML, YAML, JSON, or SQL changelogs.
              </p>
              <ul className="space-y-3 text-sm text-slate-400">
                <li className="flex items-start gap-2">
                  <span className="text-slate-500 mt-0.5 shrink-0">--</span>
                  Supports 50+ database engines
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-slate-500 mt-0.5 shrink-0">--</span>
                  Tracks changesets with DATABASECHANGELOG
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-slate-500 mt-0.5 shrink-0">--</span>
                  Policy checks available (Pro/Enterprise only)
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-slate-500 mt-0.5 shrink-0">--</span>
                  Policy checks are general-purpose, not PostgreSQL-specific
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-slate-500 mt-0.5 shrink-0">--</span>
                  No PostgreSQL lock analysis
                </li>
              </ul>
            </div>
            <div className="border border-blue-500/30 rounded-xl p-6 bg-blue-500/5">
              <div className="text-lg font-semibold mb-3 text-blue-400">MigrationPilot</div>
              <p className="text-sm text-slate-300 mb-4">
                MigrationPilot is a PostgreSQL migration linter. It analyzes SQL files for lock safety,
                risky DDL patterns, and best practices using the real PostgreSQL parser.
              </p>
              <ul className="space-y-3 text-sm text-slate-300">
                <li className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  80 PostgreSQL-specific safety rules
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Lock type analysis (SHARE through ACCESS EXCLUSIVE)
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  77 rules free (MIT licensed)
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Auto-detects Liquibase changelog directories
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
      <section className="py-16 px-6 border-t border-slate-800/50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold mb-8">Feature Comparison</h2>
          <div className="overflow-x-auto">
            <table className="text-sm border border-slate-800 rounded-lg overflow-hidden">
              <thead>
                <tr className="bg-slate-800/50">
                  <th className="text-left px-4 py-3 font-medium text-slate-300">Capability</th>
                  <th className="text-center px-4 py-3 font-medium text-slate-300">Liquibase OSS</th>
                  <th className="text-center px-4 py-3 font-medium text-slate-300">Liquibase Pro</th>
                  <th className="text-center px-4 py-3 font-medium text-blue-400">MigrationPilot</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { feature: 'Primary purpose', lbOss: 'Run migrations', lbPro: 'Run migrations', mp: 'Lint migrations' },
                  { feature: 'PostgreSQL safety rules', lbOss: 'None', lbPro: 'General policy checks', mp: '80 specialized rules' },
                  { feature: 'Lock type analysis', lbOss: 'No', lbPro: 'No', mp: 'Per-statement' },
                  { feature: 'Risk scoring', lbOss: 'No', lbPro: 'No', mp: 'RED / YELLOW / GREEN (0-100)' },
                  { feature: 'Auto-fix', lbOss: 'No', lbPro: 'No', mp: '12 rules' },
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
                  { feature: 'Price', lbOss: 'Free', lbPro: 'Custom (enterprise)', mp: 'Free (77 rules) / $19/mo Pro' },
                  { feature: 'License', lbOss: 'Apache 2.0', lbPro: 'Commercial', mp: 'MIT' },
                ].map((row) => (
                  <tr key={row.feature} className="border-t border-slate-800/50">
                    <td className="px-4 py-3 text-slate-300">{row.feature}</td>
                    <td className="px-4 py-3 text-center text-slate-500">{row.lbOss}</td>
                    <td className="px-4 py-3 text-center text-slate-400">{row.lbPro}</td>
                    <td className="px-4 py-3 text-center text-green-400 font-medium">{row.mp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Key Differentiators */}
      <section className="py-16 px-6 border-t border-slate-800/50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold mb-8">Why Add MigrationPilot to Your Liquibase Workflow</h2>
          <div className="grid md:grid-cols-2 gap-6">
            {[
              {
                title: 'PostgreSQL Lock Expertise',
                description: 'Liquibase policy checks are database-agnostic. MigrationPilot understands PostgreSQL lock levels (SHARE, SHARE UPDATE EXCLUSIVE, ACCESS EXCLUSIVE) and knows exactly when a DDL statement will block your application.',
              },
              {
                title: 'Free Safety Linting',
                description: 'Liquibase policy checks require a Pro or Enterprise license. MigrationPilot offers 77 rules for free under MIT license. No sales calls, no license keys for basic linting.',
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
              <div key={item.title} className="border border-slate-800 rounded-xl p-6 bg-slate-900/30">
                <h3 className="font-semibold mb-2">{item.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* When to Use Each */}
      <section className="py-16 px-6 border-t border-slate-800/50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold mb-8">When to Use Each Tool</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="border border-slate-800 rounded-xl p-6 bg-slate-900/30">
              <h3 className="text-lg font-semibold mb-4">Use Liquibase when you need to...</h3>
              <ul className="space-y-3 text-sm text-slate-400">
                <li className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Manage migrations across multiple database engines
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Use XML/YAML/JSON changelogs instead of raw SQL
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Track changelogs with DATABASECHANGELOG
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Apply schema changes and rollbacks in your Java/JVM stack
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Enforce enterprise database governance policies (Pro)
                </li>
              </ul>
            </div>
            <div className="border border-blue-500/30 rounded-xl p-6 bg-blue-500/5">
              <h3 className="text-lg font-semibold mb-4 text-blue-400">Use MigrationPilot when you need to...</h3>
              <ul className="space-y-3 text-sm text-slate-300">
                <li className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Deep PostgreSQL-specific safety analysis
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Know which locks each DDL statement acquires
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Automatically fix dangerous DDL patterns
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Get PR-level safety reports with risk scores
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Free, open-source migration linting without enterprise pricing
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-8 border border-slate-800 rounded-xl p-6 bg-slate-900/30">
            <h3 className="font-semibold mb-2">Best approach: Use both together</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              MigrationPilot does not replace Liquibase. Keep Liquibase for changelog management and migration execution.
              Add MigrationPilot as a CI lint step that runs before Liquibase applies changes. If your changelogs include raw SQL
              blocks, MigrationPilot analyzes them for safety. Think of it as ESLint for your migration SQL.
            </p>
          </div>
        </div>
      </section>

      {/* Setup with Liquibase */}
      <section className="py-16 px-6 border-t border-slate-800/50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold mb-8">Add MigrationPilot to Your Liquibase Project</h2>
          <div className="space-y-6">
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-bold text-sm shrink-0">1</div>
              <div className="min-w-0">
                <h3 className="font-semibold mb-1">Lint SQL changelogs locally</h3>
                <pre className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 text-sm overflow-x-auto mt-2">
{`# Analyze SQL migration files in your Liquibase changelog directory
npx migrationpilot analyze src/main/resources/db/changelog/*.sql

# MigrationPilot auto-detects Liquibase directories
npx migrationpilot detect`}
                </pre>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-bold text-sm shrink-0">2</div>
              <div className="min-w-0">
                <h3 className="font-semibold mb-1">Add to your CI pipeline</h3>
                <pre className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 text-sm overflow-x-auto mt-2">
{`# .github/workflows/migration-lint.yml
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
          fail-on: critical`}
                </pre>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-bold text-sm shrink-0">3</div>
              <div className="min-w-0">
                <h3 className="font-semibold mb-1">Configure rules for your team</h3>
                <pre className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 text-sm overflow-x-auto mt-2">
{`# .migrationpilotrc.yml
extends: recommended
pgVersion: 16
exclude:
  - MP008  # Allow multi-DDL if Liquibase wraps in transactions`}
                </pre>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 border-t border-slate-800/50">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">
            Liquibase manages changes. MigrationPilot makes them safe.
          </h2>
          <p className="text-slate-400 mb-8">
            80 PostgreSQL safety rules. 12 auto-fixes. Lock analysis. Risk scoring.
            Free and open-source. Add it to your Liquibase pipeline in 30 seconds.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a href="https://github.com/mickelsamuel/migrationpilot" className="px-8 py-3 rounded-lg bg-blue-600 hover:bg-blue-500 font-medium transition-colors">
              Get Started Free
            </a>
            <a href="/docs" className="px-8 py-3 rounded-lg border border-slate-700 hover:border-slate-600 font-medium transition-colors">
              Read the Docs
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-800/50 py-8 px-6">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-slate-500">
          <span>MigrationPilot -- PostgreSQL migration safety for teams that ship fast.</span>
          <div className="flex items-center gap-4">
            <a href="/" className="hover:text-slate-300">Home</a>
            <a href="/#pricing" className="hover:text-slate-300">Pricing</a>
            <a href="https://github.com/mickelsamuel/migrationpilot" className="hover:text-slate-300">GitHub</a>
            <a href="https://www.npmjs.com/package/migrationpilot" className="hover:text-slate-300">npm</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
