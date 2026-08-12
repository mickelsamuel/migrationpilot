import type { Metadata } from 'next';
import Navbar from '@/components/navbar';
import { Footer } from '@/components/footer';
import { ButtonLink } from '@/components/button';
import { CodeBlock } from '@/components/code-block';

export const metadata: Metadata = {
  title: 'MigrationPilot vs Squawk — 112 PostgreSQL Migration Rules vs 40',
  description: 'MigrationPilot ships 112 safety rules; Squawk has 40 as of v2.62.0 (Aug 2026). Lock analysis, risk scoring, 20 auto-fixes, GitHub Action, VS Code extension.',
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
    title: 'MigrationPilot vs Squawk — 112 PostgreSQL Migration Rules vs 40',
    description: 'MigrationPilot ships 112 safety rules; Squawk has 40 as of v2.62.0 (Aug 2026). Lock analysis, risk scoring, 20 auto-fixes, and VS Code extension.',
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
    <>
      <Navbar />
      <main className="pt-14">
        {/* Hero */}
        <section className="mp-container pt-16 md:pt-20 pb-16">
          <div className="max-w-4xl">
            <img
              src="/charts/rules-comparison.png"
              alt="PostgreSQL migration linter rules comparison: MigrationPilot 112 rules vs Squawk 40 rules"
              className="mb-8 rounded-lg border border-line max-w-lg w-full"
              width={700}
              height={400}
            />
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent-soft border border-accent/35 text-accent text-sm mb-6">
              112 rules vs 40
            </div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
              MigrationPilot vs Squawk
              <span className="block text-2xl md:text-3xl text-muted font-normal mt-3">
                More Rules, Auto-Fix, Same CLI Workflow
              </span>
            </h1>
            <p className="text-xl text-muted max-w-2xl mb-8">
              Both MigrationPilot and Squawk are PostgreSQL migration linters. MigrationPilot ships 112 safety rules;
              Squawk has 40 as of v2.62.0 (Aug 2026). MigrationPilot also adds lock analysis, risk scoring,
              20 auto-fixes, and a VS Code extension. Same workflow, more coverage.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <ButtonLink href="https://github.com/mickelsamuel/migrationpilot">
                Get Started Free
              </ButtonLink>
              <ButtonLink href="/migrate-from-squawk" variant="secondary">
                Migration Guide
              </ButtonLink>
            </div>
          </div>
        </section>

        {/* Feature Comparison Table */}
        <section className="mp-container py-16">
          <div className="max-w-4xl">
            <h2 className="text-2xl font-bold mb-8">Feature Comparison</h2>
            <div className="overflow-x-auto">
              <table className="text-sm border border-line rounded-lg overflow-hidden">
                <thead>
                  <tr className="bg-raised">
                    <th className="text-left px-4 py-3 font-medium text-faint">Capability</th>
                    <th className="text-center px-4 py-3 font-medium text-faint">Squawk</th>
                    <th className="text-center px-4 py-3 font-medium text-accent">MigrationPilot</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { feature: 'Total safety rules', squawk: '40 (v2.62.0, Aug 2026)', mp: '112 (all free)' },
                    { feature: 'Auto-fix', squawk: 'No', mp: '20 rules (--fix)' },
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
                    { feature: 'Production context', squawk: 'No', mp: 'Table sizes, query frequency' },
                    { feature: 'Rollback DDL generation', squawk: 'No', mp: 'Yes' },
                    { feature: 'RLS safety rules', squawk: 'No', mp: 'Yes (MP057, MP079)' },
                    { feature: 'JSONB index analysis', squawk: 'No', mp: 'Yes (MP056)' },
                    { feature: 'Replication safety', squawk: 'No', mp: 'Yes (MP055, MP060, MP064)' },
                    { feature: 'Partition rules', squawk: 'No', mp: 'Yes (MP046, MP049, MP072)' },
                    { feature: 'pgvector index advice', squawk: 'No', mp: 'Yes (MP050)' },
                    { feature: 'Language', squawk: 'Rust', mp: 'TypeScript (Node.js)' },
                    { feature: 'Parser', squawk: 'pg-query-rs', mp: 'libpg-query (WASM)' },
                    { feature: 'License', squawk: 'Apache-2.0 / MIT', mp: 'MIT' },
                    { feature: 'Price', squawk: 'Free', mp: 'Free (all 112 rules)' },
                  ].map((row) => (
                    <tr key={row.feature} className="border-t border-line-soft">
                      <td className="px-4 py-3 text-muted">{row.feature}</td>
                      <td className="px-4 py-3 text-center text-faint">{row.squawk}</td>
                      <td className="px-4 py-3 text-center text-ok font-medium">{row.mp}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Rule Mapping */}
        <section className="mp-container py-16 border-t border-line-soft">
          <div className="max-w-4xl">
            <h2 className="text-2xl font-bold mb-2">Rule-by-Rule Coverage</h2>
            <p className="text-muted mb-8">
              These 25 Squawk rules map directly onto a MigrationPilot rule. Seven of the equivalents are auto-fixable.
            </p>
            <div className="overflow-x-auto">
              <table className="text-sm border border-line rounded-lg overflow-hidden">
                <thead>
                  <tr className="bg-raised">
                    <th className="text-left px-4 py-3 font-medium text-faint">Squawk Rule</th>
                    <th className="text-left px-4 py-3 font-medium text-faint">MigrationPilot</th>
                    <th className="text-center px-4 py-3 font-medium text-faint">Auto-Fix</th>
                  </tr>
                </thead>
                <tbody>
                  {ruleMapping.map((r, i) => (
                    <tr key={`${r.squawk}-${i}`} className="border-t border-line-soft hover:bg-raised/30">
                      <td className="px-4 py-3 text-muted font-mono text-xs">{r.squawk}</td>
                      <td className="px-4 py-3">
                        <a href={`/rules/${r.mpId.toLowerCase()}`} className="text-accent hover:text-accent-hover font-mono text-xs">
                          {r.mpId}
                        </a>{' '}
                        <span className="text-muted text-xs">{r.mpName}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {r.autoFix ? (
                          <span className="text-ok text-xs">Yes</span>
                        ) : (
                          <span className="text-faint text-xs">&mdash;</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Rules with no Squawk counterpart */}
        <section className="mp-container py-16 border-t border-line-soft">
          <div className="max-w-4xl">
            <h2 className="text-2xl font-bold mb-2">Rules With No Squawk Counterpart</h2>
            <p className="text-muted mb-8">
              MigrationPilot catches issues that Squawk does not check &mdash; from RLS lockouts to logical replication
              breaks to pgvector index advice. Here are some highlights:
            </p>
            <div className="grid md:grid-cols-2 gap-3">
              {uniqueRuleHighlights.map((r) => (
                <a
                  key={r.id}
                  href={`/rules/${r.id.toLowerCase()}`}
                  className="border border-line rounded-lg p-4 hover:border-faint transition-colors group"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-accent text-sm">{r.id}</span>
                    <span className="text-sm text-faint">{r.name}</span>
                  </div>
                  <p className="text-muted text-sm">{r.desc}</p>
                </a>
              ))}
            </div>
            <p className="text-faint text-sm mt-4">
              <a href="/rules" className="text-accent hover:text-accent-hover">See all 112 rules</a>.
            </p>
          </div>
        </section>

        {/* Key Differentiators */}
        <section className="mp-container py-16 border-t border-line-soft">
          <div className="max-w-4xl">
            <h2 className="text-2xl font-bold mb-8">Key Differentiators</h2>
            <div className="grid md:grid-cols-2 gap-6">
              {[
                {
                  title: 'Twice the Rules',
                  description: 'MigrationPilot has 112 safety rules; Squawk has 40 as of v2.62.0 (Aug 2026). Coverage includes RLS, JSONB, logical replication, partitioning, pgvector, TOAST compression, and more.',
                },
                {
                  title: 'Auto-Fix',
                  description: '20 rules can be automatically fixed with --fix. Missing CONCURRENTLY, lock_timeout, statement_timeout, NOT VALID, IF NOT EXISTS, VARCHAR-to-TEXT, TIMESTAMP-to-TIMESTAMPTZ, and more. Squawk only reports; MigrationPilot can fix.',
                },
                {
                  title: 'Lock Type Analysis',
                  description: 'Every DDL statement output includes the PostgreSQL lock it acquires (SHARE, SHARE UPDATE EXCLUSIVE, ACCESS EXCLUSIVE) and whether it blocks reads, writes, or both. Squawk does not analyze locks.',
                },
                {
                  title: 'Risk Scoring',
                  description: 'RED / YELLOW / GREEN risk scores (0-100) driven by what the rules found and by the lock each statement takes — a critical finding always reads RED. Pass --database-url and 15 more rules read live table sizes, write traffic and replication state — free, like everything else.',
                },
                {
                  title: 'VS Code Extension',
                  description: 'Real-time diagnostics, hover tooltips with lock info, and quick-fix actions directly in your editor. Squawk does not have an editor extension.',
                },
                {
                  title: 'MCP Server',
                  description: 'MigrationPilot ships an MCP server (4 tools), so Claude, Cursor, and other AI assistants can analyze a migration before they hand it to you. Squawk has no MCP integration. Both tools are permissively licensed — MigrationPilot is MIT, Squawk is Apache-2.0 / MIT — so neither carries copyleft obligations.',
                },
              ].map((item) => (
                <div key={item.title} className="border border-line rounded-xl p-6 bg-surface">
                  <h3 className="font-semibold mb-2">{item.title}</h3>
                  <p className="text-sm text-muted leading-relaxed">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* When to Use Each */}
        <section className="mp-container py-16 border-t border-line-soft">
          <div className="max-w-4xl">
            <h2 className="text-2xl font-bold mb-8">When to Use Each Tool</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="border border-line rounded-xl p-6 bg-surface">
                <h3 className="text-lg font-semibold mb-4">Squawk may be a better fit if...</h3>
                <ul className="space-y-3 text-sm text-muted">
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-ok mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    You prefer a Rust binary with zero runtime dependencies
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-ok mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    You only need the 40 rules it covers
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-ok mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    It is already wired into your CI and covers what you check for
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-ok mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    You want the fastest possible binary execution time
                  </li>
                </ul>
              </div>
              <div className="border border-accent/35 rounded-xl p-6 bg-accent-soft">
                <h3 className="text-lg font-semibold mb-4 text-accent">MigrationPilot is a better fit if...</h3>
                <ul className="space-y-3 text-sm text-muted">
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-accent mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    You want the widest PostgreSQL rule set (112 rules)
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-accent mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    You need auto-fix to automatically remediate issues
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-accent mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    You want lock analysis and risk scoring per statement
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-accent mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    You need a VS Code extension for real-time feedback
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-accent mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    You need RLS, JSONB, replication, or partitioning rules
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-accent mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    You want production context analysis with actual table sizes
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-accent mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    You want an MCP server so AI assistants can check migrations too
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Quick Migration */}
        <section className="mp-container py-16 border-t border-line-soft">
          <div className="max-w-4xl">
            <h2 className="text-2xl font-bold mb-8">Switch in 60 Seconds</h2>
            <div className="space-y-6">
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-accent text-accent-ink flex items-center justify-center font-bold text-sm shrink-0">1</div>
                <div className="min-w-0">
                  <h3 className="font-semibold mb-1">Replace the CLI</h3>
                  <CodeBlock code={`# Remove Squawk
# npm uninstall squawk-cli  (or cargo uninstall squawk)

# Use MigrationPilot
npx migrationpilot analyze migrations/`} />
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-accent text-accent-ink flex items-center justify-center font-bold text-sm shrink-0">2</div>
                <div className="min-w-0">
                  <h3 className="font-semibold mb-1">Update your CI</h3>
                  <CodeBlock code={`# Replace your Squawk GitHub Action:
- uses: mickelsamuel/migrationpilot@v1
  with:
    path: migrations/
    fail-on: critical`} />
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-accent text-accent-ink flex items-center justify-center font-bold text-sm shrink-0">3</div>
                <div className="min-w-0">
                  <h3 className="font-semibold mb-1">Enable auto-fix</h3>
                  <CodeBlock code={`# Preview fixes without modifying files
npx migrationpilot analyze migrations/ --fix --dry-run

# Apply fixes in-place
npx migrationpilot analyze migrations/ --fix`} />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="mp-container py-20 border-t border-line-soft">
          <div className="max-w-3xl">
            <h2 className="text-3xl font-bold mb-4">
              112 rules to Squawk&apos;s 40. Auto-fix included.
            </h2>
            <p className="text-muted mb-8">
              112 safety rules. 20 auto-fixes. Lock analysis. Risk scoring.
              VS Code extension. GitHub Action with inline annotations.
              Same CLI workflow, more comprehensive coverage.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <ButtonLink href="https://github.com/mickelsamuel/migrationpilot">
                Get Started Free
              </ButtonLink>
              <ButtonLink href="/docs" variant="secondary">
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
