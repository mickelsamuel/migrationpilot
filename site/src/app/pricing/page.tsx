import type { Metadata } from 'next';
import Navbar from '@/components/navbar';

export const metadata: Metadata = {
  title: 'Pricing — MigrationPilot',
  description:
    'All 83 PostgreSQL migration safety rules are free, including production context. The $499/year Org plan adds signed policy enforcement, waivers, and cross-repo audit history.',
  alternates: {
    canonical: '/pricing',
  },
  openGraph: {
    title: 'Pricing — MigrationPilot',
    description:
      'All 83 safety rules free, including production context. The Org plan adds signed policy enforcement, waivers, and cross-repo audit history for $499/year.',
    url: 'https://migrationpilot.dev/pricing',
  },
};

const ORG_CTA = 'mailto:hello@migrationpilot.dev?subject=Org%20Plan';
const ENTERPRISE_CTA = 'mailto:hello@migrationpilot.dev?subject=Enterprise%20Inquiry';

const tiers = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'The whole engine, for every team',
    features: [
      'All 83 safety rules — nothing held back',
      'Production context rules (MP013, MP014, MP019)',
      'Unlimited analyses, static and production',
      'Auto-fix (12 rules)',
      'CLI + GitHub Action',
      '6 output formats (text, JSON, SARIF, markdown, quiet, verbose)',
      'PR comments + inline annotations',
      'Config file + 5 presets',
      'Watch mode + pre-commit hooks',
      '14 framework auto-detection',
      'MCP server for AI assistants',
      'Shell completions (bash, zsh, fish)',
    ],
    cta: 'Get Started',
    ctaLink: 'https://github.com/mickelsamuel/migrationpilot',
    highlighted: false,
  },
  {
    name: 'Org',
    price: '$499',
    period: '/year per organization',
    description: 'Proof your migrations are actually governed',
    features: [
      'Everything in Free',
      'Centrally-signed policy the CLI enforces',
      'Required GitHub checks',
      'Waivers with owner, reason, and expiry',
      'Cross-repo audit history',
      'Enforcement reporting',
      'Org rule packs and severity floors',
      'Priority support',
      'Up to 10 repos / 25 developers',
    ],
    cta: 'Talk to us',
    ctaLink: ORG_CTA,
    highlighted: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    description: 'For regulated and air-gapped environments',
    features: [
      'Everything in Org',
      'Unlimited repos and developers',
      'SSO / SAML',
      'Air-gapped deployment',
      'Dedicated support engineer',
      'Custom integrations',
      'SLA with guaranteed response times',
    ],
    cta: 'Contact Sales',
    ctaLink: ENTERPRISE_CTA,
    highlighted: false,
  },
];

const comparisonRows: [string, string, string, string][] = [
  ['Safety rules', '83 (all)', '83 (all)', '83 (all)'],
  ['Production context rules', '✓', '✓', '✓'],
  ['Analyses per month', 'Unlimited', 'Unlimited', 'Unlimited'],
  ['Output formats', '6', '6', '6'],
  ['Auto-fix', '12 rules', '12 rules', '12 rules'],
  ['GitHub Action', '✓', '✓', '✓'],
  ['PR comments', '✓', '✓', '✓'],
  ['MCP server', '✓', '✓', '✓'],
  ['Watch mode + hooks', '✓', '✓', '✓'],
  ['Config presets', '5 built-in', '5 built-in + org packs', '5 built-in + org packs'],
  ['Drift detection', '✓', '✓', '✓'],
  ['Historical trends', '✓', '✓', '✓'],
  ['Centrally-signed policy', '—', '✓', '✓'],
  ['Required GitHub checks', '—', '✓', '✓'],
  ['Waivers (owner, reason, expiry)', '—', '✓', '✓'],
  ['Cross-repo audit history', '—', '✓', '✓'],
  ['Enforcement reporting', '—', '✓', '✓'],
  ['Severity floors', '—', '✓', '✓'],
  ['Repos / developers', 'Unlimited', 'Up to 10 / 25', 'Unlimited'],
  ['Priority support', '—', '✓', '✓'],
  ['SSO / SAML', '—', '—', '✓'],
  ['Air-gapped deployment', '—', '—', '✓'],
  ['SLA', '—', '—', '✓'],
  ['Dedicated support', '—', '—', '✓'],
];

const faqs = [
  {
    q: 'Which rules are free?',
    a: 'All of them. All 83 rules are free, including the three production-context rules (MP013, MP014, MP019) that read table sizes and query traffic from your database. There is no rule count behind a paywall and no analysis quota.',
  },
  {
    q: 'Then what am I paying for on the Org plan?',
    a: 'Enforcement, not detection. The engine finds problems for free. The Org plan is how an organization proves it is protected: a policy signed centrally that the CLI actually enforces, required GitHub checks, waivers that carry an owner and an expiry date, and an audit trail across every repo. If nobody has ever asked you to show that your migrations are governed, you do not need it.',
  },
  {
    q: 'What counts as a "production analysis"?',
    a: 'A production analysis is when MigrationPilot connects to your database via --database-url to gather table sizes, query traffic, and connection counts. It is unlimited and free, as is static analysis.',
  },
  {
    q: 'Is the Org plan billed monthly?',
    a: 'No. It is $499/year per organization, billed annually, covering up to 10 repositories and 25 developers. Past that, talk to us.',
  },
  {
    q: 'Can I use MigrationPilot in air-gapped environments?',
    a: 'Run with --offline to skip all network calls. License validation uses Ed25519 keys that work entirely client-side — no phone-home, no telemetry. Fully supported air-gapped deployment is an Enterprise arrangement.',
  },
  {
    q: 'Is my data safe?',
    a: 'MigrationPilot never reads your actual data. Production context queries only touch PostgreSQL system catalogs (pg_stat_*, pg_class, pg_roles). The CLI runs entirely on your infrastructure.',
  },
];

export default function PricingPage() {
  return (
    <main className="min-h-screen">
      <Navbar active="pricing" />

      {/* Hero */}
      <section className="pt-32 pb-16 px-6 text-center">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-4xl sm:text-5xl font-bold mb-6 leading-tight">
            The engine is free. All of it.
          </h1>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            All 83 rules, unlimited analyses, auto-fix, and every integration cost nothing. Pay only when
            you need to prove your organization is protected.
          </p>
        </div>
      </section>

      {/* Tiers */}
      <section className="px-6 pb-20 pt-4">
        <div className="max-w-5xl mx-auto grid md:grid-cols-3 gap-6">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className={`rounded-xl border p-8 flex flex-col ${
                tier.highlighted
                  ? 'border-blue-500 bg-blue-500/5 ring-1 ring-blue-500/20'
                  : 'border-slate-800 bg-slate-900/30'
              }`}
            >
              <h2 className="text-xl font-semibold">{tier.name}</h2>
              <div className="mt-4 flex items-baseline gap-1 flex-wrap">
                <span className="text-4xl font-bold">{tier.price}</span>
                {tier.period && <span className="text-slate-400 text-sm">{tier.period}</span>}
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
      </section>

      {/* Comparison Table */}
      <section className="py-20 px-6 border-t border-slate-800/50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">Feature comparison</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="text-left py-3 pr-4 text-slate-400 font-medium">Feature</th>
                  <th className="text-center py-3 px-4 text-slate-400 font-medium">Free</th>
                  <th className="text-center py-3 px-4 text-blue-400 font-medium">Org</th>
                  <th className="text-center py-3 px-4 text-slate-400 font-medium">Enterprise</th>
                </tr>
              </thead>
              <tbody className="text-slate-300">
                {comparisonRows.map(([feature, free, org, ent]) => (
                  <tr key={feature} className="border-b border-slate-800/50">
                    <td className="py-3 pr-4">{feature}</td>
                    <td className="py-3 px-4 text-center">{free}</td>
                    <td className="py-3 px-4 text-center">{org}</td>
                    <td className="py-3 px-4 text-center">{ent}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 px-6 border-t border-slate-800/50">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">Frequently asked questions</h2>
          <div className="space-y-6">
            {faqs.map((faq) => (
              <div key={faq.q} className="rounded-lg border border-slate-800 bg-slate-900/50 p-6">
                <h3 className="font-semibold mb-2">{faq.q}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 border-t border-slate-800/50">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-6">Ready to ship safer migrations?</h2>
          <p className="text-slate-400 mb-8">
            Install MigrationPilot in 30 seconds. No account, no credit card, no rule count to worry about.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="https://github.com/mickelsamuel/migrationpilot"
              className="inline-flex items-center justify-center px-6 py-3 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-500 transition-colors"
            >
              Get Started Free
            </a>
            <a
              href="/enterprise"
              className="inline-flex items-center justify-center px-6 py-3 rounded-lg border border-slate-700 text-slate-300 font-medium hover:border-slate-500 hover:text-white transition-colors"
            >
              Enterprise
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-800/50 py-8 px-6">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-blue-600 flex items-center justify-center font-bold text-[10px]">MP</div>
            <span className="text-xs text-slate-400">MigrationPilot</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-slate-400">
            <a href="/" className="hover:text-slate-200 transition-colors">Home</a>
            <a href="/docs" className="hover:text-slate-200 transition-colors">Docs</a>
            <a href="https://github.com/mickelsamuel/migrationpilot" className="hover:text-slate-200 transition-colors">GitHub</a>
          </div>
          <p className="text-xs text-slate-400">&copy; 2026 MigrationPilot</p>
        </div>
      </footer>
    </main>
  );
}
