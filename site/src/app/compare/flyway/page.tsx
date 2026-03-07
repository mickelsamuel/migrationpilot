import type { Metadata } from 'next';
import Navbar from '@/components/navbar';

export const metadata: Metadata = {
  title: 'MigrationPilot vs Flyway — Migration Linting vs Migration Running',
  description: 'Flyway runs migrations. MigrationPilot reviews them for safety. 83 rules catch lock issues, risky DDL, and missing best practices before your Flyway migration reaches production.',
  keywords: [
    'flyway alternative',
    'flyway migration linter',
    'postgresql migration safety',
    'flyway vs migrationpilot',
    'flyway migration review',
    'database migration linter',
    'flyway postgresql linting',
  ],
  alternates: {
    canonical: '/compare/flyway',
  },
  openGraph: {
    title: 'MigrationPilot vs Flyway — Migration Linting vs Migration Running',
    description: 'Flyway runs migrations. MigrationPilot reviews them for safety. 83 rules catch lock issues, risky DDL, and missing best practices before your Flyway migration reaches production.',
    url: 'https://migrationpilot.dev/compare/flyway',
  },
};

export default function CompareFlywayPage() {
  return (
    <main className="min-h-screen">
      <Navbar />

      {/* Hero */}
      <section className="pt-32 pb-16 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm mb-6">
            Different tools, better together
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
            MigrationPilot vs Flyway
            <span className="block text-2xl md:text-3xl text-slate-400 font-normal mt-3">
              Lint Your Migrations Before Flyway Runs Them
            </span>
          </h1>
          <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-8">
            Flyway is a migration runner &mdash; it tracks and applies schema changes. MigrationPilot is a migration linter &mdash;
            it catches dangerous DDL patterns before they reach production. They solve different problems and work best together.
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

      {/* Key Difference */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold mb-8 text-center">Different Tools for Different Jobs</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="border border-slate-800 rounded-xl p-6 bg-slate-900/30">
              <div className="text-lg font-semibold mb-3">Flyway (Migration Runner)</div>
              <ul className="space-y-3 text-sm text-slate-400">
                <li className="flex items-start gap-2">
                  <span className="text-slate-500 mt-0.5 shrink-0">--</span>
                  Tracks migration version history
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-slate-500 mt-0.5 shrink-0">--</span>
                  Applies SQL files to a database
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-slate-500 mt-0.5 shrink-0">--</span>
                  Manages schema versioning and rollback
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-slate-500 mt-0.5 shrink-0">--</span>
                  Does <strong className="text-slate-300">not</strong> analyze SQL for safety
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-slate-500 mt-0.5 shrink-0">--</span>
                  Does <strong className="text-slate-300">not</strong> check lock impact
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-slate-500 mt-0.5 shrink-0">--</span>
                  Does <strong className="text-slate-300">not</strong> suggest safe alternatives
                </li>
              </ul>
            </div>
            <div className="border border-blue-500/30 rounded-xl p-6 bg-blue-500/5">
              <div className="text-lg font-semibold mb-3 text-blue-400">MigrationPilot (Migration Linter)</div>
              <ul className="space-y-3 text-sm text-slate-300">
                <li className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  83 safety rules for PostgreSQL DDL
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Lock type analysis per statement
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Risk scoring (RED / YELLOW / GREEN)
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Auto-fix for 12 common issues
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Safe alternative suggestions
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Auto-detects Flyway migration directories
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
                  <th className="text-center px-4 py-3 font-medium text-slate-300">Flyway</th>
                  <th className="text-center px-4 py-3 font-medium text-blue-400">MigrationPilot</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { feature: 'Primary purpose', flyway: 'Run migrations', mp: 'Lint migrations' },
                  { feature: 'SQL safety analysis', flyway: 'No', mp: '83 rules' },
                  { feature: 'Lock type detection', flyway: 'No', mp: 'Per-statement (SHARE through ACCESS EXCLUSIVE)' },
                  { feature: 'Risk scoring', flyway: 'No', mp: 'RED / YELLOW / GREEN (0-100)' },
                  { feature: 'Auto-fix', flyway: 'No', mp: '12 rules auto-fixable' },
                  { feature: 'Safe alternative suggestions', flyway: 'No', mp: 'Yes (with SQL examples)' },
                  { feature: 'Migration versioning', flyway: 'Yes', mp: 'No (not needed)' },
                  { feature: 'Schema change execution', flyway: 'Yes', mp: 'No (read-only analysis)' },
                  { feature: 'Rollback support', flyway: 'Undo (paid)', mp: 'Rollback DDL generation' },
                  { feature: 'GitHub Action', flyway: 'Community', mp: 'Official (PR comments, inline annotations)' },
                  { feature: 'VS Code extension', flyway: 'No', mp: 'Yes' },
                  { feature: 'SARIF output', flyway: 'No', mp: 'Yes (GitHub Code Scanning)' },
                  { feature: 'Config presets', flyway: 'No', mp: '5 built-in presets' },
                  { feature: 'Framework detection', flyway: 'Flyway only', mp: '14 frameworks (including Flyway)' },
                  { feature: 'PostgreSQL focus', flyway: 'Multi-database', mp: 'PostgreSQL-specialized' },
                  { feature: 'License', flyway: 'Apache 2.0 (Community) / Commercial', mp: 'MIT' },
                  { feature: 'Pricing', flyway: 'Free Community / $$$$ Teams/Enterprise', mp: 'Free (77 rules) / $19/mo Pro' },
                ].map((row) => (
                  <tr key={row.feature} className="border-t border-slate-800/50">
                    <td className="px-4 py-3 text-slate-300">{row.feature}</td>
                    <td className="px-4 py-3 text-center text-slate-500">{row.flyway}</td>
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
          <h2 className="text-2xl font-bold mb-8">What MigrationPilot Adds to Your Flyway Workflow</h2>
          <div className="grid md:grid-cols-2 gap-6">
            {[
              {
                title: 'Catch Dangerous DDL Before Deployment',
                description: 'Flyway will happily run CREATE INDEX without CONCURRENTLY on a 100M-row table. MigrationPilot catches it in CI and suggests the safe alternative.',
              },
              {
                title: 'Lock Impact Visibility',
                description: 'Every DDL statement acquires a PostgreSQL lock. MigrationPilot tells you exactly which lock type each statement takes and whether it will block reads, writes, or both.',
              },
              {
                title: 'Auto-Fix Common Issues',
                description: 'MigrationPilot can automatically rewrite 12 common dangerous patterns: adding CONCURRENTLY, setting lock_timeout, using NOT VALID, and more.',
              },
              {
                title: 'Risk-Based PR Feedback',
                description: 'The GitHub Action posts a detailed safety report on every PR. RED/YELLOW/GREEN scoring gives reviewers immediate context on migration risk.',
              },
              {
                title: 'Works With Your Flyway Setup',
                description: 'MigrationPilot auto-detects Flyway migration directories (V*.sql, R*.sql). Point it at your db/migration folder and it works immediately.',
              },
              {
                title: 'Production Context (Pro)',
                description: 'Connect to your production database (read-only) to score risk based on actual table sizes, query frequency, and connection counts.',
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
              <h3 className="text-lg font-semibold mb-4">Use Flyway when you need to...</h3>
              <ul className="space-y-3 text-sm text-slate-400">
                <li className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Track which migrations have been applied
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Apply migrations to multiple environments
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Manage versioned SQL across your Java/JVM stack
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Execute schema changes against your database
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Support multiple database engines (MySQL, Oracle, SQL Server)
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
                  Review migration SQL for lock safety before merging
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Catch dangerous DDL patterns in CI/CD
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Get safe alternative SQL for risky operations
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Automatically fix common migration anti-patterns
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Enforce PostgreSQL migration best practices across your team
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-8 border border-slate-800 rounded-xl p-6 bg-slate-900/30">
            <h3 className="font-semibold mb-2">Best approach: Use both together</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              MigrationPilot is not a Flyway replacement &mdash; it is a complement. Keep Flyway for migration execution and versioning.
              Add MigrationPilot to your CI pipeline to lint migration files before Flyway applies them. This is like running ESLint on
              your JavaScript before deploying it.
            </p>
          </div>
        </div>
      </section>

      {/* Setup with Flyway */}
      <section className="py-16 px-6 border-t border-slate-800/50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold mb-8">Add MigrationPilot to Your Flyway Project</h2>
          <div className="space-y-6">
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-bold text-sm shrink-0">1</div>
              <div className="min-w-0">
                <h3 className="font-semibold mb-1">Lint locally</h3>
                <pre className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 text-sm overflow-x-auto mt-2">
{`# Analyze your Flyway migrations
npx migrationpilot analyze db/migration/

# Auto-detect Flyway directory
npx migrationpilot detect`}
                </pre>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-bold text-sm shrink-0">2</div>
              <div className="min-w-0">
                <h3 className="font-semibold mb-1">Add to GitHub Actions</h3>
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
          path: db/migration/
          fail-on: critical`}
                </pre>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-bold text-sm shrink-0">3</div>
              <div className="min-w-0">
                <h3 className="font-semibold mb-1">Auto-fix common issues</h3>
                <pre className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 text-sm overflow-x-auto mt-2">
{`# Preview fixes without modifying files
npx migrationpilot analyze db/migration/ --fix --dry-run

# Apply fixes in-place
npx migrationpilot analyze db/migration/ --fix`}
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
            Flyway runs your migrations. MigrationPilot makes them safe.
          </h2>
          <p className="text-slate-400 mb-8">
            83 safety rules. 12 auto-fixes. Lock analysis. Risk scoring. GitHub Action with PR comments.
            Add it to your Flyway workflow in 30 seconds.
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
