'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';

function CheckoutFlow() {
  const params = useSearchParams();
  const tier = params.get('tier') || 'pro';
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const startCheckout = useCallback(async () => {
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Checkout failed' }));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const { url } = await res.json() as { url: string };
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setLoading(false);
    }
  }, [tier]);

  useEffect(() => {
    startCheckout();
  }, [startCheckout]);

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6">
        <div className="max-w-md w-full text-center">
          <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold mb-2">Checkout Failed</h1>
          <p className="text-slate-400 text-sm mb-6">{error}</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => { setError(null); setLoading(true); startCheckout(); }}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 transition-colors"
            >
              Try Again
            </button>
            <a
              href="/#pricing"
              className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 text-sm font-medium hover:bg-slate-800 transition-colors"
            >
              Back to Pricing
            </a>
          </div>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400 text-sm">Redirecting to checkout...</p>
        </div>
      </main>
    );
  }

  return null;
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen flex items-center justify-center px-6">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400 text-sm">Loading...</p>
        </div>
      </main>
    }>
      <CheckoutFlow />
    </Suspense>
  );
}
