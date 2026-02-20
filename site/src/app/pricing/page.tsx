'use client';

import { useState } from 'react';

const tiers = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'Static analysis for every team',
    features: [
      '77 safety rules (free tier)',
      'CLI + GitHub Action',
      '3 production analyses / month',
      '6 output formats (text, JSON, SARIF, markdown)',
      'Auto-fix (12 rules)',
      'PR comments',
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
    name: 'Pro',
    monthlyPrice: '$19',
    annualPrice: '$16',
    description: 'Production context for critical apps',
    features: [
      'Everything in Free',
      'Unlimited production analyses',
      'Production context queries (pg_stat_*, pg_class)',
      'Table size + query frequency scoring',
      '3 production rules (MP013, MP014, MP019)',
      'Affected queries in PR comments',
      'Enhanced risk scoring (0-100)',
      'Schema drift detection',
      'Historical analysis & trends',
      'Priority support',
    ],
    cta: 'Start 14-Day Free Trial',
    highlighted: true,
  },
  {
    name: 'Team',
    monthlyPrice: '$49',
    annualPrice: '$42',
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

const faqs = [
  {
    q: 'What counts as a "production analysis"?',
    a: 'A production analysis is when MigrationPilot connects to your database via --database-url to gather table sizes, query traffic, and connection counts. Static analysis (without a database connection) is always unlimited and free.',
  },
  {
    q: 'Do I need a credit card to start the trial?',
    a: 'No. The 14-day Pro trial is completely free with no credit card required. You get full access to all Pro features during the trial period.',
  },
  {
    q: 'What happens when my trial or subscription ends?',
    a: 'MigrationPilot gracefully falls back to the free tier. All 77 free rules continue working. You only lose the 3 Pro production context rules (MP013, MP014, MP019) and unlimited production analyses.',
  },
  {
    q: 'Can I use MigrationPilot in air-gapped environments?',
    a: 'Yes. Run with --offline to skip all network calls. License validation uses Ed25519 keys that work entirely client-side — no phone-home, no telemetry.',
  },
  {
    q: 'Is my data safe?',
    a: 'MigrationPilot never reads your actual data. Production context queries only access PostgreSQL system catalogs (pg_stat_*, pg_class, pg_roles). The CLI runs entirely on your infrastructure.',
  },
  {
    q: 'What is the annual discount?',
    a: 'Annual billing saves ~16% — $16/month billed annually ($192/year) vs $19/month billed monthly ($228/year) for Pro. Team: $42/month annual ($504/year) vs $49/month ($588/year).',
  },
];

export default function PricingPage() {
  const [annual, setAnnual] = useState(false);

  return (
    <main className="min-h-screen">
      <nav className="fixed top-0 w-full z-50 border-b border-slate-800/50 bg-slate-950/80 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-6 py-4">
          <a href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-sm">MP</div>
            <span className="font-semibold text-lg">MigrationPilot</span>
          </a>
          <div className="flex items-center gap-6 text-sm text-slate-400">
            <a href="/docs" className="hover:text-white transition-colors">Docs</a>
            <a href="/enterprise" className="hover:text-white transition-colors">Enterprise</a>
            <a href="https://github.com/mickelsamuel/migrationpilot" className="hover:text-white transition-colors">GitHub</a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-16 px-6 text-center">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-4xl sm:text-5xl font-bold mb-6 leading-tight">
            Simple, transparent pricing
          </h1>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            80 rules (77 free). Add production context when you need it.
          </p>
        </div>
      </section>

      {/* Toggle */}
      <div className="flex items-center justify-center gap-3 mb-12">
        <span className={`text-sm ${!annual ? 'text-white font-medium' : 'text-slate-400'}`}>Monthly</span>
        <button
          onClick={() => setAnnual(!annual)}
          className={`relative w-12 h-6 rounded-full transition-colors ${annual ? 'bg-blue-600' : 'bg-slate-700'}`}
          aria-label="Toggle annual billing"
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${annual ? 'translate-x-6' : ''}`} />
        </button>
        <span className={`text-sm ${annual ? 'text-white font-medium' : 'text-slate-400'}`}>Annual</span>
        {annual && <span className="text-xs text-green-400 font-medium ml-1">Save ~16%</span>}
      </div>

      {/* Tiers */}
      <section className="px-6 pb-20">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {tiers.map((tier) => {
            const price = 'monthlyPrice' in tier
              ? (annual ? tier.annualPrice : tier.monthlyPrice)
              : tier.price;
            const period = 'monthlyPrice' in tier
              ? (annual ? '/mo billed annually' : '/month')
              : tier.period;
            const ctaLink = 'monthlyPrice' in tier
              ? `/checkout?tier=${tier.name.toLowerCase()}${annual ? '&interval=annual' : ''}`
              : tier.ctaLink;

            return (
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
                  <span className="text-4xl font-bold">{price}</span>
                  {period && <span className="text-slate-400">{period}</span>}
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
                  href={ctaLink}
                  className={`mt-8 inline-flex items-center justify-center px-6 py-3 rounded-lg font-medium text-sm transition-colors ${
                    tier.highlighted
                      ? 'bg-blue-600 text-white hover:bg-blue-500'
                      : 'border border-slate-700 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {tier.cta}
                </a>
              </div>
            );
          })}
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
                  <th className="text-center py-3 px-4 text-blue-400 font-medium">Pro</th>
                  <th className="text-center py-3 px-4 text-slate-400 font-medium">Team</th>
                  <th className="text-center py-3 px-4 text-slate-400 font-medium">Enterprise</th>
                </tr>
              </thead>
              <tbody className="text-slate-300">
                {[
                  ['Static safety rules', '77 (free)', '80 (all)', '80 (all)', '80 (all)'],
                  ['Output formats', '6', '6', '6', '6'],
                  ['Auto-fix', '12 rules', '12 rules', '12 rules', '12 rules'],
                  ['GitHub Action', '\u2713', '\u2713', '\u2713', '\u2713'],
                  ['PR comments', '\u2713', '\u2713', '\u2713', '\u2713'],
                  ['Config presets', '5 built-in', '5 built-in', '5 built-in + custom', '5 built-in + custom'],
                  ['MCP server', '\u2713', '\u2713', '\u2713', '\u2713'],
                  ['Production analyses', '3/month', 'Unlimited', 'Unlimited', 'Unlimited'],
                  ['Production context', '\u2014', '\u2713', '\u2713', '\u2713'],
                  ['Drift detection', '\u2014', '\u2713', '\u2713', '\u2713'],
                  ['Historical trends', '\u2014', '\u2713', '\u2713', '\u2713'],
                  ['Custom rules (plugin API)', '\u2014', '\u2014', '\u2713', '\u2713'],
                  ['Team seats', '\u2014', '1', 'Up to 10', 'Unlimited'],
                  ['Audit logging', '\u2014', '\u2014', '\u2713', '\u2713'],
                  ['Policy enforcement', '\u2014', '\u2014', '\u2014', '\u2713'],
                  ['Air-gapped mode', '\u2014', '\u2014', '\u2014', '\u2713'],
                  ['SSO / SAML', '\u2014', '\u2014', '\u2014', '\u2713'],
                  ['SLA', '\u2014', '\u2014', '\u2014', '\u2713'],
                  ['Dedicated support', '\u2014', '\u2014', '\u2014', '\u2713'],
                ].map(([feature, free, pro, team, ent]) => (
                  <tr key={feature} className="border-b border-slate-800/50">
                    <td className="py-3 pr-4">{feature}</td>
                    <td className="py-3 px-4 text-center">{free}</td>
                    <td className="py-3 px-4 text-center">{pro}</td>
                    <td className="py-3 px-4 text-center">{team}</td>
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
            Install MigrationPilot in 30 seconds. No credit card required.
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
            <span className="text-xs text-slate-500">MigrationPilot</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-slate-500">
            <a href="/" className="hover:text-slate-300 transition-colors">Home</a>
            <a href="/docs" className="hover:text-slate-300 transition-colors">Docs</a>
            <a href="https://github.com/mickelsamuel/migrationpilot" className="hover:text-slate-300 transition-colors">GitHub</a>
          </div>
          <p className="text-xs text-slate-600">&copy; 2026 MigrationPilot</p>
        </div>
      </footer>
    </main>
  );
}
