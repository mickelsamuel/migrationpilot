import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Payment Successful — MigrationPilot',
  description: 'Your MigrationPilot subscription is active. Check your email for your license key.',
};

export default function CheckoutSuccessPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-lg w-full">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-green-500/20 flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold mb-2">Payment Successful</h1>
          <p className="text-slate-400">Your MigrationPilot Pro subscription is now active.</p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Next Steps</h2>
          <ol className="space-y-4 text-sm">
            <li className="flex gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold">1</span>
              <div>
                <p className="font-medium">Check your email</p>
                <p className="text-slate-400 mt-1">Your license key has been sent to the email you used at checkout.</p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold">2</span>
              <div>
                <p className="font-medium">Set up the CLI</p>
                <pre className="mt-2 bg-slate-900 border border-slate-800 rounded-lg p-3 text-xs font-mono text-slate-300 overflow-x-auto">
{`export MIGRATIONPILOT_LICENSE_KEY="MP-PRO-..."
migrationpilot analyze migration.sql \\
  --database-url $DATABASE_URL`}
                </pre>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold">3</span>
              <div>
                <p className="font-medium">Add to GitHub Actions</p>
                <pre className="mt-2 bg-slate-900 border border-slate-800 rounded-lg p-3 text-xs font-mono text-slate-300 overflow-x-auto">
{`- uses: mickelsamuel/migrationpilot@v1
  with:
    migration-path: "migrations/*.sql"
    license-key: \${{ secrets.MIGRATIONPILOT_LICENSE_KEY }}
    database-url: \${{ secrets.DATABASE_URL }}`}
                </pre>
              </div>
            </li>
          </ol>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 mb-8">
          <p className="text-sm text-slate-400">
            <span className="font-medium text-slate-300">Important:</span>{' '}
            Store your license key as an environment variable or GitHub secret. Never commit it to source control.
          </p>
        </div>

        <div className="flex gap-3 justify-center">
          <a
            href="/"
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 transition-colors"
          >
            Back to Home
          </a>
          <a
            href="/billing"
            className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 text-sm font-medium hover:bg-slate-800 transition-colors"
          >
            Manage Billing
          </a>
          <a
            href="https://github.com/mickelsamuel/migrationpilot"
            className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 text-sm font-medium hover:bg-slate-800 transition-colors"
          >
            Documentation
          </a>
        </div>
      </div>
    </main>
  );
}
