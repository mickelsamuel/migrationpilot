/**
 * Vercel serverless function for creating Stripe Checkout sessions.
 *
 * POST /api/checkout
 * Body: { "tier": "pro" | "team" | "enterprise", "email"?: "user@example.com" }
 *
 * Returns: { "url": "https://checkout.stripe.com/..." }
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

const PRICE_IDS: Record<string, string | undefined> = {
  pro: process.env.STRIPE_PRICE_PRO,
  team: process.env.STRIPE_PRICE_TEAM,
  enterprise: process.env.STRIPE_PRICE_ENTERPRISE,
};

/** Simple in-memory rate limiter: 10 requests per minute per IP. */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
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
    // Use Stripe REST API directly to avoid SDK bundling issues
    const bodyParts = [
      'mode=subscription',
      'payment_method_types[0]=card',
      `line_items[0][price]=${priceId}`,
      'line_items[0][quantity]=1',
      `success_url=${encodeURIComponent(`${siteUrl}/checkout/success`)}`,
      `cancel_url=${encodeURIComponent(`${siteUrl}/pricing`)}`,
    ];
    if (email) {
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
      console.error('Stripe API error:', JSON.stringify(data));
      res.status(500).json({ error: data.error?.message || 'Stripe error' });
      return;
    }

    res.status(200).json({ url: data.url, sessionId: data.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Checkout error';
    console.error('Checkout error:', message);
    res.status(500).json({ error: message });
  }
}
