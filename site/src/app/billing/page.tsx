'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';

function BillingFlow() {
  const params = useSearchParams();
  const initialEmail = params.get('email') || '';
  const [email, setEmail] = useState(initialEmail);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/billing-portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed to open billing portal' }));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const { url } = await res.json() as { url: string };
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <a href="/" className="inline-flex items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-sm">MP</div>
            <span className="font-semibold text-lg">MigrationPilot</span>
          </a>
          <h1 className="text-2xl font-bold mb-2">Manage Your Subscription</h1>
          <p className="text-slate-400 text-sm">Enter the email you used to subscribe to access the Stripe billing portal.</p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
          <label htmlFor="email" className="block text-sm font-medium mb-2">Email address</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            required
            className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-900 text-slate-100 text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />

          {error && (
            <p className="mt-3 text-sm text-red-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !email.trim()}
            className="mt-4 w-full px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Opening portal...
              </>
            ) : (
              'Open Billing Portal'
            )}
          </button>
        </form>

        <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <h3 className="text-sm font-medium mb-2">In the billing portal you can:</h3>
          <ul className="space-y-1.5 text-sm text-slate-400">
            <li className="flex items-center gap-2">
              <svg className="w-3.5 h-3.5 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Update your payment method
            </li>
            <li className="flex items-center gap-2">
              <svg className="w-3.5 h-3.5 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              View invoices and payment history
            </li>
            <li className="flex items-center gap-2">
              <svg className="w-3.5 h-3.5 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Change or cancel your subscription
            </li>
          </ul>
        </div>

        <p className="mt-6 text-center text-xs text-slate-600">
          <a href="/" className="hover:text-slate-400 transition-colors">Back to home</a>
          {' '}&middot;{' '}
          <a href="mailto:hello@migrationpilot.dev" className="hover:text-slate-400 transition-colors">Need help?</a>
        </p>
      </div>
    </main>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen flex items-center justify-center px-6">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400 text-sm">Loading...</p>
        </div>
      </main>
    }>
      <BillingFlow />
    </Suspense>
  );
}
