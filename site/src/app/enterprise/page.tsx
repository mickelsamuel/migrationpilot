import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Enterprise — MigrationPilot',
  description: 'MigrationPilot for enterprise teams. Audit logging, air-gapped deployment, SLA, security compliance, and dedicated support.',
};

const features = [
  {
    title: 'Audit Logging',
    description: 'JSONL event log of every operation for compliance. Configurable path, automatic CI/user/timestamp enrichment.',
  },
  {
    title: 'Air-Gapped Deployment',
    description: 'Run fully offline with --offline flag. Ed25519 license keys validate client-side — no phone-home, no telemetry.',
  },
  {
    title: 'Production Context',
    description: 'Connect to production databases for table size, query traffic, and connection count context. Read-only queries only — never touches your data.',
  },
  {
    title: 'Schema Drift Detection',
    description: 'Compare two database schemas to detect drift between environments. Catches missing tables, columns, indexes, and constraints.',
  },
  {
    title: 'SARIF Output',
    description: 'Export results as SARIF v2.1.0 for GitHub Code Scanning and IDE integration. Inline annotations in pull requests.',
  },
  {
    title: 'Configurable Presets',
    description: 'Built-in strict and CI presets. Per-rule severity overrides, custom thresholds, and ignore patterns via YAML config.',
  },
];

const securityItems = [
  'Ed25519 asymmetric license keys — private key never leaves your server',
  'Client-side validation only — no network calls for license checks',
  'Zero telemetry — no data collection, no tracking, no analytics',
  'Read-only analysis — never executes DDL against any database',
  'Production context queries use only pg_stat_*, pg_class, pg_roles — never reads user data',
  'SOC 2 Type II ready audit logging with JSONL event trail',
  'CSP, HSTS, and security headers on all web endpoints',
  'Signed npm packages with provenance attestation',
];

const complianceItems = [
  { label: 'GDPR', description: 'No personal data collection. DPA available on request.' },
  { label: 'SOC 2', description: 'Audit logging support. Security questionnaire available.' },
  { label: 'HIPAA', description: 'Air-gapped deployment for regulated environments.' },
  { label: 'PCI DSS', description: 'Read-only analysis with no data access.' },
];

export default function EnterprisePage() {
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
            <a href="/#pricing" className="hover:text-white transition-colors">Pricing</a>
            <a href="https://github.com/mickelsamuel/migrationpilot" className="hover:text-white transition-colors">GitHub</a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-6 text-center">
        <div className="max-w-3xl mx-auto">
          <span className="inline-block text-xs font-medium px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 mb-6">
            Enterprise
          </span>
          <h1 className="text-4xl sm:text-5xl font-bold mb-6 leading-tight">
            Migration safety for<br />regulated environments
          </h1>
          <p className="text-lg text-slate-400 mb-10 max-w-2xl mx-auto">
            Audit logging, air-gapped deployment, SARIF integration, and dedicated support.
            MigrationPilot runs entirely on your infrastructure — no data ever leaves your network.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="mailto:hello@migrationpilot.dev?subject=Enterprise%20Inquiry"
              className="inline-flex items-center justify-center px-6 py-3 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-500 transition-colors"
            >
              Contact Sales
            </a>
            <a
              href="/docs/quick-start"
              className="inline-flex items-center justify-center px-6 py-3 rounded-lg border border-slate-700 text-slate-300 font-medium hover:border-slate-500 hover:text-white transition-colors"
            >
              Read the Docs
            </a>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6 border-t border-slate-800/50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold mb-12 text-center">Enterprise Features</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, i) => (
              <div key={i} className="rounded-lg border border-slate-800 bg-slate-900/50 p-6">
                <h3 className="font-semibold mb-3 text-lg">{feature.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Security */}
      <section className="py-20 px-6 border-t border-slate-800/50">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold mb-12 text-center">Security First</h2>
          <ul className="space-y-4">
            {securityItems.map((item, i) => (
              <li key={i} className="flex gap-3 text-slate-400">
                <span className="text-green-400 mt-0.5 shrink-0">&#10003;</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Compliance */}
      <section className="py-20 px-6 border-t border-slate-800/50">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold mb-12 text-center">Compliance Ready</h2>
          <div className="grid sm:grid-cols-2 gap-6">
            {complianceItems.map((item, i) => (
              <div key={i} className="rounded-lg border border-slate-800 bg-slate-900/50 p-6">
                <h3 className="font-semibold mb-2">{item.label}</h3>
                <p className="text-sm text-slate-400">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SLA */}
      <section className="py-20 px-6 border-t border-slate-800/50">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-6">Enterprise SLA</h2>
          <p className="text-slate-400 mb-10 max-w-xl mx-auto">
            Priority support with guaranteed response times. Dedicated Slack channel, direct access to engineering, and custom deployment assistance.
          </p>
          <div className="grid sm:grid-cols-3 gap-6 text-center">
            <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-6">
              <div className="text-2xl font-bold text-blue-400 mb-2">4h</div>
              <p className="text-sm text-slate-400">Critical issue response</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-6">
              <div className="text-2xl font-bold text-blue-400 mb-2">24h</div>
              <p className="text-sm text-slate-400">General support response</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-6">
              <div className="text-2xl font-bold text-blue-400 mb-2">99.9%</div>
              <p className="text-sm text-slate-400">API uptime guarantee</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 border-t border-slate-800/50">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-6">Ready to secure your migrations?</h2>
          <p className="text-slate-400 mb-8">
            Get in touch to discuss enterprise pricing, custom deployment, and security questionnaire responses.
          </p>
          <a
            href="mailto:hello@migrationpilot.dev?subject=Enterprise%20Inquiry"
            className="inline-flex items-center justify-center px-8 py-3 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-500 transition-colors"
          >
            Contact Sales
          </a>
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
            <a href="/#pricing" className="hover:text-slate-300 transition-colors">Pricing</a>
            <a href="https://github.com/mickelsamuel/migrationpilot" className="hover:text-slate-300 transition-colors">GitHub</a>
          </div>
          <p className="text-xs text-slate-600">&copy; 2026 MigrationPilot</p>
        </div>
      </footer>
    </main>
  );
}
