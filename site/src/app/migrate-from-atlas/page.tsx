import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Migrate from Atlas to MigrationPilot — Free PostgreSQL Migration Linting',
  description: 'Atlas moved migration linting to Pro-only in v0.38. MigrationPilot offers 80 free safety rules, GitHub Action, auto-fix, and more — no paid tier required.',
  keywords: ['atlas migrate alternative', 'atlas lint alternative', 'postgresql migration linting', 'atlas pro alternative', 'free migration linter'],
};

const ruleMapping = [
  {
    atlasId: 'PG301',
    atlasName: 'Detect creating index on a table non-concurrently',
    mpId: 'MP001',
    mpName: 'require-concurrent-index',
    autoFix: true,
  },
  {
    atlasId: 'PG302',
    atlasName: 'Detect adding a NOT NULL column without default',
    mpId: 'MP002',
    mpName: 'require-check-not-null',
    autoFix: false,
  },
  {
    atlasId: 'PG303',
    atlasName: 'Detect adding a column with a volatile default',
    mpId: 'MP003',
    mpName: 'volatile-default-rewrite',
    autoFix: false,
  },
  {
    atlasId: 'PG304',
    atlasName: 'Detect adding a foreign key without NOT VALID',
    mpId: 'MP005',
    mpName: 'require-not-valid-fk',
    autoFix: false,
  },
  {
    atlasId: 'PG305',
    atlasName: 'Detect adding a CHECK constraint without NOT VALID',
    mpId: 'MP030',
    mpName: 'require-not-valid-check',
    autoFix: true,
  },
  {
    atlasId: 'PG306',
    atlasName: 'Detect dropping an index non-concurrently',
    mpId: 'MP009',
    mpName: 'require-drop-index-concurrently',
    autoFix: true,
  },
  {
    atlasId: 'PG307',
    atlasName: 'Detect column type changes',
    mpId: 'MP007',
    mpName: 'no-column-type-change',
    autoFix: false,
  },
];

const uniqueRules = [
  { id: 'MP004', name: 'require-lock-timeout', description: 'Require SET lock_timeout before DDL' },
  { id: 'MP008', name: 'no-multi-ddl-transaction', description: 'Avoid multiple DDL statements in a single transaction' },
  { id: 'MP010', name: 'no-rename-column', description: 'Renaming columns breaks application queries' },
  { id: 'MP012', name: 'no-enum-add-in-transaction', description: 'ALTER TYPE ADD VALUE cannot run inside a transaction (PG < 12)' },
  { id: 'MP017', name: 'no-drop-column', description: 'DROP COLUMN acquires ACCESS EXCLUSIVE lock' },
  { id: 'MP020', name: 'require-statement-timeout', description: 'Require SET statement_timeout for long-running DDL' },
  { id: 'MP022', name: 'no-drop-cascade', description: 'CASCADE silently drops dependent objects' },
  { id: 'MP025', name: 'ban-concurrent-in-transaction', description: 'CONCURRENTLY in a transaction causes runtime error' },
  { id: 'MP037', name: 'prefer-text-over-varchar', description: 'Use TEXT instead of VARCHAR(n) — same performance, no arbitrary limit' },
  { id: 'MP044', name: 'no-data-loss-type-narrowing', description: 'Detect type changes that may silently truncate data' },
  { id: 'MP046', name: 'require-concurrent-detach-partition', description: 'DETACH PARTITION without CONCURRENTLY locks the parent table' },
  { id: 'MP050', name: 'prefer-hnsw-over-ivfflat', description: 'pgvector: HNSW has better recall and no training requirement' },
  { id: 'MP052', name: 'warn-dependent-objects', description: 'DROP/ALTER COLUMN may break views, functions, or triggers' },
  { id: 'MP054', name: 'alter-type-add-value-in-transaction', description: 'New enum value is not visible until COMMIT' },
];

export default function MigrateFromAtlasPage() {
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
            <a href="/enterprise" className="hover:text-white transition-colors">Enterprise</a>
            <a href="https://github.com/mickelsamuel/migrationpilot" className="hover:text-white transition-colors">GitHub</a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-16 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm mb-6">
            Atlas moved linting to Pro-only in v0.38
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
            Switch from Atlas to MigrationPilot
          </h1>
          <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-8">
            All 7 Atlas PostgreSQL lint rules are covered by MigrationPilot — plus 73 more.
            Free and open-source. No paid tier required for linting.
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

      {/* Rule Mapping Table */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold mb-2">Rule-by-Rule Mapping</h2>
          <p className="text-slate-400 mb-8">
            Every Atlas PostgreSQL lint rule (PG301–PG307) has a direct equivalent in MigrationPilot.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-slate-800 rounded-lg overflow-hidden">
              <thead>
                <tr className="bg-slate-800/50">
                  <th className="text-left px-4 py-3 font-medium text-slate-300">Atlas Rule</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-300">MigrationPilot Rule</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-300">Auto-Fix</th>
                </tr>
              </thead>
              <tbody>
                {ruleMapping.map((r) => (
                  <tr key={r.atlasId} className="border-t border-slate-800/50 hover:bg-slate-800/30">
                    <td className="px-4 py-3">
                      <span className="font-mono text-slate-500">{r.atlasId}</span>{' '}
                      <span className="text-slate-300">{r.atlasName}</span>
                    </td>
                    <td className="px-4 py-3">
                      <a href={`/rules/${r.mpId.toLowerCase()}`} className="text-blue-400 hover:text-blue-300 font-mono">
                        {r.mpId}
                      </a>{' '}
                      <span className="text-slate-400">{r.mpName}</span>
                    </td>
                    <td className="px-4 py-3">
                      {r.autoFix ? (
                        <span className="text-green-400">Yes</span>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* What You Gain */}
      <section className="py-16 px-6 border-t border-slate-800/50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold mb-2">73 Rules Atlas Doesn&apos;t Have</h2>
          <p className="text-slate-400 mb-8">
            MigrationPilot catches issues that Atlas&apos;s 7 rules miss entirely. Here are some highlights:
          </p>
          <div className="grid md:grid-cols-2 gap-4">
            {uniqueRules.map((r) => (
              <a
                key={r.id}
                href={`/rules/${r.id.toLowerCase()}`}
                className="border border-slate-800 rounded-lg p-4 hover:border-slate-700 transition-colors group"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-blue-400 text-sm">{r.id}</span>
                  <span className="text-sm text-slate-500">{r.name}</span>
                </div>
                <p className="text-slate-400 text-sm">{r.description}</p>
              </a>
            ))}
          </div>
          <p className="text-slate-500 text-sm mt-4">
            Plus 59 more rules covering lock safety, data types, partitioning, pgvector indexes, and more.{' '}
            <a href="/" className="text-blue-400 hover:text-blue-300">See all 80 rules</a>.
          </p>
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
                  <th className="text-center px-4 py-3 font-medium text-slate-300">Atlas (Free)</th>
                  <th className="text-center px-4 py-3 font-medium text-slate-300">Atlas (Pro)</th>
                  <th className="text-center px-4 py-3 font-medium text-blue-400">MigrationPilot</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { feature: 'Migration linting', atlasFree: 'Removed in v0.38', atlasPro: '7 rules', mp: '80 rules (77 free)' },
                  { feature: 'Auto-fix', atlasFree: '—', atlasPro: '—', mp: '12 rules' },
                  { feature: 'GitHub Action', atlasFree: 'Limited', atlasPro: 'Yes', mp: 'Free' },
                  { feature: 'PR inline annotations', atlasFree: '—', atlasPro: 'Yes', mp: 'Free' },
                  { feature: 'SARIF output', atlasFree: '—', atlasPro: '—', mp: 'Free' },
                  { feature: 'Lock type analysis', atlasFree: '—', atlasPro: '—', mp: 'Free' },
                  { feature: 'MCP Server (AI tools)', atlasFree: '—', atlasPro: '—', mp: 'Free' },
                  { feature: 'Execution plan', atlasFree: '—', atlasPro: '—', mp: 'Free' },
                  { feature: 'Schema drift detection', atlasFree: '—', atlasPro: 'Yes', mp: 'Free' },
                  { feature: 'Air-gapped mode', atlasFree: '—', atlasPro: '—', mp: 'Free' },
                  { feature: 'Config presets', atlasFree: 'atlas.hcl', atlasPro: 'atlas.hcl', mp: 'YAML presets' },
                  { feature: 'Price', atlasFree: '$0', atlasPro: 'Custom', mp: '$0 (77 rules free)' },
                ].map((row) => (
                  <tr key={row.feature} className="border-t border-slate-800/50">
                    <td className="px-4 py-3 text-slate-300">{row.feature}</td>
                    <td className="px-4 py-3 text-center text-slate-500">{row.atlasFree}</td>
                    <td className="px-4 py-3 text-center text-slate-400">{row.atlasPro}</td>
                    <td className="px-4 py-3 text-center text-green-400 font-medium">{row.mp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Migration Steps */}
      <section className="py-16 px-6 border-t border-slate-800/50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold mb-8">Migrate in 2 Minutes</h2>
          <div className="space-y-6">
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-bold text-sm shrink-0">1</div>
              <div>
                <h3 className="font-semibold mb-1">Remove Atlas lint config</h3>
                <p className="text-slate-400 text-sm mb-2">
                  Delete the <code className="bg-slate-800 px-1.5 py-0.5 rounded text-slate-300">lint</code> block from your <code className="bg-slate-800 px-1.5 py-0.5 rounded text-slate-300">atlas.hcl</code> file.
                  Keep Atlas for schema management if you want — MigrationPilot only handles linting.
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-bold text-sm shrink-0">2</div>
              <div>
                <h3 className="font-semibold mb-1">Add MigrationPilot to CI</h3>
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
          path: migrations/`}
                </pre>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-bold text-sm shrink-0">3</div>
              <div>
                <h3 className="font-semibold mb-1">Optional: Configure rules</h3>
                <pre className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 text-sm overflow-x-auto mt-2">
{`# .migrationpilotrc.yml
extends: recommended
pgVersion: 16
exclude:
  - MP008  # Allow multi-DDL transactions`}
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
            Free migration linting shouldn&apos;t require a paid plan
          </h2>
          <p className="text-slate-400 mb-8">
            80 safety rules. 12 auto-fixes. GitHub Action with inline annotations.
            Open source, no signup, no paid tier for linting.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="https://github.com/mickelsamuel/migrationpilot"
              className="px-8 py-3 rounded-lg bg-blue-600 hover:bg-blue-500 font-medium transition-colors"
            >
              Get Started
            </a>
            <a
              href="/docs/quick-start"
              className="px-8 py-3 rounded-lg border border-slate-700 hover:border-slate-600 font-medium transition-colors"
            >
              Read the Docs
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
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
