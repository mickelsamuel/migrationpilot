import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'MigrationPilot vs Atlas — Free PostgreSQL Migration Linting with 80 Rules',
  description: 'Atlas moved migration linting behind a paid plan. MigrationPilot offers 80 free safety rules, lock analysis, auto-fix, and GitHub Action. Open-source, no paid tier required.',
  keywords: [
    'atlas alternative',
    'atlas migrate lint alternative',
    'postgresql migration linter',
    'atlas vs migrationpilot',
    'atlas pro alternative',
    'free migration linter',
    'ariga atlas alternative',
  ],
  alternates: {
    canonical: '/compare/atlas',
  },
  openGraph: {
    title: 'MigrationPilot vs Atlas — Free PostgreSQL Migration Linting with 80 Rules',
    description: 'Atlas moved migration linting behind a paid plan. MigrationPilot offers 80 free safety rules, lock analysis, auto-fix, and GitHub Action.',
    url: 'https://migrationpilot.dev/compare/atlas',
  },
};

const atlasRules = [
  { atlasId: 'PG301', atlasDesc: 'Non-concurrent index creation', mpId: 'MP001', mpName: 'require-concurrent-index', autoFix: true },
  { atlasId: 'PG302', atlasDesc: 'NOT NULL column without default', mpId: 'MP002', mpName: 'require-check-not-null', autoFix: false },
  { atlasId: 'PG303', atlasDesc: 'Column with volatile default', mpId: 'MP003', mpName: 'volatile-default-rewrite', autoFix: false },
  { atlasId: 'PG304', atlasDesc: 'FK without NOT VALID', mpId: 'MP005', mpName: 'require-not-valid-fk', autoFix: false },
  { atlasId: 'PG305', atlasDesc: 'CHECK without NOT VALID', mpId: 'MP030', mpName: 'require-not-valid-check', autoFix: true },
  { atlasId: 'PG306', atlasDesc: 'Non-concurrent index drop', mpId: 'MP009', mpName: 'require-drop-index-concurrently', autoFix: true },
  { atlasId: 'PG307', atlasDesc: 'Column type change', mpId: 'MP007', mpName: 'no-column-type-change', autoFix: false },
];

const uniqueHighlights = [
  { id: 'MP004', name: 'require-lock-timeout', desc: 'Require SET lock_timeout before any DDL' },
  { id: 'MP008', name: 'no-multi-ddl-transaction', desc: 'Multiple DDL in one transaction compounds lock duration' },
  { id: 'MP025', name: 'ban-concurrent-in-transaction', desc: 'CONCURRENTLY inside a transaction causes a runtime error' },
  { id: 'MP027', name: 'disallowed-unique-constraint', desc: 'UNIQUE constraint without USING INDEX scans full table under ACCESS EXCLUSIVE' },
  { id: 'MP046', name: 'concurrent-detach-partition', desc: 'DETACH PARTITION without CONCURRENTLY locks the parent table' },
  { id: 'MP055', name: 'drop-pk-replica-identity', desc: 'Dropping PK breaks logical replication (Supabase, Neon, RDS)' },
  { id: 'MP056', name: 'gin-index-jsonb', desc: 'Missing GIN index for JSONB column queries' },
  { id: 'MP057', name: 'rls-without-policy', desc: 'ENABLE RLS without policy silently blocks all access' },
  { id: 'MP064', name: 'ban-disable-trigger', desc: 'DISABLE TRIGGER breaks replication and audit logs' },
  { id: 'MP069', name: 'warn-fk-lock-both-tables', desc: 'FK creation locks both parent and child tables' },
  { id: 'MP074', name: 'require-deferrable-fk', desc: 'FK without DEFERRABLE can cause lock contention during bulk operations' },
  { id: 'MP080', name: 'ban-data-in-migration', desc: 'Data changes mixed into schema migration files' },
];

export default function CompareAtlasPage() {
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
            <a href="/#pricing" className="hover:text-white transition-colors">Pricing</a>
            <a href="/enterprise" className="hover:text-white transition-colors">Enterprise</a>
            <a href="https://github.com/mickelsamuel/migrationpilot" className="hover:text-white transition-colors">GitHub</a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-16 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm mb-6">
            80 free rules vs 7 paid rules
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
            MigrationPilot vs Atlas
            <span className="block text-2xl md:text-3xl text-slate-400 font-normal mt-3">
              Free, Open-Source Migration Linting
            </span>
          </h1>
          <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-8">
            Atlas (by Ariga) is a schema management tool with 7 PostgreSQL lint rules in its paid tier.
            MigrationPilot is a dedicated migration linter with 80 rules &mdash; 77 of them free.
            It works alongside Atlas or any other migration tool.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="https://github.com/mickelsamuel/migrationpilot"
              className="px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-500 font-medium transition-colors"
            >
              Get Started Free
            </a>
            <a
              href="/migrate-from-atlas"
              className="px-6 py-3 rounded-lg border border-slate-700 hover:border-slate-600 font-medium transition-colors"
            >
              Migration Guide
            </a>
          </div>
        </div>
      </section>

      {/* Rule Mapping */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold mb-2">Rule-by-Rule Coverage</h2>
          <p className="text-slate-400 mb-8">
            Every Atlas PostgreSQL lint rule (PG301-PG307) has a direct MigrationPilot equivalent &mdash;
            with 3 of them auto-fixable.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-slate-800 rounded-lg overflow-hidden">
              <thead>
                <tr className="bg-slate-800/50">
                  <th className="text-left px-4 py-3 font-medium text-slate-300">Atlas Rule</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-300">MigrationPilot Equivalent</th>
                  <th className="text-center px-4 py-3 font-medium text-slate-300">Auto-Fix</th>
                </tr>
              </thead>
              <tbody>
                {atlasRules.map((r) => (
                  <tr key={r.atlasId} className="border-t border-slate-800/50 hover:bg-slate-800/30">
                    <td className="px-4 py-3">
                      <span className="font-mono text-slate-500">{r.atlasId}</span>{' '}
                      <span className="text-slate-300">{r.atlasDesc}</span>
                    </td>
                    <td className="px-4 py-3">
                      <a href={`/rules/${r.mpId.toLowerCase()}`} className="text-blue-400 hover:text-blue-300 font-mono">
                        {r.mpId}
                      </a>{' '}
                      <span className="text-slate-400">{r.mpName}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {r.autoFix ? (
                        <span className="text-green-400">Yes</span>
                      ) : (
                        <span className="text-slate-500">&mdash;</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Feature Comparison Table */}
      <section className="py-16 px-6 border-t border-slate-800/50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold mb-8">Feature Comparison</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-slate-800 rounded-lg overflow-hidden">
              <thead>
                <tr className="bg-slate-800/50">
                  <th className="text-left px-4 py-3 font-medium text-slate-300">Capability</th>
                  <th className="text-center px-4 py-3 font-medium text-slate-300">Atlas (Free)</th>
                  <th className="text-center px-4 py-3 font-medium text-slate-300">Atlas (Pro/Cloud)</th>
                  <th className="text-center px-4 py-3 font-medium text-blue-400">MigrationPilot</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { feature: 'Migration linting', atlasFree: 'Removed in v0.38', atlasPro: '7 PG rules', mp: '80 rules (77 free)' },
                  { feature: 'Lock type analysis', atlasFree: 'No', atlasPro: 'No', mp: 'Per-statement' },
                  { feature: 'Risk scoring', atlasFree: 'No', atlasPro: 'No', mp: 'RED / YELLOW / GREEN (0-100)' },
                  { feature: 'Auto-fix', atlasFree: 'No', atlasPro: 'No', mp: '12 rules' },
                  { feature: 'Safe alternative SQL', atlasFree: 'No', atlasPro: 'No', mp: 'Per violation' },
                  { feature: 'Declarative schema', atlasFree: 'Yes (HCL)', atlasPro: 'Yes (HCL)', mp: 'No (lint-only)' },
                  { feature: 'Schema versioning', atlasFree: 'Yes', atlasPro: 'Yes', mp: 'No (works with any)' },
                  { feature: 'GitHub Action', atlasFree: 'Limited', atlasPro: 'Yes', mp: 'Free (PR comments + annotations)' },
                  { feature: 'VS Code extension', atlasFree: 'HCL support', atlasPro: 'HCL support', mp: 'SQL safety diagnostics' },
                  { feature: 'SARIF output', atlasFree: 'No', atlasPro: 'No', mp: 'Yes (Code Scanning)' },
                  { feature: 'Schema drift detection', atlasFree: 'Yes', atlasPro: 'Yes', mp: 'Yes' },
                  { feature: 'Multi-database', atlasFree: 'PG, MySQL, SQLite, etc.', atlasPro: 'PG, MySQL, SQLite, etc.', mp: 'PostgreSQL only' },
                  { feature: 'Config presets', atlasFree: 'atlas.hcl', atlasPro: 'atlas.hcl', mp: '5 built-in YAML presets' },
                  { feature: 'Framework detection', atlasFree: 'Atlas only', atlasPro: 'Atlas only', mp: '14 frameworks' },
                  { feature: 'Production context', atlasFree: 'No', atlasPro: 'Cloud-based', mp: 'Direct DB queries (Pro)' },
                  { feature: 'Air-gapped mode', atlasFree: 'No', atlasPro: 'No (requires cloud)', mp: 'Yes (--offline)' },
                  { feature: 'Price', atlasFree: 'Free', atlasPro: 'Custom', mp: 'Free (77 rules) / $19/mo Pro' },
                  { feature: 'License', atlasFree: 'Apache 2.0', atlasPro: 'Commercial', mp: 'MIT' },
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

      {/* 73 Unique Rules */}
      <section className="py-16 px-6 border-t border-slate-800/50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold mb-2">73 Rules Atlas Does Not Have</h2>
          <p className="text-slate-400 mb-8">
            MigrationPilot catches issues that Atlas&apos;s 7 rules miss. Here are some highlights:
          </p>
          <div className="grid md:grid-cols-2 gap-3">
            {uniqueHighlights.map((r) => (
              <a
                key={r.id}
                href={`/rules/${r.id.toLowerCase()}`}
                className="border border-slate-800 rounded-lg p-4 hover:border-slate-700 transition-colors group"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-blue-400 text-sm">{r.id}</span>
                  <span className="text-sm text-slate-500">{r.name}</span>
                </div>
                <p className="text-slate-400 text-sm">{r.desc}</p>
              </a>
            ))}
          </div>
          <p className="text-slate-500 text-sm mt-4">
            Plus 61 more rules covering data safety, type best practices, partitioning, pgvector, and more.{' '}
            <a href="/" className="text-blue-400 hover:text-blue-300">See all 80 rules</a>.
          </p>
        </div>
      </section>

      {/* Key Differentiators */}
      <section className="py-16 px-6 border-t border-slate-800/50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold mb-8">Key Differentiators</h2>
          <div className="grid md:grid-cols-2 gap-6">
            {[
              {
                title: 'Free Migration Linting',
                description: 'Atlas moved migration linting behind a paid plan in v0.38. MigrationPilot gives you 77 rules for free under an MIT license. No cloud account required.',
              },
              {
                title: '10x More Rules',
                description: 'Atlas has 7 PostgreSQL lint rules. MigrationPilot has 80 covering lock safety, data types, partitioning, RLS, JSONB indexing, logical replication, and more.',
              },
              {
                title: 'Lock-Level Analysis',
                description: 'MigrationPilot tells you exactly which PostgreSQL lock each DDL statement acquires (SHARE, SHARE UPDATE EXCLUSIVE, ACCESS EXCLUSIVE) and whether it blocks reads or writes.',
              },
              {
                title: 'Auto-Fix',
                description: '12 rules can be automatically fixed with --fix. Missing CONCURRENTLY, lock_timeout, statement_timeout, NOT VALID, IF NOT EXISTS, and more. Atlas does not offer auto-fix.',
              },
              {
                title: 'Works Without Cloud',
                description: 'Atlas Pro requires an Ariga Cloud account. MigrationPilot runs entirely locally or in your own CI. The --offline flag ensures zero external calls.',
              },
              {
                title: 'Framework Agnostic',
                description: 'MigrationPilot works with any migration tool: Atlas, Flyway, Liquibase, Prisma, Django, Rails, Alembic, and 7 more. Auto-detect with npx migrationpilot detect.',
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
              <h3 className="text-lg font-semibold mb-4">Use Atlas when you need to...</h3>
              <ul className="space-y-3 text-sm text-slate-400">
                <li className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Define schemas declaratively with HCL
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Auto-generate migration files from schema diffs
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Manage schemas across multiple database engines
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Use cloud-hosted schema management (Ariga Cloud)
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Apply versioned migrations with built-in execution
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
                  Comprehensive PostgreSQL migration safety analysis
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Free linting without a cloud account or paid plan
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Auto-fix dangerous DDL patterns automatically
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Run entirely locally or air-gapped (no cloud dependency)
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Lint migrations from any framework, not just Atlas
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-8 border border-slate-800 rounded-xl p-6 bg-slate-900/30">
            <h3 className="font-semibold mb-2">Use both together</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              If you use Atlas for schema management, you can add MigrationPilot as a lint step in your CI pipeline.
              Atlas generates the migration SQL, MigrationPilot reviews it for safety.
              Keep Atlas for declarative schema management and execution. Add MigrationPilot for deep PostgreSQL safety analysis.
            </p>
          </div>
        </div>
      </section>

      {/* Quick Start */}
      <section className="py-16 px-6 border-t border-slate-800/50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold mb-8">Get Started in 30 Seconds</h2>
          <div className="space-y-6">
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-bold text-sm shrink-0">1</div>
              <div>
                <h3 className="font-semibold mb-1">Lint your Atlas migrations</h3>
                <pre className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 text-sm overflow-x-auto mt-2">
{`# Analyze migration files generated by Atlas
npx migrationpilot analyze migrations/*.sql`}
                </pre>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-bold text-sm shrink-0">2</div>
              <div>
                <h3 className="font-semibold mb-1">Add to GitHub Actions</h3>
                <pre className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 text-sm overflow-x-auto mt-2">
{`- uses: mickelsamuel/migrationpilot@v1
  with:
    path: migrations/
    fail-on: critical`}
                </pre>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-bold text-sm shrink-0">3</div>
              <div>
                <h3 className="font-semibold mb-1">Auto-fix common issues</h3>
                <pre className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 text-sm overflow-x-auto mt-2">
{`npx migrationpilot analyze migrations/ --fix --dry-run`}
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
            80 rules. Free and open-source. No cloud required.
          </h2>
          <p className="text-slate-400 mb-8">
            Migration linting should not require a paid plan. MigrationPilot gives you 77 safety rules
            for free, 12 auto-fixes, lock analysis, and risk scoring. MIT licensed.
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
