import type { Metadata } from 'next';
import Navbar from '@/components/navbar';
import { ButtonLink } from '@/components/button';
import { CodeBlock } from '@/components/code-block';

export const metadata: Metadata = {
  title: 'Payment Successful — MigrationPilot',
  description: 'Your MigrationPilot subscription is active. Check your email for your license key.',
};

export default function CheckoutSuccessPage() {
  return (
    <>
    <Navbar />
    <main className="min-h-screen flex items-center justify-center px-6 pt-20">
      <div className="max-w-lg w-full">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-ok-soft flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-ok" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold mb-2">Payment Successful</h1>
          <p className="text-muted">Your MigrationPilot Org subscription is now active.</p>
        </div>

        <div className="rounded-xl border border-line bg-surface p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Next Steps</h2>
          <ol className="space-y-4 text-sm">
            <li className="flex gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-accent text-accent-ink flex items-center justify-center text-xs font-bold">1</span>
              <div>
                <p className="font-medium">Check your email</p>
                <p className="text-muted mt-1">Your license key has been sent to the email you used at checkout.</p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-accent text-accent-ink flex items-center justify-center text-xs font-bold">2</span>
              <div className="min-w-0 flex-1">
                <p className="font-medium mb-2">Set up the CLI</p>
                <CodeBlock code={`export MIGRATIONPILOT_LICENSE_KEY="MP-ORG-..."
migrationpilot analyze migration.sql \\
  --database-url $DATABASE_URL`} />
              </div>
            </li>
            <li className="flex gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-accent text-accent-ink flex items-center justify-center text-xs font-bold">3</span>
              <div className="min-w-0 flex-1">
                <p className="font-medium mb-2">Add to GitHub Actions</p>
                <CodeBlock code={`- uses: mickelsamuel/migrationpilot@v1
  with:
    migration-path: "migrations/*.sql"
    license-key: \${{ secrets.MIGRATIONPILOT_LICENSE_KEY }}
    database-url: \${{ secrets.DATABASE_URL }}`} />
              </div>
            </li>
          </ol>
        </div>

        <div className="rounded-xl border border-line bg-surface p-4 mb-8">
          <p className="text-sm text-muted">
            <span className="font-medium text-fg">Important:</span>{' '}
            Store your license key as an environment variable or GitHub secret. Never commit it to source control.
          </p>
        </div>

        <div className="flex gap-3 justify-center">
          <ButtonLink href="/" variant="primary" size="sm">
            Back to Home
          </ButtonLink>
          <ButtonLink href="/billing" variant="secondary" size="sm">
            Manage Billing
          </ButtonLink>
          <ButtonLink href="https://github.com/mickelsamuel/migrationpilot" variant="secondary" size="sm">
            Documentation
          </ButtonLink>
        </div>
      </div>
    </main>
    </>
  );
}
