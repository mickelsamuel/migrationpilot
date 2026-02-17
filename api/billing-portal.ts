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
    const message = err instanceof Error ? err.message : 'Portal error';
    console.error('Billing portal error:', message);
    res.status(500).json({ error: message });
  }
}
