import type { Metadata } from 'next';
import Navbar from '@/components/navbar';
import { Footer } from '@/components/footer';
import { CodeBlock, CommandBlock } from '@/components/code-block';
import { ButtonLink } from '@/components/button';

export const metadata: Metadata = {
  title: 'MigrationPilot vs Liquibase — Lightweight PostgreSQL Migration Linting',
  description: 'Liquibase manages migration execution with XML changelogs. MigrationPilot adds 112 safety rules to catch dangerous DDL patterns — no Java or XML required.',
  keywords: ['liquibase alternative', 'liquibase postgresql', 'liquibase migration linter', 'liquibase vs migrationpilot', 'postgresql ddl linting', 'liquibase safety'],
};

export default function MigrateFromLiquibasePage() {
  return (
    <>
      <Navbar />
      <main className="pt-14">
        {/* Hero */}
        <section className="mp-container pt-16 md:pt-20 pb-16">
          <div className="max-w-4xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent-soft border border-accent/35 text-accent text-sm mb-6">
              Lightweight safety linting for your migrations
            </div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
              MigrationPilot vs Liquibase
            </h1>
            <p className="text-xl text-muted max-w-2xl mb-8">
              Liquibase is a powerful migration execution engine. MigrationPilot is a focused safety linter.
              Use them together — Liquibase runs your changelogs, MigrationPilot catches unsafe patterns before they reach production.
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
            <h2 className="text-2xl font-bold mb-8">Why Add MigrationPilot to Liquibase?</h2>
            <div className="grid md:grid-cols-2 gap-6 mb-12">
              <div className="border border-line rounded-xl p-6">
                <h3 className="text-lg font-semibold mb-3 text-muted">Liquibase</h3>
                <p className="text-muted text-sm mb-4">Enterprise migration execution</p>
                <ul className="space-y-2 text-sm text-muted">
                  <li className="flex items-start gap-2">
                    <span className="text-faint mt-0.5">-</span>
                    XML/YAML/JSON changelogs with abstracted changesets
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-faint mt-0.5">-</span>
                    Java-based — requires JVM on all CI/CD systems
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-faint mt-0.5">-</span>
                    Multi-database support (PostgreSQL, MySQL, Oracle, SQL Server, etc.)
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-faint mt-0.5">-</span>
                    Rollback support and changelog tracking (DATABASECHANGELOG table)
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-danger mt-0.5">-</span>
                    <span className="text-danger">Limited DDL safety checks — no lock analysis, no risk scoring</span>
                  </li>
                </ul>
              </div>
              <div className="border border-accent/35 rounded-xl p-6 bg-accent-soft">
                <h3 className="text-lg font-semibold mb-3 text-accent">MigrationPilot</h3>
                <p className="text-muted text-sm mb-4">Focused safety linter</p>
                <ul className="space-y-2 text-sm text-muted">
                  <li className="flex items-start gap-2">
                    <span className="text-ok mt-0.5">+</span>
                    <span className="text-ok">112 PostgreSQL-specific safety rules</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-ok mt-0.5">+</span>
                    <span className="text-ok">npx one-liner — no JVM, no XML, no setup</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-ok mt-0.5">+</span>
                    <span className="text-ok">Lock type analysis with per-statement breakdown</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-ok mt-0.5">+</span>
                    <span className="text-ok">Risk scoring (RED/YELLOW/GREEN) with safe alternatives</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-ok mt-0.5">+</span>
                    <span className="text-ok">Auto-detects Liquibase SQL changelog format</span>
                  </li>
                </ul>
              </div>
            </div>
            <div className="border border-line rounded-lg p-6 bg-surface">
              <p className="text-muted text-sm">
                <strong>Use them together.</strong> Liquibase handles migration execution, rollbacks, and changelog tracking. MigrationPilot handles safety analysis — it reads your raw SQL changesets and catches dangerous patterns that Liquibase doesn&apos;t check for.
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
                    <th className="text-center px-4 py-3 font-medium text-faint">Liquibase (OSS)</th>
                    <th className="text-center px-4 py-3 font-medium text-faint">Liquibase (Pro)</th>
                    <th className="text-center px-4 py-3 font-medium text-accent">MigrationPilot</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { feature: 'Primary purpose', lb: 'Migration execution', lbPro: 'Migration execution', mp: 'Migration safety linting' },
                    { feature: 'DDL safety rules', lb: 'None', lbPro: 'Basic checks', mp: '112 rules' },
                    { feature: 'Lock type analysis', lb: '—', lbPro: '—', mp: 'Yes (per-statement)' },
                    { feature: 'Risk scoring', lb: '—', lbPro: '—', mp: 'RED/YELLOW/GREEN (0-100)' },
                    { feature: 'Auto-fix', lb: '—', lbPro: '—', mp: '20 rules' },
                    { feature: 'Safe alternatives', lb: '—', lbPro: '—', mp: 'Yes (code suggestions)' },
                    { feature: 'GitHub Action', lb: 'Community', lbPro: 'Yes', mp: 'Free + inline annotations' },
                    { feature: 'SARIF output', lb: '—', lbPro: '—', mp: 'Yes (GitHub Code Scanning)' },
                    { feature: 'Runtime required', lb: 'JVM', lbPro: 'JVM', mp: 'Node.js (or npx)' },
                    { feature: 'Configuration', lb: 'XML/YAML/JSON + properties', lbPro: 'XML/YAML/JSON + properties', mp: 'Zero-config or YAML' },
                    { feature: 'Schema versioning', lb: 'Yes', lbPro: 'Yes', mp: 'No (lint only)' },
                    { feature: 'Rollback support', lb: 'Yes', lbPro: 'Yes + auto-rollback', mp: 'Rollback DDL generation' },
                    { feature: 'PostgreSQL parser', lb: 'No', lbPro: 'No', mp: 'Yes (libpg-query)' },
                    { feature: 'Multi-database', lb: 'Yes', lbPro: 'Yes', mp: 'PostgreSQL focused' },
                    { feature: 'Price', lb: 'Free', lbPro: 'Starting at $2,500/yr', mp: '$0 (all 112 rules free)' },
                    { feature: 'License', lb: 'Apache 2.0', lbPro: 'Commercial', mp: 'MIT' },
                  ].map((row) => (
                    <tr key={row.feature} className="border-t border-line-soft">
                      <td className="px-4 py-3 text-muted">{row.feature}</td>
                      <td className="px-4 py-3 text-center text-faint">{row.lb}</td>
                      <td className="px-4 py-3 text-center text-muted">{row.lbPro}</td>
                      <td className="px-4 py-3 text-center text-ok font-medium">{row.mp}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Setup Complexity */}
        <section className="mp-container py-16 border-t border-line-soft">
          <div className="max-w-4xl">
            <h2 className="text-2xl font-bold mb-8">Setup Comparison</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="min-w-0">
                <h3 className="font-semibold mb-3 text-muted">Liquibase Setup</h3>
                <CodeBlock code={`# 1. Install Java (if not present)
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
liquibase update`} />
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold mb-3 text-accent">MigrationPilot Setup</h3>
                <CodeBlock code={`# That's it. One command.
npx migrationpilot analyze migrations/

# Or add to CI (also one step):
# .github/workflows/lint.yml
- uses: mickelsamuel/migrationpilot@v1
  with:
    path: migrations/`} />
                <p className="text-faint text-xs mt-3">
                  No JVM. No properties file. No XML. Just point it at your SQL files.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Integration Steps */}
        <section className="mp-container py-16 border-t border-line-soft">
          <div className="max-w-4xl">
            <h2 className="text-2xl font-bold mb-8">Add Safety Linting to Liquibase</h2>
            <div className="space-y-6">
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-accent text-accent-ink flex items-center justify-center font-bold text-sm shrink-0">1</div>
                <div className="min-w-0">
                  <h3 className="font-semibold mb-1">Lint SQL changelogs in CI</h3>
                  <p className="text-muted text-sm mb-2">
                    Point MigrationPilot at the SQL files referenced by your Liquibase changelogs.
                  </p>
                  <CodeBlock code={`# Add before your liquibase update step:
- uses: mickelsamuel/migrationpilot@v1
  with:
    path: sql/  # Directory with your SQL changesets`} />
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-accent text-accent-ink flex items-center justify-center font-bold text-sm shrink-0">2</div>
                <div className="min-w-0">
                  <h3 className="font-semibold mb-1">Use SQL format changelogs</h3>
                  <p className="text-muted text-sm mb-2">
                    If you use Liquibase&apos;s SQL format (recommended for PostgreSQL), MigrationPilot can analyze them directly.
                    XML changelogs with embedded SQL are also supported.
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-accent text-accent-ink flex items-center justify-center font-bold text-sm shrink-0">3</div>
                <div className="min-w-0">
                  <h3 className="font-semibold mb-1">Keep Liquibase for execution</h3>
                  <p className="text-muted text-sm">
                    MigrationPilot is read-only. It never touches your database. Continue using <code className="bg-raised px-1.5 py-0.5 rounded text-muted">liquibase update</code> for migration execution and rollbacks.
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
              Safety linting without the enterprise complexity
            </h2>
            <p className="text-muted mb-8">
              112 safety rules. Zero config. No JVM required.
              Works with Liquibase SQL changelogs out of the box.
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
