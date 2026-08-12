import type { Metadata } from 'next';
import Navbar from '@/components/navbar';
import { Footer } from '@/components/footer';
import { CodeBlock, CommandBlock } from '@/components/code-block';
import { ButtonLink } from '@/components/button';

export const metadata: Metadata = {
  title: 'MigrationPilot vs Bytebase — CLI-First PostgreSQL Migration Safety',
  description: 'Bytebase is a database DevOps platform with a web UI. MigrationPilot is a focused CLI/GitHub Action with 112 safety rules and deeper static analysis. No deployment needed.',
  keywords: ['bytebase alternative', 'bytebase postgresql', 'bytebase migration linter', 'bytebase vs migrationpilot', 'postgresql migration safety', 'database devops'],
};

export default function MigrateFromBytebasePage() {
  return (
    <>
      <Navbar />
      <main className="pt-14">
        {/* Hero */}
        <section className="mp-container pt-16 md:pt-20 pb-16">
          <div className="max-w-4xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent-soft border border-accent/35 text-accent text-sm mb-6">
              Deeper safety analysis, no deployment required
            </div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
              MigrationPilot vs Bytebase
            </h1>
            <p className="text-xl text-muted max-w-2xl mb-8">
              Bytebase is a full database DevOps platform with a web UI. MigrationPilot is a focused CLI and GitHub Action with 112 safety rules and deeper PostgreSQL-specific static analysis.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <CommandBlock command="npx migrationpilot analyze migrations/" />
              <ButtonLink href="https://github.com/mickelsamuel/migrationpilot">
                View on GitHub
              </ButtonLink>
            </div>
          </div>
        </section>

        {/* Approach Comparison */}
        <section className="mp-container py-16">
          <div className="max-w-4xl">
            <h2 className="text-2xl font-bold mb-8">Two Different Approaches</h2>
            <div className="grid md:grid-cols-2 gap-6 mb-12">
              <div className="border border-line rounded-xl p-6">
                <h3 className="text-lg font-semibold mb-3 text-muted">Bytebase</h3>
                <p className="text-muted text-sm mb-4">Database DevOps platform</p>
                <ul className="space-y-2 text-sm text-muted">
                  <li className="flex items-start gap-2">
                    <span className="text-faint mt-0.5">-</span>
                    Web UI for schema review, change approval, and execution
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-faint mt-0.5">-</span>
                    Requires self-hosted deployment (Docker/Kubernetes)
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-faint mt-0.5">-</span>
                    Multi-database: PostgreSQL, MySQL, TiDB, Snowflake, etc.
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-faint mt-0.5">-</span>
                    Schema review with basic SQL checks
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-danger mt-0.5">-</span>
                    <span className="text-danger">Fewer PostgreSQL-specific rules than MigrationPilot</span>
                  </li>
                </ul>
              </div>
              <div className="border border-accent/35 rounded-xl p-6 bg-accent-soft">
                <h3 className="text-lg font-semibold mb-3 text-accent">MigrationPilot</h3>
                <p className="text-muted text-sm mb-4">Focused PostgreSQL safety linter</p>
                <ul className="space-y-2 text-sm text-muted">
                  <li className="flex items-start gap-2">
                    <span className="text-ok mt-0.5">+</span>
                    <span className="text-ok">CLI + GitHub Action — no web UI to deploy or manage</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-ok mt-0.5">+</span>
                    <span className="text-ok">npx one-liner — zero infrastructure needed</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-ok mt-0.5">+</span>
                    <span className="text-ok">112 PostgreSQL-specific rules (deeper analysis)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-ok mt-0.5">+</span>
                    <span className="text-ok">Lock type analysis, risk scoring, auto-fix</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-ok mt-0.5">+</span>
                    <span className="text-ok">SARIF output for GitHub Code Scanning</span>
                  </li>
                </ul>
              </div>
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
                    <th className="text-center px-4 py-3 font-medium text-faint">Bytebase (Free)</th>
                    <th className="text-center px-4 py-3 font-medium text-faint">Bytebase (Pro)</th>
                    <th className="text-center px-4 py-3 font-medium text-accent">MigrationPilot</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { feature: 'PostgreSQL safety rules', bb: '~20 rules', bbPro: '~30 rules', mp: '112 rules' },
                    { feature: 'Lock type analysis', bb: 'Basic', bbPro: 'Basic', mp: 'Detailed (per-statement)' },
                    { feature: 'Risk scoring', bb: 'Warning/Error', bbPro: 'Warning/Error', mp: 'RED/YELLOW/GREEN (0-100)' },
                    { feature: 'Auto-fix', bb: 'No', bbPro: 'No', mp: '20 rules' },
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
                    { feature: 'Price', bb: 'Free (limited)', bbPro: 'From $74/user/mo', mp: '$0 (all 112 rules free)' },
                  ].map((row) => (
                    <tr key={row.feature} className="border-t border-line-soft">
                      <td className="px-4 py-3 text-muted">{row.feature}</td>
                      <td className="px-4 py-3 text-center text-faint">{row.bb}</td>
                      <td className="px-4 py-3 text-center text-muted">{row.bbPro}</td>
                      <td className="px-4 py-3 text-center text-ok font-medium">{row.mp}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Unique Rules */}
        <section className="mp-container py-16 border-t border-line-soft">
          <div className="max-w-4xl">
            <h2 className="text-2xl font-bold mb-2">Rules Only MigrationPilot Has</h2>
            <p className="text-muted mb-8">
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
                  className="border border-line rounded-lg p-3 hover:border-faint transition-colors"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-accent text-xs">{r.id}</span>
                    <span className="text-xs text-faint">{r.name}</span>
                  </div>
                  <p className="text-muted text-xs">{r.desc}</p>
                </a>
              ))}
            </div>
            <p className="text-faint text-sm mt-4">
              The rest cover lock safety, data types, partitioning and replication.{' '}
              <a href="/rules" className="text-accent hover:text-accent-hover">See all 112 rules</a>.
            </p>
          </div>
        </section>

        {/* When to Choose */}
        <section className="mp-container py-16 border-t border-line-soft">
          <div className="max-w-4xl">
            <h2 className="text-2xl font-bold mb-8">When to Choose What</h2>
            <div className="space-y-4">
              <div className="border border-line rounded-lg p-5">
                <h3 className="font-semibold text-fg mb-2">Choose Bytebase if you need:</h3>
                <ul className="space-y-1 text-sm text-muted">
                  <li>- A web UI for non-developer stakeholders to review and approve schema changes</li>
                  <li>- Multi-database support (MySQL, TiDB, Snowflake, etc.) in a single tool</li>
                  <li>- A centralized platform that manages migration execution, not just linting</li>
                  <li>- Built-in change approval workflows beyond GitHub PR reviews</li>
                </ul>
              </div>
              <div className="border border-accent/35 rounded-lg p-5 bg-accent-soft">
                <h3 className="font-semibold text-accent mb-2">Choose MigrationPilot if you need:</h3>
                <ul className="space-y-1 text-sm text-muted">
                  <li>- Deep PostgreSQL-specific safety analysis (112 rules, lock types, risk scoring)</li>
                  <li>- Zero-infrastructure setup (npx one-liner, no Docker deployment)</li>
                  <li>- Native GitHub integration (PR annotations, Code Scanning, Job Summary)</li>
                  <li>- A tool that fits into your existing Git + CI/CD workflow without replacing it</li>
                  <li>- Auto-fix capabilities for 20 common dangerous patterns</li>
                </ul>
              </div>
              <div className="border border-line rounded-lg p-5">
                <h3 className="font-semibold text-fg mb-2">Use both together:</h3>
                <p className="text-sm text-muted">
                  Run MigrationPilot in CI for deep static analysis, use Bytebase for change management workflows. MigrationPilot catches patterns that Bytebase&apos;s multi-database SQL advisor misses because it uses the real PostgreSQL parser (libpg-query) for AST-level analysis.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Setup */}
        <section className="mp-container py-16 border-t border-line-soft">
          <div className="max-w-4xl">
            <h2 className="text-2xl font-bold mb-8">Get Started in 30 Seconds</h2>
            <div className="space-y-6">
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-accent text-accent-ink flex items-center justify-center font-bold text-sm shrink-0">1</div>
                <div className="min-w-0">
                  <h3 className="font-semibold mb-1">Run locally</h3>
                  <CommandBlock command={`npx migrationpilot analyze migrations/`} />
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-accent text-accent-ink flex items-center justify-center font-bold text-sm shrink-0">2</div>
                <div className="min-w-0">
                  <h3 className="font-semibold mb-1">Add to CI</h3>
                  <CodeBlock code={`# .github/workflows/migration-lint.yml
- uses: mickelsamuel/migrationpilot@v1
  with:
    path: migrations/`} />
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-accent text-accent-ink flex items-center justify-center font-bold text-sm shrink-0">3</div>
                <div className="min-w-0">
                  <h3 className="font-semibold mb-1">Optional: Enable auto-fix</h3>
                  <CommandBlock command={`npx migrationpilot analyze migrations/ --fix --dry-run`} />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="mp-container py-20 border-t border-line-soft">
          <div className="max-w-3xl">
            <h2 className="text-3xl font-bold mb-4">
              Deeper safety analysis. Zero infrastructure.
            </h2>
            <p className="text-muted mb-8">
              112 safety rules with the real PostgreSQL parser. No Docker deployment.
              No web UI to maintain. Just safety analysis in your CI pipeline.
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
