import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Migrate from Squawk to MigrationPilot — 80 PostgreSQL Migration Rules',
  description: 'MigrationPilot covers all 31 Squawk rules plus 49 more including RLS safety, JSONB indexing, logical replication, and auto-fix. Free and open-source.',
  keywords: ['squawk alternative', 'squawk postgresql', 'postgresql migration linter', 'squawk migration linter alternative'],
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
  { squawk: 'setting-not-nullable-field', mpId: 'MP018', mpName: 'no-force-not-null', autoFix: false },
  { squawk: 'constraint-missing-not-valid', mpId: 'MP030', mpName: 'require-not-valid-check', autoFix: true },
  { squawk: 'ban-truncate-cascade', mpId: 'MP036', mpName: 'ban-truncate-cascade', autoFix: false },
  { squawk: 'require-timeout', mpId: 'MP004', mpName: 'require-lock-timeout', autoFix: true },
  { squawk: 'ban-concurrent-index-creation-in-transaction', mpId: 'MP025', mpName: 'ban-concurrent-in-transaction', autoFix: false },
];

const uniqueRules = [
  { id: 'MP055', name: 'drop-pk-replica-identity-break', desc: 'Dropping PK breaks logical replication (Supabase, Neon, RDS)' },
  { id: 'MP056', name: 'gin-index-jsonb', desc: 'Plain GIN index on JSONB is useless for ->> queries' },
  { id: 'MP057', name: 'rls-enabled-without-policy', desc: 'ENABLE RLS without policy silently blocks all access' },
  { id: 'MP058', name: 'multi-alter-table-same-table', desc: 'Multiple ALTER TABLE on same table = unnecessary lock cycles' },
  { id: 'MP059', name: 'sequence-not-reset', desc: 'Explicit ID inserts without setval = duplicate key errors' },
  { id: 'MP060', name: 'alter-type-rename-value', desc: 'RENAME VALUE breaks logical replication silently' },
  { id: 'MP052', name: 'warn-dependent-objects', desc: 'DROP/ALTER COLUMN may break views, functions, triggers' },
  { id: 'MP053', name: 'ban-uncommitted-transaction', desc: 'BEGIN without COMMIT leaves open transaction' },
  { id: 'MP054', name: 'alter-type-add-value-in-transaction', desc: 'New enum value not visible until COMMIT' },
  { id: 'MP006', name: 'no-vacuum-full', desc: 'VACUUM FULL locks entire table — use regular VACUUM' },
  { id: 'MP008', name: 'no-multi-ddl-transaction', desc: 'Multiple DDL in one transaction compounds lock duration' },
  { id: 'MP011', name: 'unbatched-backfill', desc: 'Large UPDATE without batching locks the entire table' },
  { id: 'MP044', name: 'no-data-loss-type-narrowing', desc: 'Type changes that silently truncate data' },
  { id: 'MP046', name: 'concurrent-detach-partition', desc: 'DETACH PARTITION without CONCURRENTLY locks parent' },
  { id: 'MP050', name: 'prefer-hnsw-over-ivfflat', desc: 'pgvector: HNSW has better recall without retraining' },
  { id: 'MP051', name: 'require-spatial-index', desc: 'PostGIS columns need GIST/SP-GIST index' },
];

export default function MigrateFromSquawkPage() {
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
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm mb-6">
            80 rules vs Squawk&apos;s 31
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
            MigrationPilot vs Squawk
          </h1>
          <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-8">
            MigrationPilot covers every Squawk rule plus 49 more — including RLS safety,
            JSONB indexing, logical replication, and 12 auto-fixes. Same CLI workflow, more coverage.
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

      {/* Comparison Table */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold mb-8">Feature Comparison</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-slate-800 rounded-lg overflow-hidden">
              <thead>
                <tr className="bg-slate-800/50">
                  <th className="text-left px-4 py-3 font-medium text-slate-300">Feature</th>
                  <th className="text-center px-4 py-3 font-medium text-slate-300">Squawk</th>
                  <th className="text-center px-4 py-3 font-medium text-blue-400">MigrationPilot</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { feature: 'Total rules', squawk: '31', mp: '80' },
                  { feature: 'Auto-fix', squawk: 'No', mp: '12 rules' },
                  { feature: 'GitHub Action', squawk: 'Yes', mp: 'Yes + inline annotations + Job Summary' },
                  { feature: 'Lock type analysis', squawk: 'No', mp: 'Yes (per-statement)' },
                  { feature: 'Risk scoring', squawk: 'No', mp: 'RED/YELLOW/GREEN' },
                  { feature: 'Execution plan', squawk: 'No', mp: 'Yes (visual timeline)' },
                  { feature: 'SARIF output', squawk: 'No', mp: 'Yes (GitHub Code Scanning)' },
                  { feature: 'MCP Server (AI)', squawk: 'No', mp: 'Yes (4 tools)' },
                  { feature: 'Schema drift detection', squawk: 'No', mp: 'Yes' },
                  { feature: 'Historical trends', squawk: 'No', mp: 'Yes' },
                  { feature: 'Config presets', squawk: 'No', mp: '5 built-in (recommended, strict, ci, startup, enterprise)' },
                  { feature: 'Framework detection', squawk: 'No', mp: '14 frameworks' },
                  { feature: 'PL/pgSQL function linting', squawk: 'No (issue #411)', mp: 'Planned' },
                  { feature: 'RLS safety', squawk: 'No', mp: 'Yes (MP057)' },
                  { feature: 'JSONB index analysis', squawk: 'No', mp: 'Yes (MP056)' },
                  { feature: 'Replication safety', squawk: 'No', mp: 'Yes (MP055, MP060)' },
                  { feature: 'Language', squawk: 'Rust', mp: 'TypeScript (Node.js)' },
                  { feature: 'License', squawk: 'GPL-3.0', mp: 'MIT' },
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
          <p className="text-slate-400 mb-8">Every Squawk rule has a direct MigrationPilot equivalent.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-slate-800 rounded-lg overflow-hidden">
              <thead>
                <tr className="bg-slate-800/50">
                  <th className="text-left px-4 py-3 font-medium text-slate-300">Squawk Rule</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-300">MigrationPilot</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-300">Auto-Fix</th>
                </tr>
              </thead>
              <tbody>
                {ruleMapping.map((r) => (
                  <tr key={r.squawk} className="border-t border-slate-800/50 hover:bg-slate-800/30">
                    <td className="px-4 py-3 text-slate-400 font-mono text-xs">{r.squawk}</td>
                    <td className="px-4 py-3">
                      <a href={`/rules/${r.mpId.toLowerCase()}`} className="text-blue-400 hover:text-blue-300 font-mono text-xs">
                        {r.mpId}
                      </a>{' '}
                      <span className="text-slate-400 text-xs">{r.mpName}</span>
                    </td>
                    <td className="px-4 py-3">
                      {r.autoFix ? (
                        <span className="text-green-400 text-xs">Yes</span>
                      ) : (
                        <span className="text-slate-500 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Unique Rules */}
      <section className="py-16 px-6 border-t border-slate-800/50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold mb-2">49 Rules Squawk Doesn&apos;t Have</h2>
          <p className="text-slate-400 mb-8">
            MigrationPilot catches issues that Squawk misses entirely — from RLS lockouts to logical replication breaks.
          </p>
          <div className="grid md:grid-cols-2 gap-3">
            {uniqueRules.map((r) => (
              <a
                key={r.id}
                href={`/rules/${r.id.toLowerCase()}`}
                className="border border-slate-800 rounded-lg p-3 hover:border-slate-700 transition-colors"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-blue-400 text-xs">{r.id}</span>
                  <span className="text-xs text-slate-500">{r.name}</span>
                </div>
                <p className="text-slate-400 text-xs">{r.desc}</p>
              </a>
            ))}
          </div>
          <p className="text-slate-500 text-sm mt-4">
            Plus 33 more unique rules.{' '}
            <a href="/" className="text-blue-400 hover:text-blue-300">See all 80 rules</a>.
          </p>
        </div>
      </section>

      {/* Migration Steps */}
      <section className="py-16 px-6 border-t border-slate-800/50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold mb-8">Migrate in 60 Seconds</h2>
          <div className="space-y-6">
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-bold text-sm shrink-0">1</div>
              <div>
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
              <div>
                <h3 className="font-semibold mb-1">Update CI</h3>
                <pre className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 text-sm overflow-x-auto mt-2">
{`# Replace squawk GitHub Action:
- uses: mickelsamuel/migrationpilot@v1
  with:
    path: migrations/`}
                </pre>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-bold text-sm shrink-0">3</div>
              <div>
                <h3 className="font-semibold mb-1">Optional: Enable auto-fix</h3>
                <pre className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 text-sm overflow-x-auto mt-2">
{`# Auto-fix 12 common issues
npx migrationpilot analyze migrations/ --fix --dry-run`}
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
            Twice the rules. Auto-fix. Same CLI workflow.
          </h2>
          <p className="text-slate-400 mb-8">
            80 safety rules. 12 auto-fixes. Lock analysis. Risk scoring.
            GitHub Action with inline annotations. MIT licensed.
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
