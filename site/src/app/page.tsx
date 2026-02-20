'use client';

import { useState } from 'react';

export default function Home() {
  return (
    <main>
      <Nav />
      <Hero />
      <Demo />
      <Features />
      <Rules />
      <Pricing />
      <CTA />
      <Footer />
    </main>
  );
}

function Nav() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="fixed top-0 w-full z-50 border-b border-slate-800/50 bg-slate-950/80 backdrop-blur-xl">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
        <a href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-sm">MP</div>
          <span className="font-semibold text-lg">MigrationPilot</span>
        </a>
        <div className="hidden md:flex items-center gap-8 text-sm text-slate-400">
          <a href="/docs" className="hover:text-white transition-colors">Docs</a>
          <a href="#features" className="hover:text-white transition-colors">Features</a>
          <a href="#rules" className="hover:text-white transition-colors">Rules</a>
          <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
          <a href="https://github.com/mickelsamuel/migrationpilot" className="hover:text-white transition-colors">GitHub</a>
        </div>
        <a
          href="#pricing"
          className="hidden md:inline-flex items-center px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 transition-colors"
        >
          Get Started
        </a>
        <button
          onClick={() => setOpen(!open)}
          className="md:hidden flex flex-col gap-1.5 p-2 -mr-2"
          aria-label="Toggle menu"
        >
          <span className={`block w-5 h-0.5 bg-slate-300 transition-transform ${open ? 'rotate-45 translate-y-2' : ''}`} />
          <span className={`block w-5 h-0.5 bg-slate-300 transition-opacity ${open ? 'opacity-0' : ''}`} />
          <span className={`block w-5 h-0.5 bg-slate-300 transition-transform ${open ? '-rotate-45 -translate-y-2' : ''}`} />
        </button>
      </div>
      {open && (
        <div className="md:hidden border-t border-slate-800/50 bg-slate-950/95 backdrop-blur-xl px-6 py-4 space-y-3">
          <a href="/docs" onClick={() => setOpen(false)} className="block text-sm text-slate-400 hover:text-white transition-colors">Docs</a>
          <a href="#features" onClick={() => setOpen(false)} className="block text-sm text-slate-400 hover:text-white transition-colors">Features</a>
          <a href="#rules" onClick={() => setOpen(false)} className="block text-sm text-slate-400 hover:text-white transition-colors">Rules</a>
          <a href="#pricing" onClick={() => setOpen(false)} className="block text-sm text-slate-400 hover:text-white transition-colors">Pricing</a>
          <a href="https://github.com/mickelsamuel/migrationpilot" className="block text-sm text-slate-400 hover:text-white transition-colors">GitHub</a>
          <a href="#pricing" onClick={() => setOpen(false)} className="block text-sm text-center mt-2 px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-500 transition-colors">Get Started</a>
        </div>
      )}
    </nav>
  );
}

function Hero() {
  return (
    <section className="pt-32 pb-20 px-6">
      <div className="max-w-4xl mx-auto text-center">
        <div className="inline-flex items-center px-3 py-1 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-400 text-sm mb-6">
          v1.4.0 — 80 rules, VS Code extension, expand-contract templates
        </div>
        <h1 className="text-5xl md:text-6xl font-bold tracking-tight leading-tight">
          Know what your migration
          <br />
          <span className="text-blue-500">will do to production</span>
        </h1>
        <p className="mt-6 text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed">
          80 safety rules powered by the real PostgreSQL parser. Lock analysis, risk scoring,
          auto-fix, and safe alternatives — all without touching your database.
          Works as a CLI, GitHub Action, and Node.js library.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
          <a
            href="#pricing"
            className="inline-flex items-center justify-center px-6 py-3 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-500 transition-colors text-lg"
          >
            Get Started Free
          </a>
          <a
            href="https://github.com/mickelsamuel/migrationpilot"
            className="inline-flex items-center justify-center px-6 py-3 rounded-lg border border-slate-700 text-slate-300 font-medium hover:bg-slate-800 transition-colors text-lg"
          >
            View on GitHub
          </a>
        </div>
        <div className="mt-8 max-w-xl mx-auto">
          <div className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 flex items-center justify-between gap-3">
            <code className="text-sm font-mono text-slate-300 truncate">npx migrationpilot analyze migrations/*.sql</code>
            <button
              onClick={() => navigator.clipboard.writeText('npx migrationpilot analyze migrations/*.sql')}
              className="shrink-0 text-slate-500 hover:text-slate-300 transition-colors p-1"
              aria-label="Copy to clipboard"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
          </div>
        </div>
        <p className="mt-4 text-sm text-slate-500">80 rules (77 free). Pro adds production context.</p>
      </div>
    </section>
  );
}

function Demo() {
  return (
    <section className="py-16 px-6">
      <div className="max-w-4xl mx-auto">
        <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden shadow-2xl">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800 bg-slate-900/50">
            <div className="w-3 h-3 rounded-full bg-red-500/60" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
            <div className="w-3 h-3 rounded-full bg-green-500/60" />
            <span className="ml-2 text-xs text-slate-500 font-mono">migrationpilot analyze 002_alter_users.sql</span>
          </div>
          <pre className="p-6 text-sm font-mono text-slate-300 overflow-x-auto leading-relaxed">
{`  MigrationPilot — migrations/002_alter_users.sql

  Risk:  `}<span className="bg-red-600 text-white px-2 py-0.5 rounded font-bold text-xs">RED</span>{`  Score: 80/100

  ┌───┬────────────────────────────────────────┬──────────────────┬────────┬───────┐
  │ # │ Statement                              │ Lock Type        │ Risk   │ Long? │
  ├───┼────────────────────────────────────────┼──────────────────┼────────┼───────┤
  │ 1 │ CREATE INDEX idx_users_email ON us...  │ SHARE            │ `}<span className="text-red-400">RED</span>{`    │ `}<span className="text-red-400">YES</span>{`   │
  │ 2 │ ALTER TABLE users ADD CONSTRAINT u...  │ ACCESS EXCLUSIVE │ `}<span className="text-red-400">RED</span>{`    │ `}<span className="text-red-400">YES</span>{`   │
  └───┴────────────────────────────────────────┴──────────────────┴────────┴───────┘

  Violations:

  `}<span className="text-red-400">✗ [MP001] CRITICAL</span>{`
    CREATE INDEX blocks writes on "users". Use CREATE INDEX CONCURRENTLY.
    Why: Blocks all INSERT/UPDATE/DELETE for the entire duration of index creation.
    `}<span className="text-green-400">Safe alternative:</span>{`
    `}<span className="text-slate-500">CREATE INDEX CONCURRENTLY idx_users_email ON users (email);</span>{`

  `}<span className="text-red-400">✗ [MP027] CRITICAL</span>{`
    UNIQUE constraint without USING INDEX scans full table under ACCESS EXCLUSIVE.

  `}<span className="text-yellow-400">⚠ [MP004] WARNING</span>{`
    No SET lock_timeout before DDL on "users".
    `}<span className="text-slate-500">Auto-fixable: run with --fix</span>{`

  80 rules checked in 23ms`}
          </pre>
        </div>
      </div>
    </section>
  );
}

function Features() {
  const features = [
    {
      icon: '🔒',
      title: 'Lock Analysis',
      description: 'Know exactly which PostgreSQL lock each DDL statement acquires — SHARE through ACCESS EXCLUSIVE — and whether it blocks reads, writes, or both.',
    },
    {
      icon: '🛡️',
      title: '80 Safety Rules',
      description: 'From missing CONCURRENTLY to type narrowing. Catches the patterns that cause production outages. More rules than any competitor.',
    },
    {
      icon: '🔧',
      title: 'Auto-fix',
      description: '12 rules can be automatically fixed with --fix. Missing CONCURRENTLY, lock_timeout, statement_timeout, NOT VALID, IF NOT EXISTS, VARCHAR→TEXT, TIMESTAMP→TIMESTAMPTZ — applied in-place.',
    },
    {
      icon: '📊',
      title: 'Risk Scoring',
      description: 'RED / YELLOW / GREEN scores (0-100) based on lock severity, table size, and query frequency. Production context powers Pro scoring.',
    },
    {
      icon: '🤖',
      title: 'GitHub Action',
      description: 'Posts safety reports as PR comments. Auto-updates on each push. SARIF output for GitHub Code Scanning integration.',
    },
    {
      icon: '🔍',
      title: '14 Framework Detection',
      description: 'Auto-detects Prisma, Django, Rails, Flyway, Alembic, Knex, TypeORM, Drizzle, Sequelize, goose, dbmate, Sqitch, Liquibase, Ecto.',
    },
    {
      icon: '👁️',
      title: 'Watch Mode',
      description: 'Watch migration files and re-analyze on change. Plus git pre-commit hook integration for catching issues before they leave your machine.',
    },
    {
      icon: '⚙️',
      title: 'Config + Presets',
      description: '5 built-in presets (recommended, strict, ci, startup, enterprise). Per-rule severity overrides, custom thresholds, inline disable comments, .migrationpilotrc.yml.',
    },
    {
      icon: '📋',
      title: '6 Output Formats',
      description: 'Text, JSON (versioned schema), SARIF v2.1.0, Markdown, quiet (gcc-style), verbose. Pipe from stdin, output to any CI system.',
    },
  ];

  return (
    <section id="features" className="py-20 px-6">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-4">Everything you need for safe migrations</h2>
        <p className="text-slate-400 text-center mb-16 max-w-2xl mx-auto">
          Static analysis powered by the real PostgreSQL parser (libpg-query). No regex heuristics. PG-version-aware advice.
        </p>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f) => (
            <div key={f.title} className="p-6 rounded-xl border border-slate-800 bg-slate-900/50 hover:border-slate-700 transition-colors">
              <div className="text-3xl mb-4">{f.icon}</div>
              <h3 className="text-lg font-semibold mb-2">{f.title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{f.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Rules() {
  const ruleCategories = [
    {
      title: 'Lock Safety',
      rules: [
        { id: 'MP001', name: 'require-concurrent-index', desc: 'CREATE INDEX without CONCURRENTLY', severity: 'critical' },
        { id: 'MP002', name: 'require-check-not-null', desc: 'SET NOT NULL without CHECK pattern', severity: 'critical' },
        { id: 'MP003', name: 'volatile-default-rewrite', desc: 'ADD COLUMN with volatile DEFAULT', severity: 'critical' },
        { id: 'MP004', name: 'require-lock-timeout', desc: 'DDL without SET lock_timeout', severity: 'critical' },
        { id: 'MP005', name: 'require-not-valid-fk', desc: 'FK without NOT VALID', severity: 'critical' },
        { id: 'MP006', name: 'no-vacuum-full', desc: 'VACUUM FULL blocks everything', severity: 'critical' },
        { id: 'MP007', name: 'no-column-type-change', desc: 'ALTER COLUMN TYPE rewrites table', severity: 'critical' },
        { id: 'MP008', name: 'no-multi-ddl-transaction', desc: 'Multiple DDL in one transaction', severity: 'critical' },
        { id: 'MP025', name: 'ban-concurrent-in-transaction', desc: 'CONCURRENTLY inside transaction', severity: 'critical' },
        { id: 'MP026', name: 'ban-drop-table', desc: 'DROP TABLE permanently', severity: 'critical' },
        { id: 'MP027', name: 'disallowed-unique-constraint', desc: 'UNIQUE without USING INDEX', severity: 'critical' },
        { id: 'MP030', name: 'require-not-valid-check', desc: 'CHECK without NOT VALID', severity: 'critical' },
        { id: 'MP031', name: 'ban-exclusion-constraint', desc: 'EXCLUSION constraint', severity: 'critical' },
        { id: 'MP032', name: 'ban-cluster', desc: 'CLUSTER rewrites table', severity: 'critical' },
        { id: 'MP046', name: 'concurrent-detach-partition', desc: 'DETACH PARTITION without CONCURRENTLY', severity: 'critical' },
        { id: 'MP047', name: 'ban-set-logged-unlogged', desc: 'SET LOGGED/UNLOGGED rewrites table', severity: 'critical' },
        { id: 'MP049', name: 'require-partition-key-in-pk', desc: 'PK missing partition key column', severity: 'critical' },
        { id: 'MP062', name: 'ban-add-generated-stored', desc: 'GENERATED STORED rewrites table', severity: 'critical' },
        { id: 'MP069', name: 'warn-fk-lock-both-tables', desc: 'FK locks both parent and child', severity: 'critical' },
        { id: 'MP071', name: 'ban-rename-in-use-column', desc: 'Rename column used by views/indexes', severity: 'critical' },
        { id: 'MP074', name: 'require-deferrable-fk', desc: 'FK without DEFERRABLE', severity: 'warning' },
      ],
    },
    {
      title: 'Data Safety',
      rules: [
        { id: 'MP034', name: 'ban-drop-database', desc: 'DROP DATABASE in migration', severity: 'critical' },
        { id: 'MP035', name: 'ban-drop-schema', desc: 'DROP SCHEMA permanently', severity: 'critical' },
        { id: 'MP036', name: 'ban-truncate-cascade', desc: 'TRUNCATE CASCADE across tables', severity: 'critical' },
        { id: 'MP064', name: 'ban-disable-trigger', desc: 'DISABLE TRIGGER breaks replication', severity: 'critical' },
        { id: 'MP065', name: 'ban-lock-table', desc: 'LOCK TABLE blocks queries', severity: 'critical' },
        { id: 'MP073', name: 'ban-superuser-role', desc: 'SUPERUSER role in migration', severity: 'critical' },
        { id: 'MP080', name: 'ban-data-in-migration', desc: 'Data changes in schema migration', severity: 'critical' },
      ],
    },
    {
      title: 'Best Practices',
      rules: [
        { id: 'MP009', name: 'require-drop-index-concurrently', desc: 'DROP INDEX without CONCURRENTLY', severity: 'warning' },
        { id: 'MP010', name: 'no-rename-column', desc: 'RENAME COLUMN breaks queries', severity: 'warning' },
        { id: 'MP011', name: 'unbatched-backfill', desc: 'UPDATE without WHERE', severity: 'warning' },
        { id: 'MP012', name: 'no-enum-add-in-transaction', desc: 'ADD VALUE inside transaction', severity: 'warning' },
        { id: 'MP015', name: 'no-add-column-serial', desc: 'SERIAL → use IDENTITY', severity: 'warning' },
        { id: 'MP016', name: 'require-fk-index', desc: 'FK without index', severity: 'warning' },
        { id: 'MP017', name: 'no-drop-column', desc: 'DROP COLUMN risks', severity: 'warning' },
        { id: 'MP018', name: 'no-force-set-not-null', desc: 'SET NOT NULL scan', severity: 'warning' },
        { id: 'MP020', name: 'require-statement-timeout', desc: 'DDL without timeout', severity: 'warning' },
        { id: 'MP021', name: 'require-concurrent-reindex', desc: 'REINDEX without CONCURRENTLY', severity: 'warning' },
        { id: 'MP022', name: 'no-drop-cascade', desc: 'CASCADE drops dependents', severity: 'warning' },
        { id: 'MP023', name: 'require-if-not-exists', desc: 'Non-idempotent CREATE', severity: 'warning' },
        { id: 'MP024', name: 'no-enum-value-removal', desc: 'DROP TYPE destroys enum', severity: 'warning' },
        { id: 'MP028', name: 'no-rename-table', desc: 'RENAME TABLE breaks refs', severity: 'warning' },
        { id: 'MP029', name: 'ban-drop-not-null', desc: 'DROP NOT NULL risks', severity: 'warning' },
        { id: 'MP033', name: 'concurrent-refresh-matview', desc: 'REFRESH without CONCURRENTLY', severity: 'warning' },
        { id: 'MP037', name: 'prefer-text-over-varchar', desc: 'VARCHAR → use TEXT', severity: 'warning' },
        { id: 'MP038', name: 'prefer-bigint-over-int', desc: 'INT PK → use BIGINT', severity: 'warning' },
        { id: 'MP039', name: 'prefer-identity-over-serial', desc: 'SERIAL → use IDENTITY', severity: 'warning' },
        { id: 'MP040', name: 'prefer-timestamptz', desc: 'TIMESTAMP → use TIMESTAMPTZ', severity: 'warning' },
        { id: 'MP041', name: 'ban-char-field', desc: 'CHAR(n) wastes space', severity: 'warning' },
        { id: 'MP042', name: 'require-index-name', desc: 'Unnamed index', severity: 'warning' },
        { id: 'MP043', name: 'ban-domain-constraint', desc: 'Domain constraint risk', severity: 'warning' },
        { id: 'MP044', name: 'no-data-loss-type-narrowing', desc: 'Narrowing column type', severity: 'warning' },
        { id: 'MP045', name: 'require-primary-key', desc: 'Table without PK', severity: 'warning' },
        { id: 'MP048', name: 'ban-alter-default-volatile', desc: 'Volatile SET DEFAULT', severity: 'warning' },
        { id: 'MP050', name: 'prefer-hnsw-over-ivfflat', desc: 'IVFFlat → use HNSW', severity: 'warning' },
        { id: 'MP051', name: 'require-spatial-index', desc: 'Geometry column without GIST', severity: 'warning' },
        { id: 'MP052', name: 'warn-dependent-objects', desc: 'DROP/ALTER breaks views/functions', severity: 'warning' },
        { id: 'MP053', name: 'ban-uncommitted-transaction', desc: 'BEGIN without COMMIT', severity: 'warning' },
        { id: 'MP054', name: 'alter-type-add-value-in-txn', desc: 'ADD VALUE in transaction', severity: 'warning' },
        { id: 'MP055', name: 'drop-pk-replica-identity', desc: 'DROP PK breaks replication', severity: 'warning' },
        { id: 'MP056', name: 'gin-index-jsonb', desc: 'Missing GIN index for JSONB', severity: 'warning' },
        { id: 'MP057', name: 'rls-without-policy', desc: 'RLS enabled without policy', severity: 'warning' },
        { id: 'MP058', name: 'multi-alter-table', desc: 'Multiple ALTER TABLE on same table', severity: 'warning' },
        { id: 'MP059', name: 'sequence-not-reset', desc: 'Sequence not reset after import', severity: 'warning' },
        { id: 'MP060', name: 'alter-type-rename-value', desc: 'RENAME VALUE holds ACCESS EXCLUSIVE', severity: 'warning' },
        { id: 'MP061', name: 'suboptimal-column-order', desc: 'Column order wastes alignment', severity: 'warning' },
        { id: 'MP063', name: 'warn-do-block-ddl', desc: 'DDL inside DO $$ block', severity: 'warning' },
        { id: 'MP066', name: 'warn-autovacuum-disabled', desc: 'Autovacuum disabled on table', severity: 'warning' },
        { id: 'MP067', name: 'warn-backfill-no-batching', desc: 'Backfill without batching', severity: 'warning' },
        { id: 'MP068', name: 'warn-integer-pk-capacity', desc: 'Integer PK nearing overflow', severity: 'warning' },
        { id: 'MP070', name: 'warn-concurrent-index-invalid', desc: 'CONCURRENTLY can leave invalid index', severity: 'warning' },
        { id: 'MP072', name: 'warn-partition-default-scan', desc: 'Partition default scans all rows', severity: 'warning' },
        { id: 'MP075', name: 'warn-toast-bloat-risk', desc: 'TOAST table bloat risk', severity: 'warning' },
        { id: 'MP076', name: 'warn-xid-consuming-retry', desc: 'Retry loop consuming XIDs', severity: 'warning' },
        { id: 'MP077', name: 'prefer-lz4-toast-compression', desc: 'Use LZ4 over PGLZ for TOAST', severity: 'warning' },
        { id: 'MP078', name: 'warn-extension-version-pin', desc: 'Extension version not pinned', severity: 'warning' },
        { id: 'MP079', name: 'warn-rls-policy-completeness', desc: 'RLS policy missing operations', severity: 'warning' },
      ],
    },
    {
      title: 'Production Context',
      rules: [
        { id: 'MP013', name: 'high-traffic-table-ddl', desc: 'DDL on high-traffic table', severity: 'pro' },
        { id: 'MP014', name: 'large-table-ddl', desc: 'Lock on 1M+ row table', severity: 'pro' },
        { id: 'MP019', name: 'exclusive-lock-connections', desc: 'ACCESS EXCLUSIVE + many connections', severity: 'pro' },
      ],
    },
  ];

  return (
    <section id="rules" className="py-20 px-6 border-t border-slate-800/50">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-4">80 rules. Zero false positives.</h2>
        <p className="text-slate-400 text-center mb-12 max-w-2xl mx-auto">
          Built from real production incidents. More free rules than Squawk (31) and Atlas (~15).
          Every rule catches a specific dangerous pattern.
        </p>
        {ruleCategories.map((cat) => (
          <div key={cat.title} className="mb-8">
            <h3 className="text-lg font-semibold mb-3 text-slate-300">{cat.title}</h3>
            <div className="space-y-1.5">
              {cat.rules.map((r) => (
                <a key={r.id} href={`/rules/${r.id.toLowerCase()}`} className="flex items-center gap-4 px-4 py-2.5 rounded-lg border border-slate-800 bg-slate-900/30 hover:bg-slate-900/60 hover:border-slate-700 transition-colors group">
                  <span className="font-mono text-sm text-slate-500 w-14">{r.id}</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                    r.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                    r.severity === 'warning' ? 'bg-yellow-500/20 text-yellow-400' :
                    'bg-blue-500/20 text-blue-400'
                  }`}>
                    {r.severity === 'pro' ? 'PRO' : r.severity.toUpperCase()}
                  </span>
                  <span className="text-sm font-medium flex-1 group-hover:text-blue-400 transition-colors">{r.name}</span>
                  <span className="text-sm text-slate-500 hidden sm:block">{r.desc}</span>
                  <svg className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-colors shrink-0 hidden sm:block" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Pricing() {
  const [annual, setAnnual] = useState(false);

  const tiers = [
    {
      name: 'Free',
      price: '$0',
      period: 'forever',
      description: 'Static analysis for every team',
      features: [
        '77 safety rules',
        'CLI + GitHub Action',
        '3 production analyses / month',
        '6 output formats (text, JSON, SARIF, markdown)',
        'Auto-fix (12 rules)',
        'PR comments',
        'Config file + 5 presets',
        'Watch mode + pre-commit hooks',
        '14 framework auto-detection',
      ],
      cta: 'Get Started',
      ctaLink: 'https://github.com/mickelsamuel/migrationpilot',
      highlighted: false,
    },
    {
      name: 'Pro',
      price: annual ? '$16' : '$19',
      period: annual ? '/mo billed annually' : '/month',
      description: 'Production context for critical apps',
      features: [
        'Everything in Free',
        'Unlimited production analyses',
        'Production context queries (pg_stat_*, pg_class)',
        'Table size + query frequency scoring',
        '3 production rules (MP013, MP014, MP019)',
        'Affected queries in PR comments',
        'Enhanced risk scoring (0-100)',
        'Priority support',
      ],
      cta: 'Start 14-Day Free Trial',
      ctaLink: `/checkout?tier=pro${annual ? '&interval=annual' : ''}`,
      highlighted: true,
    },
    {
      name: 'Team',
      price: annual ? '$42' : '$49',
      period: annual ? '/mo billed annually' : '/month',
      description: 'For growing teams with shared workflows',
      features: [
        'Everything in Pro',
        'Up to 10 seats',
        'Team license management',
        'Custom rules engine (plugin API)',
        'Shareable config presets',
        'Audit logging',
        'Priority email support',
      ],
      cta: 'Start Team Trial',
      ctaLink: `/checkout?tier=team${annual ? '&interval=annual' : ''}`,
      highlighted: false,
    },
    {
      name: 'Enterprise',
      price: 'Custom',
      period: '',
      description: 'For large teams and compliance',
      features: [
        'Everything in Team',
        'Unlimited seats',
        'SSO / SAML',
        'Air-gapped deployment',
        'Dedicated support engineer',
        'Custom integrations',
        'SLA with guaranteed response times',
      ],
      cta: 'Contact Sales',
      ctaLink: 'mailto:hello@migrationpilot.dev?subject=Enterprise%20Inquiry',
      highlighted: false,
    },
  ];

  return (
    <section id="pricing" className="py-20 px-6 border-t border-slate-800/50">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-4">Simple, transparent pricing</h2>
        <p className="text-slate-400 text-center mb-8">
          80 rules (77 free). Pro when you need production context.
        </p>
        <div className="flex items-center justify-center gap-3 mb-16">
          <span className={`text-sm ${!annual ? 'text-white font-medium' : 'text-slate-400'}`}>Monthly</span>
          <button
            onClick={() => setAnnual(!annual)}
            className={`relative w-12 h-6 rounded-full transition-colors ${annual ? 'bg-blue-600' : 'bg-slate-700'}`}
            aria-label="Toggle annual billing"
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${annual ? 'translate-x-6' : ''}`} />
          </button>
          <span className={`text-sm ${annual ? 'text-white font-medium' : 'text-slate-400'}`}>Annual</span>
          {annual && <span className="text-xs text-green-400 font-medium ml-1">Save 17%</span>}
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className={`rounded-xl border p-8 flex flex-col ${
                tier.highlighted
                  ? 'border-blue-500 bg-blue-500/5 ring-1 ring-blue-500/20'
                  : 'border-slate-800 bg-slate-900/30'
              }`}
            >
              <h3 className="text-xl font-semibold">{tier.name}</h3>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-bold">{tier.price}</span>
                {tier.period && <span className="text-slate-400">{tier.period}</span>}
              </div>
              <p className="mt-2 text-sm text-slate-400">{tier.description}</p>
              <ul className="mt-8 space-y-3 flex-1">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <svg className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
              <a
                href={tier.ctaLink}
                className={`mt-8 inline-flex items-center justify-center px-6 py-3 rounded-lg font-medium text-sm transition-colors ${
                  tier.highlighted
                    ? 'bg-blue-600 text-white hover:bg-blue-500'
                    : 'border border-slate-700 text-slate-300 hover:bg-slate-800'
                }`}
              >
                {tier.cta}
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section className="py-20 px-6">
      <div className="max-w-3xl mx-auto text-center">
        <h2 className="text-3xl font-bold mb-4">Stop shipping dangerous migrations</h2>
        <p className="text-slate-400 mb-8 text-lg">
          Add MigrationPilot to your CI in 30 seconds. 80 rules catch lock issues before they reach production.
        </p>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 text-left max-w-xl mx-auto">
          <pre className="font-mono text-sm text-slate-300 overflow-x-auto">
{`# .github/workflows/migration-check.yml
- uses: mickelsamuel/migrationpilot@v1
  with:
    migration-path: "migrations/*.sql"
    fail-on: critical`}
          </pre>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-slate-800/50 py-12 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 rounded bg-blue-600 flex items-center justify-center font-bold text-xs">MP</div>
              <span className="text-sm font-semibold">MigrationPilot</span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              PostgreSQL migration safety for teams that ship.
            </p>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-300 mb-3">Product</h4>
            <ul className="space-y-2 text-sm text-slate-500">
              <li><a href="#features" className="hover:text-slate-300 transition-colors">Features</a></li>
              <li><a href="#rules" className="hover:text-slate-300 transition-colors">Rules</a></li>
              <li><a href="#pricing" className="hover:text-slate-300 transition-colors">Pricing</a></li>
              <li><a href="https://www.npmjs.com/package/migrationpilot" className="hover:text-slate-300 transition-colors">npm</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-300 mb-3">Resources</h4>
            <ul className="space-y-2 text-sm text-slate-500">
              <li><a href="https://github.com/mickelsamuel/migrationpilot" className="hover:text-slate-300 transition-colors">GitHub</a></li>
              <li><a href="https://github.com/mickelsamuel/migrationpilot/blob/main/CHANGELOG.md" className="hover:text-slate-300 transition-colors">Changelog</a></li>
              <li><a href="https://github.com/mickelsamuel/migrationpilot/blob/main/CONTRIBUTING.md" className="hover:text-slate-300 transition-colors">Contributing</a></li>
              <li><a href="https://github.com/mickelsamuel/migrationpilot/issues" className="hover:text-slate-300 transition-colors">Issues</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-300 mb-3">Company</h4>
            <ul className="space-y-2 text-sm text-slate-500">
              <li><a href="mailto:hello@migrationpilot.dev" className="hover:text-slate-300 transition-colors">Contact</a></li>
              <li><a href="https://github.com/mickelsamuel/migrationpilot/blob/main/SECURITY.md" className="hover:text-slate-300 transition-colors">Security</a></li>
              <li><a href="https://github.com/mickelsamuel/migrationpilot/blob/main/LICENSE" className="hover:text-slate-300 transition-colors">MIT License</a></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-slate-800/50 pt-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-slate-600">&copy; 2026 MigrationPilot. All rights reserved.</p>
          <p className="text-xs text-slate-600">Made in Montreal</p>
        </div>
      </div>
    </footer>
  );
}
