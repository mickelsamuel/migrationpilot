import type { Metadata } from 'next';
import Navbar from '@/components/navbar';
import { Footer } from '@/components/footer';
import { CodeBlock, CommandBlock } from '@/components/code-block';
import { ButtonLink } from '@/components/button';

export const metadata: Metadata = {
  title: 'Migrate from Squawk to MigrationPilot — 112 PostgreSQL Migration Rules',
  description: 'MigrationPilot ships 112 safety rules to Squawk’s 40 (v2.62.0), adding RLS safety, JSONB indexing, logical replication, and auto-fix. Free and open-source.',
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
    <>
      <Navbar />
      <main className="pt-14">
        {/* Hero */}
        <section className="mp-container pt-16 md:pt-20 pb-16">
          <div className="max-w-4xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent-soft border border-accent/35 text-accent text-sm mb-6">
              112 rules vs Squawk&apos;s 40
            </div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
              MigrationPilot vs Squawk
            </h1>
            <p className="text-xl text-muted max-w-2xl mb-8">
              MigrationPilot ships 112 rules to Squawk’s 40 — adding RLS safety,
              JSONB indexing, logical replication, and 20 auto-fixes. Same CLI workflow, more coverage.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <CommandBlock command="npx migrationpilot analyze migrations/" />
              <ButtonLink href="https://github.com/mickelsamuel/migrationpilot">
                View on GitHub
              </ButtonLink>
            </div>
          </div>
        </section>

        {/* Comparison Table */}
        <section className="mp-container py-16">
          <div className="max-w-4xl">
            <h2 className="text-2xl font-bold mb-8">Feature Comparison</h2>
            <div className="overflow-x-auto">
              <table className="text-sm border border-line rounded-lg overflow-hidden">
                <thead>
                  <tr className="bg-raised">
                    <th className="text-left px-4 py-3 font-medium text-faint">Feature</th>
                    <th className="text-center px-4 py-3 font-medium text-faint">Squawk</th>
                    <th className="text-center px-4 py-3 font-medium text-accent">MigrationPilot</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { feature: 'Total rules', squawk: '40 (v2.62.0)', mp: '112' },
                    { feature: 'Auto-fix', squawk: 'No', mp: '20 rules' },
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
                    { feature: 'License', squawk: 'Apache-2.0 / MIT', mp: 'MIT' },
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
            <p className="text-muted mb-8">Every Squawk rule has a direct MigrationPilot equivalent.</p>
            <div className="overflow-x-auto">
              <table className="text-sm border border-line rounded-lg overflow-hidden">
                <thead>
                  <tr className="bg-raised">
                    <th className="text-left px-4 py-3 font-medium text-faint">Squawk Rule</th>
                    <th className="text-left px-4 py-3 font-medium text-faint">MigrationPilot</th>
                    <th className="text-left px-4 py-3 font-medium text-faint">Auto-Fix</th>
                  </tr>
                </thead>
                <tbody>
                  {ruleMapping.map((r) => (
                    <tr key={r.squawk} className="border-t border-line-soft hover:bg-raised/30">
                      <td className="px-4 py-3 text-muted font-mono text-xs">{r.squawk}</td>
                      <td className="px-4 py-3">
                        <a href={`/rules/${r.mpId.toLowerCase()}`} className="text-accent hover:text-accent-hover font-mono text-xs">
                          {r.mpId}
                        </a>{' '}
                        <span className="text-muted text-xs">{r.mpName}</span>
                      </td>
                      <td className="px-4 py-3">
                        {r.autoFix ? (
                          <span className="text-ok text-xs">Yes</span>
                        ) : (
                          <span className="text-faint text-xs">—</span>
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
        <section className="mp-container py-16 border-t border-line-soft">
          <div className="max-w-4xl">
            <h2 className="text-2xl font-bold mb-2">Rules Squawk Doesn&apos;t Have</h2>
            <p className="text-muted mb-8">
              MigrationPilot catches issues that Squawk misses entirely — from RLS lockouts to logical replication breaks.
            </p>
            <div className="grid md:grid-cols-2 gap-3">
              {uniqueRules.map((r) => (
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
              <a href="/rules" className="text-accent hover:text-accent-hover">See all 112 rules</a>.
            </p>
          </div>
        </section>

        {/* Migration Steps */}
        <section className="mp-container py-16 border-t border-line-soft">
          <div className="max-w-4xl">
            <h2 className="text-2xl font-bold mb-8">Migrate in 60 Seconds</h2>
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
                  <h3 className="font-semibold mb-1">Update CI</h3>
                  <CodeBlock code={`# Replace squawk GitHub Action:
- uses: mickelsamuel/migrationpilot@v1
  with:
    path: migrations/`} />
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-accent text-accent-ink flex items-center justify-center font-bold text-sm shrink-0">3</div>
                <div className="min-w-0">
                  <h3 className="font-semibold mb-1">Optional: Enable auto-fix</h3>
                  <CodeBlock code={`# Auto-fix 20 common issues
npx migrationpilot analyze migrations/ --fix --dry-run`} />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="mp-container py-20 border-t border-line-soft">
          <div className="max-w-3xl">
            <h2 className="text-3xl font-bold mb-4">
              Almost 3x the rules. Auto-fix included. Same CLI workflow.
            </h2>
            <p className="text-muted mb-8">
              112 safety rules. 20 auto-fixes. Lock analysis. Risk scoring.
              GitHub Action with inline annotations. MIT licensed.
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
