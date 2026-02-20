import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service — MigrationPilot',
  description: 'MigrationPilot terms of service.',
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-3xl px-6 py-20">
        <h1 className="text-3xl font-bold text-white mb-8">Terms of Service</h1>
        <p className="text-sm text-slate-500 mb-10">Last updated: February 17, 2026</p>

        <div className="space-y-8 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">1. Acceptance</h2>
            <p>
              By using MigrationPilot (the &quot;Service&quot;), including the CLI tool, GitHub Action,
              and website, you agree to these Terms of Service. If you do not agree, do not use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">2. Service Description</h2>
            <p>
              MigrationPilot is a static analysis tool that analyzes PostgreSQL DDL migrations
              for safety risks. It identifies dangerous patterns, suggests safe alternatives,
              and provides risk scoring. The Service is provided &quot;as is&quot; for informational purposes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">3. Free and Paid Tiers</h2>
            <p>
              MigrationPilot offers a free tier with 77 safety rules and paid tiers (Pro, Enterprise)
              with additional production-context features. Paid subscriptions are billed monthly or annually through Stripe.
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>You may cancel your subscription at any time through the billing portal.</li>
              <li>Cancellation takes effect at the end of the current billing period.</li>
              <li>Refunds are handled on a case-by-case basis — contact us if you have concerns.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">4. License Keys</h2>
            <p>
              Paid tier license keys are issued per subscription and are non-transferable.
              License keys expire at the end of each billing cycle and are automatically
              renewed upon successful payment. Sharing license keys is prohibited.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">5. Acceptable Use</h2>
            <p>You agree not to:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Reverse-engineer, decompile, or attempt to extract license signing keys from the software.</li>
              <li>Share, distribute, or sell license keys.</li>
              <li>Use the Service to harm, disrupt, or interfere with other services or systems.</li>
              <li>Circumvent any access controls or usage limits.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">6. Disclaimer of Warranties</h2>
            <p>
              MigrationPilot is a <strong className="text-white">static analysis tool</strong> that provides recommendations
              based on known PostgreSQL patterns. It does <strong className="text-white">not guarantee</strong> that your migrations
              are safe to run in production. You are solely responsible for testing and validating
              migrations in your own environment before executing them.
            </p>
            <p className="mt-2">
              THE SERVICE IS PROVIDED &quot;AS IS&quot; WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED,
              INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE,
              AND NONINFRINGEMENT.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">7. Limitation of Liability</h2>
            <p>
              IN NO EVENT SHALL MIGRATIONPILOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL,
              CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING WITHOUT LIMITATION, LOSS OF PROFITS,
              DATA, USE, OR GOODWILL, ARISING OUT OF OR IN CONNECTION WITH YOUR USE OF THE SERVICE.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">8. Open Source</h2>
            <p>
              The MigrationPilot CLI and GitHub Action are released under the MIT License.
              The open-source license applies to the code itself. These Terms of Service apply
              to the hosted services, paid features, and your relationship with MigrationPilot
              as a service provider.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">9. Changes to Terms</h2>
            <p>
              We may update these Terms from time to time. Material changes will be communicated
              via email to active subscribers. Continued use of the Service after changes
              constitutes acceptance of the updated Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">10. Contact</h2>
            <p>
              For questions about these Terms, contact us at{' '}
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
