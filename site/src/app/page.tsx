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
  return (
    <nav className="fixed top-0 w-full z-50 border-b border-slate-800/50 bg-slate-950/80 backdrop-blur-xl">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
        <a href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-sm">MP</div>
          <span className="font-semibold text-lg">MigrationPilot</span>
        </a>
        <div className="hidden md:flex items-center gap-8 text-sm text-slate-400">
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
      </div>
    </nav>
  );
}

function Hero() {
  return (
    <section className="pt-32 pb-20 px-6">
      <div className="max-w-4xl mx-auto text-center">
        <div className="inline-flex items-center px-3 py-1 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-400 text-sm mb-6">
          v0.3.0 — Now with SARIF output
        </div>
        <h1 className="text-5xl md:text-6xl font-bold tracking-tight leading-tight">
          Know what your migration
          <br />
          <span className="text-blue-500">will do to production</span>
        </h1>
        <p className="mt-6 text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed">
          MigrationPilot analyzes PostgreSQL DDL for lock types, risk scores, and safe alternatives.
          Catch dangerous migrations in CI before they hit production.
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
        <p className="mt-4 text-sm text-slate-500">Free for static analysis. Pro for production context.</p>
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

  Risk:  `}<span className="bg-yellow-600 text-black px-2 py-0.5 rounded font-bold text-xs">YELLOW</span>{`  Score: 40/100

  ┌───┬───────────────────────────────────────┬──────────────────┬────────┬───────┐
  │ # │ Statement                             │ Lock Type        │ Risk   │ Long? │
  ├───┼───────────────────────────────────────┼──────────────────┼────────┼───────┤
  │ 1 │ CREATE INDEX idx_users_email ON us... │ SHARE            │ `}<span className="text-yellow-400">YELLOW</span>{` │ `}<span className="text-red-400">YES</span>{`   │
  └───┴───────────────────────────────────────┴──────────────────┴────────┴───────┘

  Violations:

  `}<span className="text-red-400">✗ [MP001] CRITICAL</span>{`
    CREATE INDEX blocks writes on "users". Use CREATE INDEX CONCURRENTLY.

    `}<span className="text-green-400">Safe alternative:</span>{`
    `}<span className="text-slate-500">CREATE INDEX CONCURRENTLY idx_users_email ON users (email);</span>{`

  `}<span className="text-yellow-400">⚠ [MP004] WARNING</span>{`
    No SET lock_timeout before DDL on "users".`}
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
      description: 'Know exactly which PostgreSQL lock each DDL statement acquires — ACCESS SHARE through ACCESS EXCLUSIVE.',
    },
    {
      icon: '📊',
      title: 'Risk Scoring',
      description: 'RED / YELLOW / GREEN scores based on lock severity, table size, and query frequency (Pro).',
    },
    {
      icon: '🛡️',
      title: '14 Safety Rules',
      description: 'From missing CONCURRENTLY to unbatched backfills. Catches the patterns that cause production outages.',
    },
    {
      icon: '🔄',
      title: 'Safe Alternatives',
      description: 'Every violation comes with a safe rewrite. Copy-paste the fix directly into your migration.',
    },
    {
      icon: '🤖',
      title: 'GitHub Action',
      description: 'Posts safety reports as PR comments. Auto-updates on each push. Blocks merges on critical violations.',
    },
    {
      icon: '📋',
      title: 'SARIF Output',
      description: 'GitHub Code Scanning integration. Violations appear as inline annotations on your PR diff.',
    },
  ];

  return (
    <section id="features" className="py-20 px-6">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-4">Everything you need for safe migrations</h2>
        <p className="text-slate-400 text-center mb-16 max-w-2xl mx-auto">
          Static analysis powered by the real PostgreSQL parser. No regex heuristics.
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
  const rules = [
    { id: 'MP001', name: 'require-concurrent-index', desc: 'CREATE INDEX without CONCURRENTLY', severity: 'critical' },
    { id: 'MP002', name: 'require-check-not-null', desc: 'SET NOT NULL without CHECK constraint', severity: 'critical' },
    { id: 'MP003', name: 'volatile-default-rewrite', desc: 'ADD COLUMN with volatile DEFAULT', severity: 'critical' },
    { id: 'MP004', name: 'require-lock-timeout', desc: 'DDL without SET lock_timeout', severity: 'critical' },
    { id: 'MP005', name: 'require-not-valid-fk', desc: 'FK constraint without NOT VALID', severity: 'critical' },
    { id: 'MP006', name: 'no-vacuum-full', desc: 'VACUUM FULL blocks everything', severity: 'critical' },
    { id: 'MP007', name: 'no-column-type-change', desc: 'ALTER COLUMN TYPE rewrites table', severity: 'critical' },
    { id: 'MP008', name: 'no-multi-ddl-transaction', desc: 'Multiple DDL in one transaction', severity: 'critical' },
    { id: 'MP009', name: 'require-drop-index-concurrently', desc: 'DROP INDEX without CONCURRENTLY', severity: 'warning' },
    { id: 'MP010', name: 'no-rename-column', desc: 'RENAME COLUMN breaks queries', severity: 'warning' },
    { id: 'MP011', name: 'unbatched-data-backfill', desc: 'UPDATE without WHERE clause', severity: 'warning' },
    { id: 'MP012', name: 'no-enum-add-in-transaction', desc: 'ALTER TYPE ADD VALUE in transaction', severity: 'warning' },
    { id: 'MP013', name: 'high-traffic-table-ddl', desc: 'DDL on high-traffic table', severity: 'pro' },
    { id: 'MP014', name: 'large-table-ddl', desc: 'Long lock on 1M+ row table', severity: 'pro' },
  ];

  return (
    <section id="rules" className="py-20 px-6 border-t border-slate-800/50">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-4">14 rules. Zero false positives.</h2>
        <p className="text-slate-400 text-center mb-12 max-w-2xl mx-auto">
          Built from real production incidents. Each rule catches a specific dangerous pattern.
        </p>
        <div className="space-y-2">
          {rules.map((r) => (
            <div key={r.id} className="flex items-center gap-4 px-4 py-3 rounded-lg border border-slate-800 bg-slate-900/30 hover:bg-slate-900/60 transition-colors">
              <span className="font-mono text-sm text-slate-500 w-14">{r.id}</span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                r.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                r.severity === 'warning' ? 'bg-yellow-500/20 text-yellow-400' :
                'bg-blue-500/20 text-blue-400'
              }`}>
                {r.severity === 'pro' ? 'PRO' : r.severity.toUpperCase()}
              </span>
              <span className="text-sm font-medium flex-1">{r.name}</span>
              <span className="text-sm text-slate-500 hidden sm:block">{r.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  const tiers = [
    {
      name: 'Free',
      price: '$0',
      period: 'forever',
      description: 'Static analysis for every team',
      features: [
        '12 safety rules (MP001-MP012)',
        'CLI + GitHub Action',
        'SARIF output',
        'PR comments',
        'JSON output',
      ],
      cta: 'Get Started',
      ctaLink: 'https://github.com/mickelsamuel/migrationpilot',
      highlighted: false,
    },
    {
      name: 'Pro',
      price: '$29',
      period: '/month',
      description: 'Production context for critical apps',
      features: [
        'Everything in Free',
        'Production context queries',
        'Table size + query frequency scoring',
        'MP013-MP014 production rules',
        'Affected queries in PR comments',
        'Priority support',
      ],
      cta: 'Start Pro Trial',
      ctaLink: '/api/checkout?tier=pro',
      highlighted: true,
    },
    {
      name: 'Enterprise',
      price: 'Custom',
      period: '',
      description: 'For large teams and compliance',
      features: [
        'Everything in Pro',
        'Team license management',
        'SSO / SAML',
        'Audit logs',
        'Dedicated support',
        'Custom rules',
      ],
      cta: 'Contact Us',
      ctaLink: 'mailto:mickelsamuel.b@gmail.com',
      highlighted: false,
    },
  ];

  return (
    <section id="pricing" className="py-20 px-6 border-t border-slate-800/50">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-4">Simple, transparent pricing</h2>
        <p className="text-slate-400 text-center mb-16">
          Free for static analysis. Pro when you need production context.
        </p>
        <div className="grid md:grid-cols-3 gap-6">
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
          Add MigrationPilot to your CI in 30 seconds. Catch lock issues before they reach production.
        </p>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 text-left max-w-xl mx-auto">
          <pre className="font-mono text-sm text-slate-300 overflow-x-auto">
{`# .github/workflows/migration-check.yml
- uses: mickelsamuel/migrationpilot@v0.3.0
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
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-blue-600 flex items-center justify-center font-bold text-xs">MP</div>
          <span className="text-sm text-slate-400">MigrationPilot</span>
        </div>
        <div className="flex items-center gap-6 text-sm text-slate-500">
          <a href="https://github.com/mickelsamuel/migrationpilot" className="hover:text-slate-300 transition-colors">GitHub</a>
          <a href="mailto:mickelsamuel.b@gmail.com" className="hover:text-slate-300 transition-colors">Contact</a>
        </div>
        <p className="text-sm text-slate-600">&copy; 2026 MigrationPilot</p>
      </div>
    </footer>
  );
}
