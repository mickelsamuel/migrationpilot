import type { Metadata } from 'next';
import Navbar from '@/components/navbar';
import { Footer } from '@/components/footer';
import { ButtonLink } from '@/components/button';
import { CodeBlock, CommandBlock } from '@/components/code-block';
import { rules } from '../../rule-data';

export const metadata: Metadata = {
  title: 'MigrationPilot vs Atlas — Free PostgreSQL Migration Linting with 112 Rules',
  description: 'Atlas moved migration linting behind a paid plan. MigrationPilot offers 112 safety rules, all free, plus lock analysis, auto-fix, and a GitHub Action. Open-source, no paid tier required.',
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
    title: 'MigrationPilot vs Atlas — Free PostgreSQL Migration Linting with 112 Rules',
    description: 'Atlas moved migration linting behind a paid plan. MigrationPilot offers 112 safety rules, all free, plus lock analysis, auto-fix, and a GitHub Action.',
    url: 'https://migrationpilot.dev/compare/atlas',
  },
};

/**
 * Atlas's documented PostgreSQL checks, from atlasgo.io/lint/analyzers. Every
 * code except PG110 is Atlas Pro. `mpId: null` means MigrationPilot has no
 * equivalent rule, which is worth saying plainly rather than papering over.
 */
const atlasRules: Array<{
  atlasId: string;
  atlasDesc: string;
  mpId: string | null;
  mpName: string;
  autoFix: boolean;
}> = [
  { atlasId: 'PG101', atlasDesc: 'CREATE INDEX without CONCURRENTLY', mpId: 'MP001', mpName: 'require-concurrent-index-creation', autoFix: true },
  { atlasId: 'PG102', atlasDesc: 'DROP INDEX without CONCURRENTLY', mpId: 'MP009', mpName: 'require-drop-index-concurrently', autoFix: true },
  { atlasId: 'PG103', atlasDesc: 'CONCURRENTLY inside a transaction', mpId: 'MP025', mpName: 'ban-concurrent-in-transaction', autoFix: true },
  { atlasId: 'PG104', atlasDesc: 'ADD PRIMARY KEY takes ACCESS EXCLUSIVE', mpId: null, mpName: 'No direct equivalent', autoFix: false },
  { atlasId: 'PG105', atlasDesc: 'ADD UNIQUE takes ACCESS EXCLUSIVE', mpId: 'MP027', mpName: 'disallowed-unique-constraint', autoFix: false },
  { atlasId: 'PG110', atlasDesc: 'Non-optimal column alignment', mpId: 'MP061', mpName: 'suboptimal-column-order', autoFix: false },
  { atlasId: 'PG301', atlasDesc: 'Column type change rewrites the table', mpId: 'MP007', mpName: 'no-column-type-change', autoFix: false },
  { atlasId: 'PG302', atlasDesc: 'Volatile DEFAULT rewrites the table', mpId: 'MP003', mpName: 'volatile-default-table-rewrite', autoFix: false },
  { atlasId: 'PG303', atlasDesc: 'SET NOT NULL scans the whole table', mpId: 'MP002', mpName: 'require-check-not-null-pattern', autoFix: false },
  { atlasId: 'PG304', atlasDesc: 'PRIMARY KEY on nullable columns forces a scan', mpId: null, mpName: 'No direct equivalent', autoFix: false },
  { atlasId: 'PG305', atlasDesc: 'CHECK without NOT VALID', mpId: 'MP030', mpName: 'require-not-valid-check', autoFix: true },
  { atlasId: 'PG306', atlasDesc: 'FOREIGN KEY without NOT VALID', mpId: 'MP005', mpName: 'require-not-valid-foreign-key', autoFix: true },
  { atlasId: 'PG307', atlasDesc: 'SET LOGGED / UNLOGGED rewrites the table', mpId: 'MP047', mpName: 'ban-set-logged-unlogged', autoFix: false },
  { atlasId: 'PG308', atlasDesc: 'Trigger on an existing table blocks writes', mpId: 'MP090', mpName: 'warn-trigger-on-hot-table', autoFix: false },
  { atlasId: 'PG309', atlasDesc: 'STORED generated column rewrites the table', mpId: 'MP062', mpName: 'ban-add-generated-stored-column', autoFix: false },
  { atlasId: 'PG310', atlasDesc: 'Identity column rewrites the table', mpId: null, mpName: 'No direct equivalent', autoFix: false },
  { atlasId: 'PG311', atlasDesc: 'Access method change rewrites the table', mpId: null, mpName: 'No direct equivalent', autoFix: false },
];

const atlasMapped = atlasRules.filter((rule) => rule.mpId).length;
const atlasUnmapped = atlasRules.length - atlasMapped;
/* Rules with nothing on the Atlas side to compare against. Derived from the
   table above so the two numbers cannot drift apart. */
const beyondAtlas = rules.length - atlasMapped;

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
    <>
      <Navbar />
      <main className="pt-14">
        {/* Hero */}
        <section className="mp-container pt-16 md:pt-20 pb-16">
          <div className="max-w-4xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-warn-soft border border-warn/30 text-warn text-sm mb-6">
              112 free rules vs 16 paid checks
            </div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
              MigrationPilot vs Atlas
              <span className="block text-2xl md:text-3xl text-muted font-normal mt-3">
                Free, Open-Source Migration Linting
              </span>
            </h1>
            <p className="text-xl text-muted max-w-2xl mb-8">
              Atlas (by Ariga) is a schema management tool. It documents {atlasRules.length} PostgreSQL
              checks, and every one but PG110 needs Atlas Pro. MigrationPilot is a dedicated migration
              linter with 112 rules, all of them free. It works alongside Atlas or any other migration
              tool.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <ButtonLink href="https://github.com/mickelsamuel/migrationpilot">
                Get Started Free
              </ButtonLink>
              <ButtonLink href="/migrate-from-atlas" variant="secondary">
                Migration Guide
              </ButtonLink>
            </div>
          </div>
        </section>

        {/* Rule Mapping */}
        <section className="mp-container py-16">
          <div className="max-w-4xl">
            <h2 className="text-2xl font-bold mb-2">Rule-by-Rule Coverage</h2>
            <p className="text-muted mb-8">
              Atlas documents {atlasRules.length} PostgreSQL checks. MigrationPilot has an equivalent
              for {atlasMapped} of them, {atlasRules.filter((r) => r.autoFix).length} of those
              auto-fixable. The remaining {atlasUnmapped} have no MigrationPilot counterpart, and
              they are listed here rather than left out.
            </p>
            <div className="overflow-x-auto">
              <table className="text-sm border border-line rounded-lg overflow-hidden">
                <thead>
                  <tr className="bg-raised">
                    <th className="text-left px-4 py-3 font-medium text-faint">Atlas Rule</th>
                    <th className="text-left px-4 py-3 font-medium text-faint">MigrationPilot Equivalent</th>
                    <th className="text-center px-4 py-3 font-medium text-faint">Auto-Fix</th>
                  </tr>
                </thead>
                <tbody>
                  {atlasRules.map((r) => (
                    <tr key={r.atlasId} className="border-t border-line-soft hover:bg-raised/30">
                      <td className="px-4 py-3">
                        <span className="font-mono text-faint">{r.atlasId}</span>{' '}
                        <span className="text-muted">{r.atlasDesc}</span>
                      </td>
                      <td className="px-4 py-3">
                        {r.mpId ? (
                          <>
                            <a href={`/rules/${r.mpId.toLowerCase()}`} className="text-accent hover:text-accent-hover font-mono">
                              {r.mpId}
                            </a>{' '}
                            <span className="text-muted">{r.mpName}</span>
                          </>
                        ) : (
                          <span className="text-faint">{r.mpName}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {r.autoFix ? (
                          <span className="text-ok">Yes</span>
                        ) : (
                          <span className="text-faint">&mdash;</span>
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
        <section className="mp-container py-16 border-t border-line-soft">
          <div className="max-w-4xl">
            <h2 className="text-2xl font-bold mb-8">Feature Comparison</h2>
            <div className="overflow-x-auto">
              <table className="text-sm border border-line rounded-lg overflow-hidden">
                <thead>
                  <tr className="bg-raised">
                    <th className="text-left px-4 py-3 font-medium text-faint">Capability</th>
                    <th className="text-center px-4 py-3 font-medium text-faint">Atlas (Free)</th>
                    <th className="text-center px-4 py-3 font-medium text-faint">Atlas (Pro/Cloud)</th>
                    <th className="text-center px-4 py-3 font-medium text-accent">MigrationPilot</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { feature: 'Migration linting', atlasFree: 'PG110 only', atlasPro: '16 PG checks', mp: '112 rules (all free)' },
                    { feature: 'Lock type analysis', atlasFree: 'No', atlasPro: 'No', mp: 'Per-statement' },
                    { feature: 'Risk scoring', atlasFree: 'No', atlasPro: 'No', mp: 'RED / YELLOW / GREEN (0-100)' },
                    { feature: 'Auto-fix', atlasFree: 'No', atlasPro: 'No', mp: '20 rules' },
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
                    { feature: 'Production context', atlasFree: 'No', atlasPro: 'Cloud-based', mp: 'Free (--database-url)' },
                    { feature: 'Air-gapped mode', atlasFree: 'No', atlasPro: 'No (requires cloud)', mp: 'Yes (--offline)' },
                    { feature: 'Price', atlasFree: 'Free', atlasPro: 'Custom', mp: 'Free (all 112 rules)' },
                    { feature: 'License', atlasFree: 'Apache 2.0', atlasPro: 'Commercial', mp: 'MIT' },
                  ].map((row) => (
                    <tr key={row.feature} className="border-t border-line-soft">
                      <td className="px-4 py-3 text-muted">{row.feature}</td>
                      <td className="px-4 py-3 text-center text-faint">{row.atlasFree}</td>
                      <td className="px-4 py-3 text-center text-muted">{row.atlasPro}</td>
                      <td className="px-4 py-3 text-center text-ok font-medium">{row.mp}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* 73 Unique Rules */}
        <section className="mp-container py-16 border-t border-line-soft">
          <div className="max-w-4xl">
            <h2 className="text-2xl font-bold mb-2">{beyondAtlas} Rules Atlas Does Not Have</h2>
            <p className="text-muted mb-8">
              Once you set aside the {atlasMapped} checks both tools make, {beyondAtlas} MigrationPilot
              rules have nothing on the Atlas side to compare against. Some of them:
            </p>
            <div className="grid md:grid-cols-2 gap-3">
              {uniqueHighlights.map((r) => (
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
              Plus {beyondAtlas - uniqueHighlights.length} more covering data safety, type choices,
              partitioning, pgvector, and replication.{' '}
              <a href="/rules" className="text-accent hover:text-accent-hover">
                See all {rules.length} rules
              </a>
              .
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
                  title: 'Free Migration Linting',
                  description: 'Atlas moved migration linting behind a Pro login in v0.38; the Community Edition keeps only basic analyzers, with every PostgreSQL lock-safety check Pro-only. MigrationPilot gives you all 112 rules for free under an MIT license, with no cloud account.',
                },
                {
                  title: 'Far More Coverage',
                  description: `Atlas documents ${atlasRules.length} PostgreSQL checks. MigrationPilot has ${rules.length} rules, covering lock safety, data types, partitioning, RLS, JSONB indexing, and logical replication.`,
                },
                {
                  title: 'Lock-Level Analysis',
                  description: 'MigrationPilot tells you exactly which PostgreSQL lock each DDL statement acquires (SHARE, SHARE UPDATE EXCLUSIVE, ACCESS EXCLUSIVE) and whether it blocks reads or writes.',
                },
                {
                  title: 'Auto-Fix',
                  description: '20 rules can be fixed automatically with --fix: missing CONCURRENTLY, lock_timeout, statement_timeout, NOT VALID, IF NOT EXISTS, and more. Atlas does not offer auto-fix.',
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
                <h3 className="text-lg font-semibold mb-4">Use Atlas when you need to...</h3>
                <ul className="space-y-3 text-sm text-muted">
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-ok mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Define schemas declaratively with HCL
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-ok mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Auto-generate migration files from schema diffs
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-ok mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Manage schemas across multiple database engines
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-ok mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Use cloud-hosted schema management (Ariga Cloud)
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-ok mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Apply versioned migrations with built-in execution
                  </li>
                </ul>
              </div>
              <div className="border border-accent/35 rounded-xl p-6 bg-accent-soft">
                <h3 className="text-lg font-semibold mb-4 text-accent">Use MigrationPilot when you need to...</h3>
                <ul className="space-y-3 text-sm text-muted">
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-accent mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Comprehensive PostgreSQL migration safety analysis
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-accent mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Free linting without a cloud account or paid plan
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-accent mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Auto-fix dangerous DDL patterns automatically
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-accent mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Run entirely locally or air-gapped (no cloud dependency)
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-accent mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Lint migrations from any framework, not just Atlas
                  </li>
                </ul>
              </div>
            </div>
            <div className="mt-8 border border-line rounded-xl p-6 bg-surface">
              <h3 className="font-semibold mb-2">Use both together</h3>
              <p className="text-sm text-muted leading-relaxed">
                If you use Atlas for schema management, you can add MigrationPilot as a lint step in your CI pipeline.
                Atlas generates the migration SQL, MigrationPilot reviews it for safety.
                Keep Atlas for declarative schema management and execution. Add MigrationPilot for deep PostgreSQL safety analysis.
              </p>
            </div>
          </div>
        </section>

        {/* Quick Start */}
        <section className="mp-container py-16 border-t border-line-soft">
          <div className="max-w-4xl">
            <h2 className="text-2xl font-bold mb-8">Get Started in 30 Seconds</h2>
            <div className="space-y-6">
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-accent text-accent-ink flex items-center justify-center font-bold text-sm shrink-0">1</div>
                <div className="min-w-0">
                  <h3 className="font-semibold mb-1">Lint your Atlas migrations</h3>
                  <CodeBlock code={`# Analyze migration files generated by Atlas
npx migrationpilot analyze migrations/*.sql`} />
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-accent text-accent-ink flex items-center justify-center font-bold text-sm shrink-0">2</div>
                <div className="min-w-0">
                  <h3 className="font-semibold mb-1">Add to GitHub Actions</h3>
                  <CodeBlock code={`- uses: mickelsamuel/migrationpilot@v1
  with:
    path: migrations/
    fail-on: critical`} />
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-accent text-accent-ink flex items-center justify-center font-bold text-sm shrink-0">3</div>
                <div className="min-w-0">
                  <h3 className="font-semibold mb-1">Auto-fix common issues</h3>
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
              {rules.length} rules. Free and open-source. No cloud required.
            </h2>
            <p className="text-muted mb-8">
              Migration linting should not require a paid plan. MigrationPilot gives you all{' '}
              {rules.length} safety rules for free, 20 of them auto-fixable, plus lock analysis and
              risk scoring. MIT licensed.
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
