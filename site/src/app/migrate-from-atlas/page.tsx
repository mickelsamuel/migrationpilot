import type { Metadata } from 'next';
import Navbar from '@/components/navbar';
import { Footer } from '@/components/footer';
import { CodeBlock, CommandBlock } from '@/components/code-block';
import { ButtonLink } from '@/components/button';
import { rules } from '../rule-data';

export const metadata: Metadata = {
  title: 'Migrate from Atlas to MigrationPilot — Free PostgreSQL Migration Linting',
  description: 'Atlas moved migration linting to Pro-only in v0.38, then dropped it from Community Edition entirely. MigrationPilot ships 112 safety rules, all free, plus a GitHub Action, auto-fix, and more — no paid tier required.',
  keywords: ['atlas migrate alternative', 'atlas lint alternative', 'postgresql migration linting', 'atlas pro alternative', 'free migration linter'],
};

/**
 * Atlas's documented PostgreSQL checks, from atlasgo.io/lint/analyzers. Every
 * code but PG110 is Atlas Pro. A null mpId means MigrationPilot has no
 * equivalent, which the table shows rather than hides.
 */
const ruleMapping: Array<{
  atlasId: string;
  atlasName: string;
  mpId: string | null;
  mpName: string;
  autoFix: boolean;
}> = [
  { atlasId: 'PG101', atlasName: 'Creating an index non-concurrently', mpId: 'MP001', mpName: 'require-concurrent-index-creation', autoFix: true },
  { atlasId: 'PG102', atlasName: 'Dropping an index non-concurrently', mpId: 'MP009', mpName: 'require-drop-index-concurrently', autoFix: true },
  { atlasId: 'PG103', atlasName: 'CONCURRENTLY without txmode none', mpId: 'MP025', mpName: 'ban-concurrent-in-transaction', autoFix: true },
  { atlasId: 'PG104', atlasName: 'ADD PRIMARY KEY takes ACCESS EXCLUSIVE', mpId: null, mpName: 'No direct equivalent', autoFix: false },
  { atlasId: 'PG105', atlasName: 'ADD UNIQUE takes ACCESS EXCLUSIVE', mpId: 'MP027', mpName: 'disallowed-unique-constraint', autoFix: false },
  { atlasId: 'PG110', atlasName: 'Non-optimal column alignment', mpId: 'MP061', mpName: 'suboptimal-column-order', autoFix: false },
  { atlasId: 'PG301', atlasName: 'Column type change rewrites the table', mpId: 'MP007', mpName: 'no-column-type-change', autoFix: false },
  { atlasId: 'PG302', atlasName: 'Adding a column with a volatile default', mpId: 'MP003', mpName: 'volatile-default-table-rewrite', autoFix: false },
  { atlasId: 'PG303', atlasName: 'Making a nullable column NOT NULL', mpId: 'MP002', mpName: 'require-check-not-null-pattern', autoFix: false },
  { atlasId: 'PG304', atlasName: 'PRIMARY KEY on nullable columns forces a scan', mpId: null, mpName: 'No direct equivalent', autoFix: false },
  { atlasId: 'PG305', atlasName: 'CHECK constraint without NOT VALID', mpId: 'MP030', mpName: 'require-not-valid-check', autoFix: true },
  { atlasId: 'PG306', atlasName: 'Foreign key without NOT VALID', mpId: 'MP005', mpName: 'require-not-valid-foreign-key', autoFix: true },
  { atlasId: 'PG307', atlasName: 'Changing LOGGED / UNLOGGED', mpId: 'MP047', mpName: 'ban-set-logged-unlogged', autoFix: false },
  { atlasId: 'PG308', atlasName: 'Trigger on an existing table blocks writes', mpId: 'MP090', mpName: 'warn-trigger-on-hot-table', autoFix: false },
  { atlasId: 'PG309', atlasName: 'STORED generated column rewrites the table', mpId: 'MP062', mpName: 'ban-add-generated-stored-column', autoFix: false },
  { atlasId: 'PG310', atlasName: 'Identity column rewrites the table', mpId: null, mpName: 'No direct equivalent', autoFix: false },
  { atlasId: 'PG311', atlasName: 'Access method change rewrites the table', mpId: null, mpName: 'No direct equivalent', autoFix: false },
];

const atlasMapped = ruleMapping.filter((r) => r.mpId).length;
/* Rules with no Atlas counterpart, derived so the two numbers cannot drift. */
const beyondAtlas = rules.length - atlasMapped;

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
    <>
      <Navbar />
      <main className="pt-14">
        {/* Hero */}
        <section className="mp-container pt-16 md:pt-20 pb-16">
          <div className="max-w-4xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-warn-soft border border-warn/30 text-warn text-sm mb-6">
              Atlas dropped free migration linting entirely
            </div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
              Switch from Atlas to MigrationPilot
            </h1>
            <p className="text-xl text-muted max-w-2xl mb-8">
              MigrationPilot covers {atlasMapped} of the {ruleMapping.length} PostgreSQL checks Atlas
              documents, and adds {beyondAtlas} more. Free and open source: Atlas dropped lint from the
              Community Edition, and MigrationPilot never had a paid tier for it.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <CommandBlock command="npx migrationpilot analyze migrations/" />
              <ButtonLink href="https://github.com/mickelsamuel/migrationpilot">
                View on GitHub
              </ButtonLink>
            </div>
          </div>
        </section>

        {/* Rule Mapping Table */}
        <section className="mp-container py-16">
          <div className="max-w-4xl">
            <h2 className="text-2xl font-bold mb-2">Rule-by-Rule Mapping</h2>
            <p className="text-muted mb-8">
              Atlas documents {ruleMapping.length} PostgreSQL checks, all but PG110 behind Atlas Pro.
              MigrationPilot matches {atlasMapped} of them. The {ruleMapping.length - atlasMapped} it does
              not are listed too.
            </p>
            <div className="overflow-x-auto">
              <table className="text-sm border border-line rounded-lg overflow-hidden">
                <thead>
                  <tr className="bg-raised">
                    <th className="text-left px-4 py-3 font-medium text-faint">Atlas Rule</th>
                    <th className="text-left px-4 py-3 font-medium text-faint">MigrationPilot Rule</th>
                    <th className="text-left px-4 py-3 font-medium text-faint">Auto-Fix</th>
                  </tr>
                </thead>
                <tbody>
                  {ruleMapping.map((r) => (
                    <tr key={r.atlasId} className="border-t border-line-soft hover:bg-raised/30">
                      <td className="px-4 py-3">
                        <span className="font-mono text-faint">{r.atlasId}</span>{' '}
                        <span className="text-muted">{r.atlasName}</span>
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
                      <td className="px-4 py-3">
                        {r.autoFix ? (
                          <span className="text-ok">Yes</span>
                        ) : (
                          <span className="text-faint">—</span>
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
        <section className="mp-container py-16 border-t border-line-soft">
          <div className="max-w-4xl">
            <h2 className="text-2xl font-bold mb-2">{beyondAtlas} Rules Atlas Doesn&apos;t Have</h2>
            <p className="text-muted mb-8">
              Set aside the {atlasMapped} checks both tools make and {beyondAtlas} MigrationPilot rules
              have no Atlas counterpart. Some of them:
            </p>
            <div className="grid md:grid-cols-2 gap-4">
              {uniqueRules.map((r) => (
                <a
                  key={r.id}
                  href={`/rules/${r.id.toLowerCase()}`}
                  className="border border-line rounded-lg p-4 hover:border-faint transition-colors group"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-accent text-sm">{r.id}</span>
                    <span className="text-sm text-faint">{r.name}</span>
                  </div>
                  <p className="text-muted text-sm">{r.description}</p>
                </a>
              ))}
            </div>
            <p className="text-faint text-sm mt-4">
              Plus {beyondAtlas - uniqueRules.length} more covering lock safety, data types,
              partitioning and pgvector indexes.{' '}
              <a href="/rules" className="text-accent hover:text-accent-hover">See all 112 rules</a>.
            </p>
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
                    <th className="text-center px-4 py-3 font-medium text-faint">Atlas (Free)</th>
                    <th className="text-center px-4 py-3 font-medium text-faint">Atlas (Pro)</th>
                    <th className="text-center px-4 py-3 font-medium text-accent">MigrationPilot</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { feature: 'Migration linting', atlasFree: 'PG110 only', atlasPro: '16 PG checks', mp: '112 rules (all free)' },
                    { feature: 'Auto-fix', atlasFree: '—', atlasPro: '—', mp: '20 rules' },
                    { feature: 'GitHub Action', atlasFree: 'Limited', atlasPro: 'Yes', mp: 'Free' },
                    { feature: 'PR inline annotations', atlasFree: '—', atlasPro: 'Yes', mp: 'Free' },
                    { feature: 'SARIF output', atlasFree: '—', atlasPro: '—', mp: 'Free' },
                    { feature: 'Lock type analysis', atlasFree: '—', atlasPro: '—', mp: 'Free' },
                    { feature: 'MCP Server (AI tools)', atlasFree: '—', atlasPro: '—', mp: 'Free' },
                    { feature: 'Execution plan', atlasFree: '—', atlasPro: '—', mp: 'Free' },
                    { feature: 'Schema drift detection', atlasFree: '—', atlasPro: 'Yes', mp: 'Free' },
                    { feature: 'Air-gapped mode', atlasFree: '—', atlasPro: '—', mp: 'Free' },
                    { feature: 'Config presets', atlasFree: 'atlas.hcl', atlasPro: 'atlas.hcl', mp: '5 YAML presets' },
                    { feature: 'Price', atlasFree: '$0', atlasPro: 'Custom', mp: '$0 (all 112 rules free)' },
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

        {/* Migration Steps */}
        <section className="mp-container py-16 border-t border-line-soft">
          <div className="max-w-4xl">
            <h2 className="text-2xl font-bold mb-8">Migrate in 2 Minutes</h2>
            <div className="space-y-6">
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-accent text-accent-ink flex items-center justify-center font-bold text-sm shrink-0">1</div>
                <div className="min-w-0">
                  <h3 className="font-semibold mb-1">Remove Atlas lint config</h3>
                  <p className="text-muted text-sm mb-2">
                    Delete the <code className="bg-raised px-1.5 py-0.5 rounded text-muted">lint</code> block from your <code className="bg-raised px-1.5 py-0.5 rounded text-muted">atlas.hcl</code> file.
                    Keep Atlas for schema management if you want — MigrationPilot only handles linting.
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-accent text-accent-ink flex items-center justify-center font-bold text-sm shrink-0">2</div>
                <div className="min-w-0">
                  <h3 className="font-semibold mb-1">Add MigrationPilot to CI</h3>
                  <CodeBlock code={`# .github/workflows/migration-lint.yml
name: Lint Migrations
on: pull_request
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: mickelsamuel/migrationpilot@v1
        with:
          path: migrations/`} />
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-accent text-accent-ink flex items-center justify-center font-bold text-sm shrink-0">3</div>
                <div className="min-w-0">
                  <h3 className="font-semibold mb-1">Optional: Configure rules</h3>
                  <CodeBlock code={`# .migrationpilotrc.yml
extends: recommended
pgVersion: 16
exclude:
  - MP008  # Allow multi-DDL transactions`} />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="mp-container py-20 border-t border-line-soft">
          <div className="max-w-3xl">
            <h2 className="text-3xl font-bold mb-4">
              Free migration linting shouldn&apos;t require a paid plan
            </h2>
            <p className="text-muted mb-8">
              112 safety rules. 20 auto-fixes. GitHub Action with inline annotations.
              Open source, no signup, no paid tier for linting.
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

        {/* Footer */}
      </main>
      <Footer />
    </>
  );
}
