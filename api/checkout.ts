/**
 * Vercel serverless function for creating Stripe Checkout sessions.
 *
 * POST /api/checkout
 * Body: { "tier": "pro" | "team" | "enterprise", "email"?: "user@example.com", "interval"?: "monthly" | "annual" }
 *
 * Returns: { "url": "https://checkout.stripe.com/..." }
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash } from 'node:crypto';

const PRICE_IDS: Record<string, string | undefined> = {
  pro: process.env.STRIPE_PRICE_PRO,
  team: process.env.STRIPE_PRICE_TEAM,
  enterprise: process.env.STRIPE_PRICE_ENTERPRISE,
  pro_annual: process.env.STRIPE_PRICE_PRO_ANNUAL,
  team_annual: process.env.STRIPE_PRICE_TEAM_ANNUAL,
  enterprise_annual: process.env.STRIPE_PRICE_ENTERPRISE_ANNUAL,
};

const VALID_TIERS = new Set(['pro', 'team', 'enterprise']);
const ALLOWED_ORIGIN = 'https://migrationpilot.dev';

/**
 * Persistent-ish rate limiter using IP hashing.
 * NOTE: Each serverless instance has its own Map, but Vercel routes
 * the same IP to the same instance for warm invocations.
 * For stronger guarantees, upgrade to Vercel KV.
 */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

function getRateLimitKey(ip: string): string {
  return createHash('sha256').update(ip).digest('hex').slice(0, 16);
}

function isRateLimited(ip: string): boolean {
  const key = getRateLimitKey(ip);
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

function cleanupRateLimitMap(): void {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(key);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Origin check (defense-in-depth alongside Vercel headers)
  const origin = req.headers.origin;
  if (origin && origin !== ALLOWED_ORIGIN) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  // Rate limiting
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
    || req.socket?.remoteAddress
    || 'unknown';
  if (isRateLimited(ip)) {
    res.status(429).json({ error: 'Too many requests. Please try again in a minute.' });
    return;
  }

  // Periodic cleanup of expired rate limit entries
  if (rateLimitMap.size > 1000) cleanupRateLimitMap();

  const { tier, email, interval } = req.body as { tier?: string; email?: string; interval?: string };

  if (!tier || !VALID_TIERS.has(tier)) {
    res.status(400).json({ error: 'Invalid tier.' });
    return;
  }

  const isAnnual = interval === 'annual';
  const priceKey = isAnnual ? `${tier}_annual` : tier;
  const priceId = PRICE_IDS[priceKey] || PRICE_IDS[tier];
  if (!priceId) {
    res.status(500).json({ error: 'Checkout is temporarily unavailable.' });
    return;
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    res.status(500).json({ error: 'Checkout is temporarily unavailable.' });
    return;
  }

  const siteUrl = process.env.SITE_URL || 'https://migrationpilot.dev';

  try {
    const bodyParts = [
      'mode=subscription',
      'payment_method_types[0]=card',
      `line_items[0][price]=${priceId}`,
      'line_items[0][quantity]=1',
      `success_url=${encodeURIComponent(`${siteUrl}/checkout/success`)}`,
      `cancel_url=${encodeURIComponent(`${siteUrl}/#pricing`)}`,
      'subscription_data[trial_period_days]=14',
    ];
    if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      bodyParts.push(`customer_email=${encodeURIComponent(email)}`);
    }

    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: bodyParts.join('&'),
    });

    const data = await response.json() as { url?: string; id?: string; error?: { message: string } };

    if (!response.ok) {
      console.error('[checkout] Stripe error:', response.status);
      res.status(500).json({ error: 'Checkout failed. Please try again.' });
      return;
    }

    res.status(200).json({ url: data.url, sessionId: data.id });
  } catch (err) {
    console.error('[checkout] Error:', err instanceof Error ? err.constructor.name : 'unknown');
    res.status(500).json({ error: 'Checkout failed. Please try again.' });
  }
}
