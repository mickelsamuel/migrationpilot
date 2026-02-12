/**
 * Vercel serverless function for Stripe webhook handling.
 *
 * POST /api/stripe-webhook
 *
 * Receives Stripe events, verifies signatures, generates license keys,
 * and sends them via email on successful checkout.
 *
 * Required environment variables (set in Vercel dashboard):
 * - STRIPE_SECRET_KEY
 * - STRIPE_WEBHOOK_SECRET
 * - MIGRATIONPILOT_SIGNING_SECRET
 * - RESEND_API_KEY (optional)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { loadWebhookConfig, processWebhook } from '../src/billing/webhook.js';

// Disable body parsing — we need the raw body for Stripe signature verification
export const config = {
  api: { bodyParser: false },
};

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const webhookConfig = loadWebhookConfig();
    const rawBody = await getRawBody(req);
    const signature = req.headers['stripe-signature'] as string;

    const result = await processWebhook(rawBody, signature, webhookConfig);
    res.status(result.status).send(result.body);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('Webhook error:', message);
    res.status(500).json({ error: message });
  }
}

function getRawBody(req: VercelRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
