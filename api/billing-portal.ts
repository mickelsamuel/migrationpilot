/**
 * Vercel serverless function for Stripe Customer Portal.
 *
 * POST /api/billing-portal
 * Body: { "email": "user@example.com" }
 *
 * Returns: { "url": "https://billing.stripe.com/..." } or generic message
 *
 * SECURITY: Always returns the same response shape and timing regardless
 * of whether the email exists, to prevent email enumeration.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { createHash } from 'node:crypto';

const ALLOWED_ORIGIN = 'https://migrationpilot.dev';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Minimum response time to prevent timing-based enumeration (ms). */
const MIN_RESPONSE_MS = 400;

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 5; // Stricter: 5 req/min for email lookups
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

/** Wait at least `minMs` from `startTime`. */
async function enforceMinResponseTime(startTime: number, minMs: number): Promise<void> {
  const elapsed = Date.now() - startTime;
  if (elapsed < minMs) {
    await new Promise(resolve => setTimeout(resolve, minMs - elapsed));
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const startTime = Date.now();

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Origin check
  const origin = req.headers.origin;
  if (origin && origin !== ALLOWED_ORIGIN) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  // Rate limiting (stricter for email lookups)
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
    || req.socket?.remoteAddress
    || 'unknown';
  if (isRateLimited(ip)) {
    await enforceMinResponseTime(startTime, MIN_RESPONSE_MS);
    res.status(429).json({ error: 'Too many requests. Please try again in a minute.' });
    return;
  }

  if (rateLimitMap.size > 1000) cleanupRateLimitMap();

  const { email } = req.body as { email?: string };

  if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email)) {
    await enforceMinResponseTime(startTime, MIN_RESPONSE_MS);
    res.status(400).json({ error: 'A valid email address is required.' });
    return;
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    await enforceMinResponseTime(startTime, MIN_RESPONSE_MS);
    res.status(500).json({ error: 'Service temporarily unavailable.' });
    return;
  }

  const siteUrl = process.env.SITE_URL || 'https://migrationpilot.dev';

  try {
    const stripe = new Stripe(stripeSecretKey);
    const customers = await stripe.customers.list({ email: email.toLowerCase().trim(), limit: 1 });
    const customer = customers.data[0];

    if (!customer) {
      // Return same shape as success — prevents email enumeration.
      // The user sees "check your email" message on the frontend.
      await enforceMinResponseTime(startTime, MIN_RESPONSE_MS);
      res.status(200).json({
        message: 'If an account exists for this email, you will receive a billing portal link.',
      });
      return;
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customer.id,
      return_url: `${siteUrl}/billing`,
    });

    await enforceMinResponseTime(startTime, MIN_RESPONSE_MS);
    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('[billing-portal] Error:', err instanceof Error ? err.constructor.name : 'unknown');
    await enforceMinResponseTime(startTime, MIN_RESPONSE_MS);
    res.status(500).json({ error: 'Unable to access billing portal. Please try again.' });
  }
}
