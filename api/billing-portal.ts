/**
 * Vercel serverless function for Stripe Customer Portal.
 *
 * POST /api/billing-portal
 * Body: { "email": "user@example.com" }
 *
 * Returns: { "url": "https://billing.stripe.com/..." }
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';

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

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  const { email } = req.body as { email?: string };

  if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email)) {
    res.status(400).json({ error: 'A valid email address is required.' });
    return;
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    res.status(500).json({ error: 'Stripe not configured' });
    return;
  }

  const siteUrl = process.env.SITE_URL || 'https://migrationpilot.dev';

  try {
    const stripe = new Stripe(stripeSecretKey);
    const customers = await stripe.customers.list({ email, limit: 1 });
    const customer = customers.data[0];

    if (!customer) {
      res.status(404).json({ error: 'No subscription found for this email. Please use the email you signed up with.' });
      return;
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customer.id,
      return_url: `${siteUrl}/billing`,
    });
    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Billing portal error:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Unable to access billing portal. Please try again.' });
  }
}
