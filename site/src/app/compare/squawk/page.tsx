import type { Metadata } from 'next';
import Navbar from '@/components/navbar';

export const metadata: Metadata = {
  title: 'MigrationPilot vs Squawk — 83 PostgreSQL Migration Rules vs 31',
  description: 'MigrationPilot covers all 31 Squawk rules plus 52 more. Lock analysis, risk scoring, 12 auto-fixes, GitHub Action, VS Code extension.',
  keywords: [
    'squawk alternative',
    'squawk postgresql linter',
    'postgresql migration linter',
    'squawk vs migrationpilot',
    'squawk migration linter alternative',
    'database migration linter',
    'postgresql ddl linter',
  ],
  alternates: {
    canonical: '/compare/squawk',
  },
  openGraph: {
    title: 'MigrationPilot vs Squawk — 83 PostgreSQL Migration Rules vs 31',
    description: 'MigrationPilot covers all 31 Squawk rules plus 52 more. Lock analysis, risk scoring, 12 auto-fixes, and VS Code extension.',
    url: 'https://migrationpilot.dev/compare/squawk',
  },
};

const ruleMapping = [
  { squawk: 'require-concurrent-index-creation', mpId: 'MP001', mpName: 'require-concurrent-index', autoFix: true },
  { squawk: 'require-concurrent-index-deletion', mpId: 'MP009', mpName: 'require-drop-index-concurrently', autoFix: true },
  { squawk: 'adding-not-nullable-field', mpId: 'MP002', mpName: 'require-check-not-null', autoFix: false },
  { squawk: 'adding-field-with-default', mpId: 'MP003', mpName: 'volatile-default-rewrite', autoFix: false },
  { squawk: 'adding-foreign-key-constraint', mpId: 'MP005', mpName: 'require-not-valid-fk', autoFix: false },
  { squawk: 'ban-drop-column', mpId: 'MP017', mpName: 'no-drop-column', autoFix: false },
  { squawk: 'ban-drop-table', mpId: 'MP026', mpName: 'ban-drop-table', autoFix: false },
  { squawk: 'ban-drop-database', mpId: 'MP034', mpName: 'ban-drop-database', autoFix: false },
  { squawk: 'ban-drop-not-null', mpId: 'MP029', mpName: 'ban-drop-not-null', autoFix: false },
  { squawk: 'changing-column-type', mpId: 'MP007', mpName: 'no-column-type-change', autoFix: false },
  { squawk: 'renaming-column', mpId: 'MP010', mpName: 'no-rename-column', autoFix: false },
  { squawk: 'renaming-table', mpId: 'MP028', mpName: 'no-rename-table', autoFix: false },
  { squawk: 'disallowed-unique-constraint', mpId: 'MP027', mpName: 'disallowed-unique-constraint', autoFix: false },
  { squawk: 'prefer-text-field', mpId: 'MP037', mpName: 'prefer-text-over-varchar', autoFix: true },
  { squawk: 'prefer-bigint-over-int', mpId: 'MP038', mpName: 'prefer-bigint-over-int', autoFix: false },
  { squawk: 'prefer-bigint-over-smallint', mpId: 'MP038', mpName: 'prefer-bigint-over-int', autoFix: false },
  { squawk: 'prefer-identity', mpId: 'MP039', mpName: 'prefer-identity-over-serial', autoFix: false },
  { squawk: 'prefer-timestamptz', mpId: 'MP040', mpName: 'prefer-timestamptz', autoFix: true },
  { squawk: 'ban-char-field', mpId: 'MP041', mpName: 'ban-char-field', autoFix: true },
  { squawk: 'adding-serial-primary-key-field', mpId: 'MP015', mpName: 'no-add-column-serial', autoFix: false },
  { squawk: 'setting-not-nullable-field', mpId: 'MP018', mpName: 'no-force-set-not-null', autoFix: false },
  { squawk: 'constraint-missing-not-valid', mpId: 'MP030', mpName: 'require-not-valid-check', autoFix: true },
  { squawk: 'ban-truncate-cascade', mpId: 'MP036', mpName: 'ban-truncate-cascade', autoFix: false },
  { squawk: 'require-timeout', mpId: 'MP004', mpName: 'require-lock-timeout', autoFix: true },
  { squawk: 'ban-concurrent-index-creation-in-transaction', mpId: 'MP025', mpName: 'ban-concurrent-in-transaction', autoFix: false },
];

const uniqueRuleHighlights = [
  { id: 'MP006', name: 'no-vacuum-full', desc: 'VACUUM FULL locks the entire table exclusively' },
  { id: 'MP008', name: 'no-multi-ddl-transaction', desc: 'Multiple DDL in one transaction compounds lock duration' },
  { id: 'MP011', name: 'unbatched-backfill', desc: 'Large UPDATE without WHERE clause locks the table' },
  { id: 'MP020', name: 'require-statement-timeout', desc: 'Long-running DDL needs a statement timeout' },
  { id: 'MP046', name: 'concurrent-detach-partition', desc: 'DETACH PARTITION without CONCURRENTLY locks the parent' },
  { id: 'MP055', name: 'drop-pk-replica-identity', desc: 'Dropping PK breaks logical replication (Supabase, Neon, RDS)' },
  { id: 'MP056', name: 'gin-index-jsonb', desc: 'Plain GIN index on JSONB is useless for ->> queries' },
  { id: 'MP057', name: 'rls-without-policy', desc: 'ENABLE RLS without a policy silently blocks all access' },
  { id: 'MP064', name: 'ban-disable-trigger', desc: 'DISABLE TRIGGER breaks replication and audit logs' },
  { id: 'MP069', name: 'warn-fk-lock-both-tables', desc: 'FK creation locks both parent and child tables' },
  { id: 'MP074', name: 'require-deferrable-fk', desc: 'FK without DEFERRABLE can cause lock contention' },
  { id: 'MP077', name: 'prefer-lz4-toast-compression', desc: 'LZ4 is faster than PGLZ for TOAST compression' },
  { id: 'MP080', name: 'ban-data-in-migration', desc: 'Data changes mixed into schema migration files' },
];

export default function CompareSquawkPage() {
  return (
    <main className="min-h-screen">
      <Navbar />

      {/* Hero */}
      <section className="pt-32 pb-16 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <img
            src="/charts/rules-comparison.png"
            alt="PostgreSQL migration linter rules comparison: MigrationPilot 83 rules vs Squawk 31 rules"
            className="mx-auto mb-8 rounded-lg border border-slate-800 max-w-lg w-full"
            width={700}
            height={400}
          />
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm mb-6">
            83 rules vs 31
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
            MigrationPilot vs Squawk
            <span className="block text-2xl md:text-3xl text-slate-400 font-normal mt-3">
              More Rules, Auto-Fix, Same CLI Workflow
            </span>
          </h1>
          <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-8">
            Both MigrationPilot and Squawk are PostgreSQL migration linters. MigrationPilot covers every Squawk rule
            plus 52 more, adds lock analysis, risk scoring, 12 auto-fixes, and a VS Code extension. Same
            workflow, more coverage.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="https://github.com/mickelsamuel/migrationpilot"
              className="px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-500 font-medium transition-colors"
            >
              Get Started Free
            </a>
            <a
              href="/migrate-from-squawk"
              className="px-6 py-3 rounded-lg border border-slate-700 hover:border-slate-600 font-medium transition-colors"
            >
              Migration Guide
            </a>
          </div>
        </div>
      </section>

      {/* Feature Comparison Table */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold mb-8">Feature Comparison</h2>
          <div className="overflow-x-auto">
            <table className="text-sm border border-slate-800 rounded-lg overflow-hidden">
              <thead>
                <tr className="bg-slate-800/50">
                  <th className="text-left px-4 py-3 font-medium text-slate-300">Capability</th>
                  <th className="text-center px-4 py-3 font-medium text-slate-300">Squawk</th>
                  <th className="text-center px-4 py-3 font-medium text-blue-400">MigrationPilot</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { feature: 'Total safety rules', squawk: '31', mp: '83 (80 free)' },
                  { feature: 'Auto-fix', squawk: 'No', mp: '12 rules (--fix)' },
                  { feature: 'Lock type analysis', squawk: 'No', mp: 'Per-statement (SHARE through ACCESS EXCLUSIVE)' },
                  { feature: 'Risk scoring', squawk: 'No', mp: 'RED / YELLOW / GREEN (0-100)' },
                  { feature: 'GitHub Action', squawk: 'Yes', mp: 'Yes + inline annotations + Job Summary' },
                  { feature: 'VS Code extension', squawk: 'No', mp: 'Yes (diagnostics, hover, quick-fix)' },
                  { feature: 'Execution plan', squawk: 'No', mp: 'Yes (visual timeline with lock types)' },
                  { feature: 'SARIF output', squawk: 'No', mp: 'Yes (GitHub Code Scanning)' },
                  { feature: 'MCP Server', squawk: 'No', mp: 'Yes (4 tools for AI integration)' },
                  { feature: 'Schema drift detection', squawk: 'No', mp: 'Yes' },
                  { feature: 'Historical trends', squawk: 'No', mp: 'Yes (JSONL + trends command)' },
                  { feature: 'Config presets', squawk: 'No', mp: '5 built-in (recommended, strict, ci, startup, enterprise)' },
                  { feature: 'Framework detection', squawk: 'No', mp: '14 frameworks auto-detected' },
                  { feature: 'Watch mode', squawk: 'No', mp: 'Yes (file watcher + pre-commit hooks)' },
                  { feature: 'Production context', squawk: 'No', mp: 'Table sizes, query frequency (Pro)' },
                  { feature: 'Rollback DDL generation', squawk: 'No', mp: 'Yes' },
                  { feature: 'RLS safety rules', squawk: 'No', mp: 'Yes (MP057, MP079)' },
                  { feature: 'JSONB index analysis', squawk: 'No', mp: 'Yes (MP056)' },
                  { feature: 'Replication safety', squawk: 'No', mp: 'Yes (MP055, MP060, MP064)' },
                  { feature: 'Partition rules', squawk: 'No', mp: 'Yes (MP046, MP049, MP072)' },
                  { feature: 'pgvector index advice', squawk: 'No', mp: 'Yes (MP050)' },
                  { feature: 'Language', squawk: 'Rust', mp: 'TypeScript (Node.js)' },
                  { feature: 'Parser', squawk: 'pg-query-rs', mp: 'libpg-query (WASM)' },
                  { feature: 'License', squawk: 'GPL-3.0', mp: 'MIT' },
                  { feature: 'Price', squawk: 'Free', mp: 'Free (77 rules) / $19/mo Pro' },
                ].map((row) => (
                  <tr key={row.feature} className="border-t border-slate-800/50">
                    <td className="px-4 py-3 text-slate-300">{row.feature}</td>
                    <td className="px-4 py-3 text-center text-slate-500">{row.squawk}</td>
                    <td className="px-4 py-3 text-center text-green-400 font-medium">{row.mp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Rule Mapping */}
      <section className="py-16 px-6 border-t border-slate-800/50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold mb-2">Rule-by-Rule Coverage</h2>
          <p className="text-slate-400 mb-8">Every Squawk rule has a direct MigrationPilot equivalent. Seven of them are auto-fixable.</p>
          <div className="overflow-x-auto">
            <table className="text-sm border border-slate-800 rounded-lg overflow-hidden">
              <thead>
                <tr className="bg-slate-800/50">
                  <th className="text-left px-4 py-3 font-medium text-slate-300">Squawk Rule</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-300">MigrationPilot</th>
                  <th className="text-center px-4 py-3 font-medium text-slate-300">Auto-Fix</th>
                </tr>
              </thead>
              <tbody>
                {ruleMapping.map((r, i) => (
                  <tr key={`${r.squawk}-${i}`} className="border-t border-slate-800/50 hover:bg-slate-800/30">
                    <td className="px-4 py-3 text-slate-400 font-mono text-xs">{r.squawk}</td>
                    <td className="px-4 py-3">
                      <a href={`/rules/${r.mpId.toLowerCase()}`} className="text-blue-400 hover:text-blue-300 font-mono text-xs">
                        {r.mpId}
                      </a>{' '}
                      <span className="text-slate-400 text-xs">{r.mpName}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {r.autoFix ? (
                        <span className="text-green-400 text-xs">Yes</span>
                      ) : (
                        <span className="text-slate-500 text-xs">&mdash;</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* 49 Unique Rules */}
      <section className="py-16 px-6 border-t border-slate-800/50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold mb-2">49 Rules Squawk Does Not Have</h2>
          <p className="text-slate-400 mb-8">
            MigrationPilot catches issues that Squawk misses &mdash; from RLS lockouts to logical replication breaks
            to pgvector index advice. Here are some highlights:
          </p>
          <div className="grid md:grid-cols-2 gap-3">
            {uniqueRuleHighlights.map((r) => (
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
            Plus 36 more unique rules.{' '}
            <a href="/" className="text-blue-400 hover:text-blue-300">See all 83 rules</a>.
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
                title: '2.5x More Rules',
                description: 'MigrationPilot has 83 safety rules compared to Squawk\'s 31. Coverage includes RLS, JSONB, logical replication, partitioning, pgvector, TOAST compression, and more.',
              },
              {
                title: 'Auto-Fix',
                description: '12 rules can be automatically fixed with --fix. Missing CONCURRENTLY, lock_timeout, statement_timeout, NOT VALID, IF NOT EXISTS, VARCHAR-to-TEXT, TIMESTAMP-to-TIMESTAMPTZ, and more. Squawk only reports; MigrationPilot can fix.',
              },
              {
                title: 'Lock Type Analysis',
                description: 'Every DDL statement output includes the PostgreSQL lock it acquires (SHARE, SHARE UPDATE EXCLUSIVE, ACCESS EXCLUSIVE) and whether it blocks reads, writes, or both. Squawk does not analyze locks.',
              },
              {
                title: 'Risk Scoring',
                description: 'RED / YELLOW / GREEN risk scores (0-100) based on lock severity, statement type, and table impact. Pro adds production context with actual table sizes and query frequency.',
              },
              {
                title: 'VS Code Extension',
                description: 'Real-time diagnostics, hover tooltips with lock info, and quick-fix actions directly in your editor. Squawk does not have an editor extension.',
              },
              {
                title: 'MIT License',
                description: 'MigrationPilot uses the MIT license, which is more permissive than Squawk\'s GPL-3.0. MIT allows use in proprietary projects without copyleft obligations.',
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
              <h3 className="text-lg font-semibold mb-4">Squawk may be a better fit if...</h3>
              <ul className="space-y-3 text-sm text-slate-400">
                <li className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  You prefer a Rust binary with zero runtime dependencies
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  You only need the 31 core rules it covers
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  You need GPL-3.0 copyleft licensing
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  You want the fastest possible binary execution time
                </li>
              </ul>
            </div>
            <div className="border border-blue-500/30 rounded-xl p-6 bg-blue-500/5">
              <h3 className="text-lg font-semibold mb-4 text-blue-400">MigrationPilot is a better fit if...</h3>
              <ul className="space-y-3 text-sm text-slate-300">
                <li className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  You want the most comprehensive PostgreSQL rule set (83 rules)
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  You need auto-fix to automatically remediate issues
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  You want lock analysis and risk scoring per statement
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  You need a VS Code extension for real-time feedback
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  You need RLS, JSONB, replication, or partitioning rules
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  You want production context analysis with actual table sizes (Pro)
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  You need MIT licensing for proprietary projects
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Quick Migration */}
      <section className="py-16 px-6 border-t border-slate-800/50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold mb-8">Switch in 60 Seconds</h2>
          <div className="space-y-6">
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-bold text-sm shrink-0">1</div>
              <div className="min-w-0">
                <h3 className="font-semibold mb-1">Replace the CLI</h3>
                <pre className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 text-sm overflow-x-auto mt-2">
{`# Remove Squawk
# npm uninstall squawk-cli  (or cargo uninstall squawk)

# Use MigrationPilot
npx migrationpilot analyze migrations/`}
                </pre>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-bold text-sm shrink-0">2</div>
              <div className="min-w-0">
                <h3 className="font-semibold mb-1">Update your CI</h3>
                <pre className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 text-sm overflow-x-auto mt-2">
{`# Replace your Squawk GitHub Action:
- uses: mickelsamuel/migrationpilot@v1
  with:
    path: migrations/
    fail-on: critical`}
                </pre>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-bold text-sm shrink-0">3</div>
              <div className="min-w-0">
                <h3 className="font-semibold mb-1">Enable auto-fix</h3>
                <pre className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 text-sm overflow-x-auto mt-2">
{`# Preview fixes without modifying files
npx migrationpilot analyze migrations/ --fix --dry-run

# Apply fixes in-place
npx migrationpilot analyze migrations/ --fix`}
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
            All of Squawk&apos;s rules. Plus 52 more. Auto-fix included.
          </h2>
          <p className="text-slate-400 mb-8">
            83 safety rules. 12 auto-fixes. Lock analysis. Risk scoring.
            VS Code extension. GitHub Action with inline annotations.
            Same CLI workflow, more comprehensive coverage.
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
