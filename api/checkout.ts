/**
 * Vercel serverless function for creating Stripe Checkout sessions.
 *
 * POST /api/checkout
 * Body: { "tier": "pro" | "team" | "enterprise", "email"?: "user@example.com" }
 *
 * Returns: { "url": "https://checkout.stripe.com/..." }
 *
 * Required environment variables:
 * - STRIPE_SECRET_KEY
 * - STRIPE_PRICE_PRO / STRIPE_PRICE_TEAM / STRIPE_PRICE_ENTERPRISE
 * - SITE_URL (e.g., https://migrationpilot.dev)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createStripeClient, createCheckoutSession } from '../src/billing/stripe.js';

const PRICE_IDS: Record<string, string | undefined> = {
  pro: process.env.STRIPE_PRICE_PRO,
  team: process.env.STRIPE_PRICE_TEAM,
  enterprise: process.env.STRIPE_PRICE_ENTERPRISE,
};

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { tier, email } = req.body as { tier?: string; email?: string };

  if (!tier || !['pro', 'team', 'enterprise'].includes(tier)) {
    res.status(400).json({ error: 'Invalid tier. Must be pro, team, or enterprise.' });
    return;
  }

  const priceId = PRICE_IDS[tier];
  if (!priceId) {
    res.status(500).json({ error: `Price ID not configured for tier: ${tier}` });
    return;
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    res.status(500).json({ error: 'Stripe not configured' });
    return;
  }

  const siteUrl = process.env.SITE_URL || 'https://migrationpilot.dev';

  try {
    const stripe = createStripeClient(stripeSecretKey);
    const result = await createCheckoutSession(
      stripe,
      { successUrl: `${siteUrl}/checkout/success`, cancelUrl: `${siteUrl}/pricing` },
      priceId,
      email,
    );
    res.status(200).json({ url: result.url, sessionId: result.sessionId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Checkout error';
    console.error('Checkout error:', message);
    res.status(500).json({ error: message });
  }
}
