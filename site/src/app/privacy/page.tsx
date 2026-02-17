import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy — MigrationPilot',
  description: 'MigrationPilot privacy policy. How we handle your data.',
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-3xl px-6 py-20">
        <h1 className="text-3xl font-bold text-white mb-8">Privacy Policy</h1>
        <p className="text-sm text-slate-500 mb-10">Last updated: February 17, 2026</p>

        <div className="space-y-8 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Overview</h2>
            <p>
              MigrationPilot is a static analysis tool for PostgreSQL migrations.
              We are committed to protecting your privacy and being transparent about
              what data we collect and how we use it.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">CLI Tool</h2>
            <p>
              The MigrationPilot CLI runs entirely on your machine. It does <strong className="text-white">not</strong> send
              your SQL files, migration content, analysis results, or any telemetry to our servers.
              All analysis is performed locally using static parsing.
            </p>
            <p className="mt-2">
              The only network requests the CLI makes are for optional license key
              validation, which sends only the license key string — never your code or data.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">GitHub Action</h2>
            <p>
              The MigrationPilot GitHub Action runs within your GitHub Actions environment.
              It analyzes SQL files in your repository and posts results as PR comments.
              No data is sent to MigrationPilot servers — all processing happens within
              GitHub&apos;s infrastructure.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Website &amp; Billing</h2>
            <p>When you purchase a subscription, we collect:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Email address (for license key delivery and account management)</li>
              <li>Payment information (processed securely by Stripe — we never see your card details)</li>
            </ul>
            <p className="mt-2">
              We do not use tracking cookies, analytics scripts, or advertising pixels on migrationpilot.dev.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Production Context (Pro Feature)</h2>
            <p>
              The Pro tier includes optional production context analysis. When enabled, MigrationPilot
              connects to your database to read <strong className="text-white">only</strong> system catalog
              information (<code className="text-blue-400">pg_stat_user_tables</code>, <code className="text-blue-400">pg_class</code>,{' '}
              <code className="text-blue-400">pg_roles</code>). It never reads, modifies, or accesses your actual table data.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Data Retention</h2>
            <p>
              We retain your email and subscription information for as long as your account is active.
              If you cancel your subscription, we retain billing records as required by law (typically 7 years)
              but delete all other personal information within 30 days upon request.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Third-Party Services</h2>
            <ul className="list-disc list-inside space-y-1">
              <li><strong className="text-white">Stripe</strong> — Payment processing (<a href="https://stripe.com/privacy" className="text-blue-400 hover:underline">Stripe Privacy Policy</a>)</li>
              <li><strong className="text-white">Resend</strong> — Transactional email (<a href="https://resend.com/legal/privacy-policy" className="text-blue-400 hover:underline">Resend Privacy Policy</a>)</li>
              <li><strong className="text-white">Vercel</strong> — Website hosting (<a href="https://vercel.com/legal/privacy-policy" className="text-blue-400 hover:underline">Vercel Privacy Policy</a>)</li>
              <li><strong className="text-white">GitHub</strong> — Source code hosting and Actions (<a href="https://docs.github.com/en/site-policy/privacy-policies" className="text-blue-400 hover:underline">GitHub Privacy Policy</a>)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Contact</h2>
            <p>
              For privacy-related questions or data deletion requests, contact us at{' '}
              <a href="mailto:hello@migrationpilot.dev" className="text-blue-400 hover:underline">
                hello@migrationpilot.dev
              </a>.
            </p>
          </section>
        </div>

        <div className="mt-16 pt-8 border-t border-slate-800">
          <a href="/" className="text-blue-400 hover:underline">&larr; Back to MigrationPilot</a>
        </div>
      </div>
    </main>
  );
}
