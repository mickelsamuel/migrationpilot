import type { Metadata } from 'next';
import Navbar from '@/components/navbar';

export const metadata: Metadata = {
  title: 'MigrationPilot vs Liquibase — Lightweight PostgreSQL Migration Linting',
  description: 'Liquibase manages migration execution with XML changelogs. MigrationPilot adds 80 safety rules to catch dangerous DDL patterns — no Java or XML required.',
  keywords: ['liquibase alternative', 'liquibase postgresql', 'liquibase migration linter', 'liquibase vs migrationpilot', 'postgresql ddl linting', 'liquibase safety'],
};

export default function MigrateFromLiquibasePage() {
  return (
    <main className="min-h-screen">
      <Navbar />

      {/* Hero */}
      <section className="pt-32 pb-16 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm mb-6">
            Lightweight safety linting for your migrations
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
            MigrationPilot vs Liquibase
          </h1>
          <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-8">
            Liquibase is a powerful migration execution engine. MigrationPilot is a focused safety linter.
            Use them together — Liquibase runs your changelogs, MigrationPilot catches unsafe patterns before they reach production.
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
          <h2 className="text-2xl font-bold mb-8">Why Add MigrationPilot to Liquibase?</h2>
          <div className="grid md:grid-cols-2 gap-6 mb-12">
            <div className="border border-slate-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold mb-3 text-slate-300">Liquibase</h3>
              <p className="text-slate-400 text-sm mb-4">Enterprise migration execution</p>
              <ul className="space-y-2 text-sm text-slate-400">
                <li className="flex items-start gap-2">
                  <span className="text-slate-500 mt-0.5">-</span>
                  XML/YAML/JSON changelogs with abstracted changesets
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-slate-500 mt-0.5">-</span>
                  Java-based — requires JVM on all CI/CD systems
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-slate-500 mt-0.5">-</span>
                  Multi-database support (PostgreSQL, MySQL, Oracle, SQL Server, etc.)
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-slate-500 mt-0.5">-</span>
                  Rollback support and changelog tracking (DATABASECHANGELOG table)
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-400 mt-0.5">-</span>
                  <span className="text-red-400">Limited DDL safety checks — no lock analysis, no risk scoring</span>
                </li>
              </ul>
            </div>
            <div className="border border-blue-500/30 rounded-xl p-6 bg-blue-500/5">
              <h3 className="text-lg font-semibold mb-3 text-blue-400">MigrationPilot</h3>
              <p className="text-slate-400 text-sm mb-4">Focused safety linter</p>
              <ul className="space-y-2 text-sm text-slate-400">
                <li className="flex items-start gap-2">
                  <span className="text-green-400 mt-0.5">+</span>
                  <span className="text-green-400">80 PostgreSQL-specific safety rules</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-400 mt-0.5">+</span>
                  <span className="text-green-400">npx one-liner — no JVM, no XML, no setup</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-400 mt-0.5">+</span>
                  <span className="text-green-400">Lock type analysis with per-statement breakdown</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-400 mt-0.5">+</span>
                  <span className="text-green-400">Risk scoring (RED/YELLOW/GREEN) with safe alternatives</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-400 mt-0.5">+</span>
                  <span className="text-green-400">Auto-detects Liquibase SQL changelog format</span>
                </li>
              </ul>
            </div>
          </div>
          <div className="border border-slate-800 rounded-lg p-6 bg-slate-900/30">
            <p className="text-slate-300 text-sm">
              <strong>Use them together.</strong> Liquibase handles migration execution, rollbacks, and changelog tracking. MigrationPilot handles safety analysis — it reads your raw SQL changesets and catches dangerous patterns that Liquibase doesn&apos;t check for.
            </p>
          </div>
        </div>
      </section>

      {/* Comparison Table */}
      <section className="py-16 px-6 border-t border-slate-800/50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold mb-8">Feature Comparison</h2>
          <div className="overflow-x-auto">
            <table className="text-sm border border-slate-800 rounded-lg overflow-hidden">
              <thead>
                <tr className="bg-slate-800/50">
                  <th className="text-left px-4 py-3 font-medium text-slate-300">Feature</th>
                  <th className="text-center px-4 py-3 font-medium text-slate-300">Liquibase (OSS)</th>
                  <th className="text-center px-4 py-3 font-medium text-slate-300">Liquibase (Pro)</th>
                  <th className="text-center px-4 py-3 font-medium text-blue-400">MigrationPilot</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { feature: 'Primary purpose', lb: 'Migration execution', lbPro: 'Migration execution', mp: 'Migration safety linting' },
                  { feature: 'DDL safety rules', lb: 'None', lbPro: 'Basic checks', mp: '80 rules' },
                  { feature: 'Lock type analysis', lb: '—', lbPro: '—', mp: 'Yes (per-statement)' },
                  { feature: 'Risk scoring', lb: '—', lbPro: '—', mp: 'RED/YELLOW/GREEN (0-100)' },
                  { feature: 'Auto-fix', lb: '—', lbPro: '—', mp: '12 rules' },
                  { feature: 'Safe alternatives', lb: '—', lbPro: '—', mp: 'Yes (code suggestions)' },
                  { feature: 'GitHub Action', lb: 'Community', lbPro: 'Yes', mp: 'Free + inline annotations' },
                  { feature: 'SARIF output', lb: '—', lbPro: '—', mp: 'Yes (GitHub Code Scanning)' },
                  { feature: 'Runtime required', lb: 'JVM', lbPro: 'JVM', mp: 'Node.js (or npx)' },
                  { feature: 'Configuration', lb: 'XML/YAML/JSON + properties', lbPro: 'XML/YAML/JSON + properties', mp: 'Zero-config or YAML' },
                  { feature: 'Schema versioning', lb: 'Yes', lbPro: 'Yes', mp: 'No (lint only)' },
                  { feature: 'Rollback support', lb: 'Yes', lbPro: 'Yes + auto-rollback', mp: 'Rollback DDL generation' },
                  { feature: 'PostgreSQL parser', lb: 'No', lbPro: 'No', mp: 'Yes (libpg-query)' },
                  { feature: 'Multi-database', lb: 'Yes', lbPro: 'Yes', mp: 'PostgreSQL focused' },
                  { feature: 'Price', lb: 'Free', lbPro: 'Starting at $2,500/yr', mp: '$0 (77 rules free)' },
                  { feature: 'License', lb: 'Apache 2.0', lbPro: 'Commercial', mp: 'MIT' },
                ].map((row) => (
                  <tr key={row.feature} className="border-t border-slate-800/50">
                    <td className="px-4 py-3 text-slate-300">{row.feature}</td>
                    <td className="px-4 py-3 text-center text-slate-500">{row.lb}</td>
                    <td className="px-4 py-3 text-center text-slate-400">{row.lbPro}</td>
                    <td className="px-4 py-3 text-center text-green-400 font-medium">{row.mp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Setup Complexity */}
      <section className="py-16 px-6 border-t border-slate-800/50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold mb-8">Setup Comparison</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="min-w-0">
              <h3 className="font-semibold mb-3 text-slate-300">Liquibase Setup</h3>
              <pre className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 text-xs overflow-x-auto">
{`# 1. Install Java (if not present)
apt-get install openjdk-17-jre

# 2. Download Liquibase
wget https://github.com/liquibase/.../liquibase.tar.gz
tar -xzf liquibase.tar.gz

# 3. Create liquibase.properties
cat > liquibase.properties << EOF
changeLogFile=changelog.xml
url=jdbc:postgresql://localhost:5432/mydb
username=postgres
password=secret
EOF

# 4. Create XML changelog
cat > changelog.xml << EOF
<?xml version="1.0" encoding="UTF-8"?>
<databaseChangeLog ...>
  <changeSet id="1" author="dev">
    <sql>CREATE INDEX idx ON users(email);</sql>
  </changeSet>
</databaseChangeLog>
EOF

# 5. Run
liquibase update`}
              </pre>
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold mb-3 text-blue-400">MigrationPilot Setup</h3>
              <pre className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-4 text-xs overflow-x-auto">
{`# That's it. One command.
npx migrationpilot analyze migrations/

# Or add to CI (also one step):
# .github/workflows/lint.yml
- uses: mickelsamuel/migrationpilot@v1
  with:
    path: migrations/`}
              </pre>
              <p className="text-slate-500 text-xs mt-3">
                No JVM. No properties file. No XML. Just point it at your SQL files.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Integration Steps */}
      <section className="py-16 px-6 border-t border-slate-800/50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold mb-8">Add Safety Linting to Liquibase</h2>
          <div className="space-y-6">
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-bold text-sm shrink-0">1</div>
              <div className="min-w-0">
                <h3 className="font-semibold mb-1">Lint SQL changelogs in CI</h3>
                <p className="text-slate-400 text-sm mb-2">
                  Point MigrationPilot at the SQL files referenced by your Liquibase changelogs.
                </p>
                <pre className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 text-sm overflow-x-auto mt-2">
{`# Add before your liquibase update step:
- uses: mickelsamuel/migrationpilot@v1
  with:
    path: sql/  # Directory with your SQL changesets`}
                </pre>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-bold text-sm shrink-0">2</div>
              <div className="min-w-0">
                <h3 className="font-semibold mb-1">Use SQL format changelogs</h3>
                <p className="text-slate-400 text-sm mb-2">
                  If you use Liquibase&apos;s SQL format (recommended for PostgreSQL), MigrationPilot can analyze them directly.
                  XML changelogs with embedded SQL are also supported.
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-bold text-sm shrink-0">3</div>
              <div className="min-w-0">
                <h3 className="font-semibold mb-1">Keep Liquibase for execution</h3>
                <p className="text-slate-400 text-sm">
                  MigrationPilot is read-only. It never touches your database. Continue using <code className="bg-slate-800 px-1.5 py-0.5 rounded text-slate-300">liquibase update</code> for migration execution and rollbacks.
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
            Safety linting without the enterprise complexity
          </h2>
          <p className="text-slate-400 mb-8">
            80 safety rules. Zero config. No JVM required.
            Works with Liquibase SQL changelogs out of the box.
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
