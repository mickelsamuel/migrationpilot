/**
 * Stripe webhook HTTP handler for MigrationPilot.
 *
 * Framework-agnostic: exports a handler function that takes raw request
 * body + signature header, processes the event, and returns a response.
 *
 * Can be mounted on:
 * - Vercel serverless function (api/stripe-webhook.ts)
 * - Express route
 * - Any Node.js HTTP server
 *
 * Environment variables:
 * - STRIPE_SECRET_KEY
 * - STRIPE_WEBHOOK_SECRET
 * - MIGRATIONPILOT_SIGNING_PRIVATE_KEY: Ed25519 private key (PEM) for license signing
 * - RESEND_API_KEY (optional — skips email if not set)
 * - EMAIL_FROM (optional)
 */

import {
  createStripeClient,
  verifyWebhookEvent,
  handleWebhookEvent,
} from './stripe.js';
import { sendLicenseKeyEmail } from './email.js';
import type { WebhookResult } from './stripe.js';

export interface WebhookResponse {
  status: number;
  body: string;
}

export interface WebhookConfig {
  stripeSecretKey: string;
  stripeWebhookSecret: string;
  signingPrivateKey: string;
  resendApiKey?: string;
  emailFrom?: string;
}

/**
 * Load webhook config from environment variables.
 * Throws if required variables are missing.
 */
export function loadWebhookConfig(): WebhookConfig {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const signingPrivateKey = process.env.MIGRATIONPILOT_SIGNING_PRIVATE_KEY;

  if (!stripeSecretKey) throw new Error('Missing STRIPE_SECRET_KEY');
  if (!stripeWebhookSecret) throw new Error('Missing STRIPE_WEBHOOK_SECRET');
  if (!signingPrivateKey) throw new Error('Missing MIGRATIONPILOT_SIGNING_PRIVATE_KEY');

  return {
    stripeSecretKey,
    stripeWebhookSecret,
    signingPrivateKey,
    resendApiKey: process.env.RESEND_API_KEY,
    emailFrom: process.env.EMAIL_FROM,
  };
}

/**
 * Process a Stripe webhook request.
 *
 * @param rawBody - Raw request body (string or Buffer, NOT parsed JSON)
 * @param signature - Value of the 'stripe-signature' header
 * @param config - Webhook configuration
 * @returns Response with status code and body
 */
export async function processWebhook(
  rawBody: string | Buffer,
  signature: string,
  config: WebhookConfig,
): Promise<WebhookResponse> {
  if (!signature) {
    return { status: 400, body: JSON.stringify({ error: 'Missing stripe-signature header' }) };
  }

  let event;
  const stripe = createStripeClient(config.stripeSecretKey);

  try {
    event = verifyWebhookEvent(stripe, rawBody, signature, config.stripeWebhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Signature verification failed';
    return { status: 400, body: JSON.stringify({ error: message }) };
  }

  let result: WebhookResult;
  try {
    result = await handleWebhookEvent(stripe, event, config.signingPrivateKey);
  } catch (err) {
    console.error('Webhook handler error:', err instanceof Error ? err.message : err);
    return { status: 500, body: JSON.stringify({ error: 'Internal error' }) };
  }

  // Send license key email if we generated a key and have email config
  if (result.licenseKey && result.email && config.resendApiKey) {
    const emailResult = await sendLicenseKeyEmail(
      { resendApiKey: config.resendApiKey, from: config.emailFrom },
      {
        to: result.email,
        licenseKey: result.licenseKey,
        tier: result.tier ?? 'pro',
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      },
    );

    if (!emailResult.sent) {
      console.error(`Failed to send license email to ${result.email}: ${emailResult.error}`);
    }
  }

  return {
    status: 200,
    body: JSON.stringify({
      received: true,
      event: result.event,
      handled: result.handled,
    }),
  };
}
