/**
 * Vercel serverless function for Stripe Customer Portal.
 *
 * POST /api/billing-portal
 * Body: { "email": "user@example.com" }
 *
 * Looks up the Stripe customer by email, then creates a Customer Portal session.
 * Returns: { "url": "https://billing.stripe.com/..." }
 *
 * Required environment variables:
 * - STRIPE_SECRET_KEY
 * - SITE_URL (e.g., https://migrationpilot.dev)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createStripeClient, findCustomerByEmail, createPortalSession } from '../src/billing/stripe.js';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { email } = req.body as { email?: string };

  if (!email || typeof email !== 'string' || !email.includes('@')) {
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
    const stripe = createStripeClient(stripeSecretKey);
    const customerId = await findCustomerByEmail(stripe, email);

    if (!customerId) {
      res.status(404).json({ error: 'No subscription found for this email. Please use the email you signed up with.' });
      return;
    }

    const url = await createPortalSession(stripe, customerId, `${siteUrl}/billing`);
    res.status(200).json({ url });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Portal error';
    console.error('Billing portal error:', message);
    res.status(500).json({ error: message });
  }
}
