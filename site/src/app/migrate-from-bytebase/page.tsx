import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'MigrationPilot vs Bytebase — CLI-First PostgreSQL Migration Safety',
  description: 'Bytebase is a database DevOps platform with a web UI. MigrationPilot is a focused CLI/GitHub Action with 80 safety rules and deeper static analysis. No deployment needed.',
  keywords: ['bytebase alternative', 'bytebase postgresql', 'bytebase migration linter', 'bytebase vs migrationpilot', 'postgresql migration safety', 'database devops'],
};

export default function MigrateFromBytebasePage() {
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
            Deeper safety analysis, no deployment required
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
            MigrationPilot vs Bytebase
          </h1>
          <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-8">
            Bytebase is a full database DevOps platform with a web UI. MigrationPilot is a focused CLI and GitHub Action with 80 safety rules and deeper PostgreSQL-specific static analysis.
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

      {/* Approach Comparison */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold mb-8">Two Different Approaches</h2>
          <div className="grid md:grid-cols-2 gap-6 mb-12">
            <div className="border border-slate-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold mb-3 text-slate-300">Bytebase</h3>
              <p className="text-slate-400 text-sm mb-4">Database DevOps platform</p>
              <ul className="space-y-2 text-sm text-slate-400">
                <li className="flex items-start gap-2">
                  <span className="text-slate-500 mt-0.5">-</span>
                  Web UI for schema review, change approval, and execution
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-slate-500 mt-0.5">-</span>
                  Requires self-hosted deployment (Docker/Kubernetes)
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-slate-500 mt-0.5">-</span>
                  Multi-database: PostgreSQL, MySQL, TiDB, Snowflake, etc.
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-slate-500 mt-0.5">-</span>
                  Schema review with basic SQL checks
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-400 mt-0.5">-</span>
                  <span className="text-red-400">Fewer PostgreSQL-specific rules than MigrationPilot</span>
                </li>
              </ul>
            </div>
            <div className="border border-blue-500/30 rounded-xl p-6 bg-blue-500/5">
              <h3 className="text-lg font-semibold mb-3 text-blue-400">MigrationPilot</h3>
              <p className="text-slate-400 text-sm mb-4">Focused PostgreSQL safety linter</p>
              <ul className="space-y-2 text-sm text-slate-400">
                <li className="flex items-start gap-2">
                  <span className="text-green-400 mt-0.5">+</span>
                  <span className="text-green-400">CLI + GitHub Action — no web UI to deploy or manage</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-400 mt-0.5">+</span>
                  <span className="text-green-400">npx one-liner — zero infrastructure needed</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-400 mt-0.5">+</span>
                  <span className="text-green-400">80 PostgreSQL-specific rules (deeper analysis)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-400 mt-0.5">+</span>
                  <span className="text-green-400">Lock type analysis, risk scoring, auto-fix</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-400 mt-0.5">+</span>
                  <span className="text-green-400">SARIF output for GitHub Code Scanning</span>
                </li>
              </ul>
            </div>
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
                  <th className="text-center px-4 py-3 font-medium text-slate-300">Bytebase (Free)</th>
                  <th className="text-center px-4 py-3 font-medium text-slate-300">Bytebase (Pro)</th>
                  <th className="text-center px-4 py-3 font-medium text-blue-400">MigrationPilot</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { feature: 'PostgreSQL safety rules', bb: '~20 rules', bbPro: '~30 rules', mp: '80 rules' },
                  { feature: 'Lock type analysis', bb: 'Basic', bbPro: 'Basic', mp: 'Detailed (per-statement)' },
                  { feature: 'Risk scoring', bb: 'Warning/Error', bbPro: 'Warning/Error', mp: 'RED/YELLOW/GREEN (0-100)' },
                  { feature: 'Auto-fix', bb: 'No', bbPro: 'No', mp: '12 rules' },
                  { feature: 'Safe alternatives', bb: 'No', bbPro: 'No', mp: 'Yes (code suggestions)' },
                  { feature: 'Deployment model', bb: 'Self-hosted (Docker)', bbPro: 'Self-hosted + Cloud', mp: 'npx / CI (zero infra)' },
                  { feature: 'Setup time', bb: '30+ minutes', bbPro: '30+ minutes', mp: '30 seconds' },
                  { feature: 'GitHub Action', bb: 'Via API', bbPro: 'Via API', mp: 'Native + inline annotations' },
                  { feature: 'SARIF output', bb: 'No', bbPro: 'No', mp: 'Yes (Code Scanning)' },
                  { feature: 'Execution plan', bb: 'No', bbPro: 'No', mp: 'Yes (visual timeline)' },
                  { feature: 'MCP Server (AI)', bb: 'No', bbPro: 'No', mp: 'Yes (4 tools)' },
                  { feature: 'RLS safety', bb: 'No', bbPro: 'No', mp: 'Yes (MP057)' },
                  { feature: 'JSONB index analysis', bb: 'No', bbPro: 'No', mp: 'Yes (MP056)' },
                  { feature: 'Replication safety', bb: 'Basic', bbPro: 'Basic', mp: 'Yes (MP055, MP060)' },
                  { feature: 'pgvector index advice', bb: 'No', bbPro: 'No', mp: 'Yes (MP050)' },
                  { feature: 'PostGIS index advice', bb: 'No', bbPro: 'No', mp: 'Yes (MP051)' },
                  { feature: 'Change approval workflow', bb: 'Yes', bbPro: 'Yes', mp: 'GitHub PR reviews' },
                  { feature: 'Schema version control', bb: 'Yes', bbPro: 'Yes', mp: 'Git-native' },
                  { feature: 'Multi-database', bb: 'Yes (10+ DBs)', bbPro: 'Yes (10+ DBs)', mp: 'PostgreSQL focused' },
                  { feature: 'Price', bb: 'Free (limited)', bbPro: 'From $74/user/mo', mp: '$0 (77 rules free)' },
                ].map((row) => (
                  <tr key={row.feature} className="border-t border-slate-800/50">
                    <td className="px-4 py-3 text-slate-300">{row.feature}</td>
                    <td className="px-4 py-3 text-center text-slate-500">{row.bb}</td>
                    <td className="px-4 py-3 text-center text-slate-400">{row.bbPro}</td>
                    <td className="px-4 py-3 text-center text-green-400 font-medium">{row.mp}</td>
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
          <h2 className="text-2xl font-bold mb-2">Rules Only MigrationPilot Has</h2>
          <p className="text-slate-400 mb-8">
            MigrationPilot catches PostgreSQL-specific patterns that Bytebase&apos;s multi-database approach misses:
          </p>
          <div className="grid md:grid-cols-2 gap-3">
            {[
              { id: 'MP055', name: 'drop-pk-replica-identity-break', desc: 'Dropping PK breaks logical replication (Supabase, Neon, RDS)' },
              { id: 'MP056', name: 'gin-index-jsonb', desc: 'Plain GIN index on JSONB is useless for ->> queries' },
              { id: 'MP057', name: 'rls-enabled-without-policy', desc: 'ENABLE RLS without policy silently blocks all access' },
              { id: 'MP050', name: 'prefer-hnsw-over-ivfflat', desc: 'pgvector: HNSW has better recall without retraining' },
              { id: 'MP051', name: 'require-spatial-index', desc: 'PostGIS columns need GIST/SP-GIST index' },
              { id: 'MP058', name: 'multi-alter-table-same-table', desc: 'Multiple ALTER TABLE = unnecessary lock cycles' },
              { id: 'MP044', name: 'no-data-loss-type-narrowing', desc: 'Type changes that silently truncate data' },
              { id: 'MP046', name: 'concurrent-detach-partition', desc: 'DETACH PARTITION without CONCURRENTLY locks parent' },
              { id: 'MP052', name: 'warn-dependent-objects', desc: 'DROP/ALTER COLUMN may break views, functions, triggers' },
              { id: 'MP060', name: 'alter-type-rename-value', desc: 'RENAME VALUE breaks logical replication silently' },
            ].map((r) => (
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
            Plus 70 more rules covering lock safety, data types, partitioning, and more.{' '}
            <a href="/" className="text-blue-400 hover:text-blue-300">See all 80 rules</a>.
          </p>
        </div>
      </section>

      {/* When to Choose */}
      <section className="py-16 px-6 border-t border-slate-800/50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold mb-8">When to Choose What</h2>
          <div className="space-y-4">
            <div className="border border-slate-800 rounded-lg p-5">
              <h3 className="font-semibold text-slate-200 mb-2">Choose Bytebase if you need:</h3>
              <ul className="space-y-1 text-sm text-slate-400">
                <li>- A web UI for non-developer stakeholders to review and approve schema changes</li>
                <li>- Multi-database support (MySQL, TiDB, Snowflake, etc.) in a single tool</li>
                <li>- A centralized platform that manages migration execution, not just linting</li>
                <li>- Built-in change approval workflows beyond GitHub PR reviews</li>
              </ul>
            </div>
            <div className="border border-blue-500/30 rounded-lg p-5 bg-blue-500/5">
              <h3 className="font-semibold text-blue-400 mb-2">Choose MigrationPilot if you need:</h3>
              <ul className="space-y-1 text-sm text-slate-400">
                <li>- Deep PostgreSQL-specific safety analysis (80 rules, lock types, risk scoring)</li>
                <li>- Zero-infrastructure setup (npx one-liner, no Docker deployment)</li>
                <li>- Native GitHub integration (PR annotations, Code Scanning, Job Summary)</li>
                <li>- A tool that fits into your existing Git + CI/CD workflow without replacing it</li>
                <li>- Auto-fix capabilities for 12 common dangerous patterns</li>
              </ul>
            </div>
            <div className="border border-slate-800 rounded-lg p-5">
              <h3 className="font-semibold text-slate-200 mb-2">Use both together:</h3>
              <p className="text-sm text-slate-400">
                Run MigrationPilot in CI for deep static analysis, use Bytebase for change management workflows. MigrationPilot catches patterns that Bytebase&apos;s multi-database SQL advisor misses because it uses the real PostgreSQL parser (libpg-query) for AST-level analysis.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Setup */}
      <section className="py-16 px-6 border-t border-slate-800/50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold mb-8">Get Started in 30 Seconds</h2>
          <div className="space-y-6">
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-bold text-sm shrink-0">1</div>
              <div>
                <h3 className="font-semibold mb-1">Run locally</h3>
                <pre className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 text-sm overflow-x-auto mt-2">
{`npx migrationpilot analyze migrations/`}
                </pre>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-bold text-sm shrink-0">2</div>
              <div>
                <h3 className="font-semibold mb-1">Add to CI</h3>
                <pre className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 text-sm overflow-x-auto mt-2">
{`# .github/workflows/migration-lint.yml
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
            Deeper safety analysis. Zero infrastructure.
          </h2>
          <p className="text-slate-400 mb-8">
            80 safety rules with the real PostgreSQL parser. No Docker deployment.
            No web UI to maintain. Just safety analysis in your CI pipeline.
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
