import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'MigrationPilot vs Flyway — PostgreSQL Migration Safety Linting',
  description: 'Flyway handles migration execution. MigrationPilot handles migration safety. 80 rules catch unsafe DDL patterns that Flyway misses entirely — no JVM required.',
  keywords: ['flyway alternative', 'flyway postgresql', 'flyway migration linter', 'flyway vs migrationpilot', 'postgresql migration safety', 'flyway ddl linting'],
};

export default function MigrateFromFlywayPage() {
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
            <a href="/pricing" className="hover:text-white transition-colors">Pricing</a>
            <a href="/blog" className="hover:text-white transition-colors">Blog</a>
            <a href="https://github.com/mickelsamuel/migrationpilot" className="hover:text-white transition-colors">GitHub</a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-16 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm mb-6">
            Safety linting Flyway doesn&apos;t have
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
            MigrationPilot vs Flyway
          </h1>
          <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-8">
            Flyway runs your migrations. MigrationPilot tells you if they&apos;re safe to run.
            80 static analysis rules catch lock contention, data loss, and downtime risks — before you merge.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <div className="bg-slate-800 rounded-lg px-6 py-3 font-mono text-sm">
              npx migrationpilot analyze migrations/
            </div>
            <a
              href="https://github.com/mickelsamuel/migrationpilot"
              className="px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-500 font-medium transition-colors"
            >
              View on GitHub
            </a>
          </div>
        </div>
      </section>

      {/* Key Differences */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold mb-8">Different Tools for Different Problems</h2>
          <div className="grid md:grid-cols-2 gap-6 mb-12">
            <div className="border border-slate-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold mb-3 text-slate-300">Flyway</h3>
              <p className="text-slate-400 text-sm mb-4">Migration execution engine</p>
              <ul className="space-y-2 text-sm text-slate-400">
                <li className="flex items-start gap-2">
                  <span className="text-slate-500 mt-0.5">-</span>
                  Runs SQL migrations in order against your database
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-slate-500 mt-0.5">-</span>
                  Tracks which migrations have been applied (schema_version table)
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-slate-500 mt-0.5">-</span>
                  Java-based — requires JVM on CI runners and developer machines
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-slate-500 mt-0.5">-</span>
                  Configuration via flyway.conf, environment variables, or CLI flags
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-400 mt-0.5">-</span>
                  <span className="text-red-400">Does not check whether your DDL is safe to run</span>
                </li>
              </ul>
            </div>
            <div className="border border-blue-500/30 rounded-xl p-6 bg-blue-500/5">
              <h3 className="text-lg font-semibold mb-3 text-blue-400">MigrationPilot</h3>
              <p className="text-slate-400 text-sm mb-4">Migration safety linter</p>
              <ul className="space-y-2 text-sm text-slate-400">
                <li className="flex items-start gap-2">
                  <span className="text-green-400 mt-0.5">+</span>
                  <span className="text-green-400">80 rules catch unsafe DDL patterns statically</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-400 mt-0.5">+</span>
                  <span className="text-green-400">Lock type analysis — shows exactly which locks each statement takes</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-400 mt-0.5">+</span>
                  <span className="text-green-400">Zero config — npx one-liner, no JVM needed</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-400 mt-0.5">+</span>
                  <span className="text-green-400">GitHub Action with inline PR annotations</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-400 mt-0.5">+</span>
                  <span className="text-green-400">Auto-fix for 12 common issues</span>
                </li>
              </ul>
            </div>
          </div>
          <div className="border border-slate-800 rounded-lg p-6 bg-slate-900/30">
            <p className="text-slate-300 text-sm">
              <strong>They&apos;re complementary.</strong> Use Flyway to execute your migrations. Use MigrationPilot in CI to lint them before they reach production. MigrationPilot auto-detects Flyway migration directories and versioning patterns.
            </p>
          </div>
        </div>
      </section>

      {/* Comparison Table */}
      <section className="py-16 px-6 border-t border-slate-800/50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold mb-8">Feature Comparison</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-slate-800 rounded-lg overflow-hidden">
              <thead>
                <tr className="bg-slate-800/50">
                  <th className="text-left px-4 py-3 font-medium text-slate-300">Feature</th>
                  <th className="text-center px-4 py-3 font-medium text-slate-300">Flyway</th>
                  <th className="text-center px-4 py-3 font-medium text-blue-400">MigrationPilot</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { feature: 'Primary purpose', flyway: 'Migration execution', mp: 'Migration safety linting' },
                  { feature: 'DDL safety rules', flyway: 'None', mp: '80 rules' },
                  { feature: 'Lock type analysis', flyway: 'No', mp: 'Yes (per-statement)' },
                  { feature: 'Risk scoring', flyway: 'No', mp: 'RED/YELLOW/GREEN' },
                  { feature: 'Auto-fix', flyway: 'No', mp: '12 rules' },
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

      {/* What Flyway Misses */}
      <section className="py-16 px-6 border-t border-slate-800/50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold mb-2">What Flyway Doesn&apos;t Catch</h2>
          <p className="text-slate-400 mb-8">
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
              <div key={item.id} className="border border-slate-800 rounded-lg p-5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-mono text-red-400 text-sm">{item.id}</span>
                  <span className="font-semibold text-slate-200">{item.title}</span>
                </div>
                <p className="text-slate-400 text-sm mb-3">{item.desc}</p>
                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <span className="text-xs text-red-400 font-medium">Dangerous (Flyway runs this)</span>
                    <pre className="mt-1 bg-red-500/5 border border-red-500/20 rounded p-3 text-xs font-mono text-slate-400 overflow-x-auto">{item.sql}</pre>
                  </div>
                  <div>
                    <span className="text-xs text-green-400 font-medium">Safe (MigrationPilot suggests this)</span>
                    <pre className="mt-1 bg-green-500/5 border border-green-500/20 rounded p-3 text-xs font-mono text-slate-400 overflow-x-auto">{item.safe}</pre>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Add to Flyway Workflow */}
      <section className="py-16 px-6 border-t border-slate-800/50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold mb-8">Add MigrationPilot to Your Flyway Workflow</h2>
          <div className="space-y-6">
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-bold text-sm shrink-0">1</div>
              <div>
                <h3 className="font-semibold mb-1">Lint Flyway migrations in CI</h3>
                <p className="text-slate-400 text-sm mb-2">
                  MigrationPilot auto-detects Flyway&apos;s <code className="bg-slate-800 px-1.5 py-0.5 rounded text-slate-300">V__*.sql</code> versioning pattern.
                </p>
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
          path: sql/  # Your Flyway migrations directory`}
                </pre>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-bold text-sm shrink-0">2</div>
              <div>
                <h3 className="font-semibold mb-1">Or run locally before committing</h3>
                <pre className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 text-sm overflow-x-auto mt-2">
{`# Analyze all Flyway migrations
npx migrationpilot analyze sql/

# Auto-fix common issues
npx migrationpilot analyze sql/ --fix --dry-run

# Install pre-commit hook
npx migrationpilot hook install`}
                </pre>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-bold text-sm shrink-0">3</div>
              <div>
                <h3 className="font-semibold mb-1">Keep Flyway for execution</h3>
                <p className="text-slate-400 text-sm">
                  MigrationPilot is a linter, not a migration runner. Keep using <code className="bg-slate-800 px-1.5 py-0.5 rounded text-slate-300">flyway migrate</code> for execution. MigrationPilot checks your SQL files <em>before</em> Flyway touches the database.
                </p>
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
            80 safety rules. Zero config. No JVM required.
            Add to your Flyway workflow in 30 seconds.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a href="https://github.com/mickelsamuel/migrationpilot" className="px-8 py-3 rounded-lg bg-blue-600 hover:bg-blue-500 font-medium transition-colors">
              Get Started
            </a>
            <a href="/docs/quick-start" className="px-8 py-3 rounded-lg border border-slate-700 hover:border-slate-600 font-medium transition-colors">
              Read the Docs
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-800/50 py-8 px-6">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-slate-500">
          <span>MigrationPilot — PostgreSQL migration safety for teams that ship fast.</span>
          <div className="flex items-center gap-4">
            <a href="/" className="hover:text-slate-300">Home</a>
            <a href="/pricing" className="hover:text-slate-300">Pricing</a>
            <a href="https://github.com/mickelsamuel/migrationpilot" className="hover:text-slate-300">GitHub</a>
            <a href="https://www.npmjs.com/package/migrationpilot" className="hover:text-slate-300">npm</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
