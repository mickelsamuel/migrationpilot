/**
 * Stripe billing integration for MigrationPilot Pro.
 *
 * Handles:
 * - Creating checkout sessions for Pro/Team/Enterprise subscriptions
 * - Processing webhook events (checkout complete, subscription changes, invoice paid)
 * - Generating license keys on successful payment
 * - Customer portal sessions for billing management
 *
 * Environment variables required:
 * - STRIPE_SECRET_KEY: Stripe secret API key
 * - STRIPE_WEBHOOK_SECRET: Webhook endpoint signing secret
 * - MIGRATIONPILOT_SIGNING_SECRET: HMAC secret for license key generation
 */

import Stripe from 'stripe';
import { generateLicenseKey } from '../license/validate.js';
import type { LicenseTier } from '../license/validate.js';

export interface BillingConfig {
  stripeSecretKey: string;
  stripeWebhookSecret: string;
  signingSecret: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutResult {
  sessionId: string;
  url: string;
}

export interface WebhookResult {
  handled: boolean;
  event: string;
  customerId?: string;
  licenseKey?: string;
  tier?: LicenseTier;
  email?: string;
}

/** Price IDs mapped by tier. Set via environment or config. */
export interface PriceConfig {
  pro: string;
  team: string;
  enterprise: string;
}

/**
 * Create a Stripe instance from config.
 */
export function createStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey);
}

/**
 * Create a Checkout Session for a new subscription.
 */
export async function createCheckoutSession(
  stripe: Stripe,
  config: Pick<BillingConfig, 'successUrl' | 'cancelUrl'>,
  priceId: string,
  customerEmail?: string,
): Promise<CheckoutResult> {
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${config.successUrl}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: config.cancelUrl,
    ...(customerEmail ? { customer_email: customerEmail } : {}),
    metadata: {
      product: 'migrationpilot',
    },
    subscription_data: {
      metadata: {
        product: 'migrationpilot',
      },
    },
  });

  if (!session.url) {
    throw new Error('Stripe did not return a checkout URL');
  }

  return { sessionId: session.id, url: session.url };
}

/**
 * Create a Customer Portal session for managing billing.
 */
export async function createPortalSession(
  stripe: Stripe,
  customerId: string,
  returnUrl: string,
): Promise<string> {
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
  return session.url;
}

/**
 * Look up a Stripe customer by email. Returns the customer ID if found.
 */
export async function findCustomerByEmail(
  stripe: Stripe,
  email: string,
): Promise<string | null> {
  const customers = await stripe.customers.list({ email, limit: 1 });
  const customer = customers.data[0];
  return customer ? customer.id : null;
}

/**
 * Verify and parse a Stripe webhook event.
 */
export function verifyWebhookEvent(
  stripe: Stripe,
  payload: string | Buffer,
  signature: string,
  webhookSecret: string,
): Stripe.Event {
  return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
}

/**
 * Handle a verified Stripe webhook event.
 * Returns the result including any generated license key.
 */
export async function handleWebhookEvent(
  stripe: Stripe,
  event: Stripe.Event,
  signingSecret: string,
): Promise<WebhookResult> {
  switch (event.type) {
    case 'checkout.session.completed':
      return handleCheckoutComplete(stripe, event.data.object as Stripe.Checkout.Session, signingSecret);

    case 'customer.subscription.updated':
      return handleSubscriptionUpdated(stripe, event.data.object as Stripe.Subscription, signingSecret);

    case 'customer.subscription.deleted':
      return handleSubscriptionDeleted(event.data.object as Stripe.Subscription);

    case 'invoice.paid':
      return handleInvoicePaid(stripe, event.data.object as Stripe.Invoice, signingSecret);

    default:
      return { handled: false, event: event.type };
  }
}

/**
 * Get the current_period_end from a subscription's first item.
 * In Stripe SDK v20+, this is at the item level, not the subscription level.
 */
function getSubscriptionPeriodEnd(subscription: Stripe.Subscription): number {
  const item = subscription.items.data[0];
  return item?.current_period_end ?? Math.floor(Date.now() / 1000) + 86400 * 30;
}

/**
 * Extract subscription ID from an invoice's parent field (Stripe SDK v20+).
 */
function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const sub = invoice.parent?.subscription_details?.subscription;
  if (!sub) return null;
  return typeof sub === 'string' ? sub : sub.id;
}

/**
 * Handle checkout.session.completed — generate and return a license key.
 * Idempotent: if a key already exists on the subscription, returns it instead of generating a new one.
 */
async function handleCheckoutComplete(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
  signingSecret: string,
): Promise<WebhookResult> {
  if (session.metadata?.product !== 'migrationpilot') {
    return { handled: false, event: 'checkout.session.completed' };
  }

  const customerId = typeof session.customer === 'string'
    ? session.customer
    : session.customer?.id;

  if (!customerId) {
    return { handled: false, event: 'checkout.session.completed' };
  }

  const subscriptionId = typeof session.subscription === 'string'
    ? session.subscription
    : session.subscription?.id;

  if (!subscriptionId) {
    return { handled: false, event: 'checkout.session.completed' };
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const tier = resolveTierFromSubscription(subscription);

  // Idempotency: if a key already exists for this tier, return it
  const existingKey = subscription.metadata?.license_key;
  const existingTier = subscription.metadata?.license_tier;
  if (existingKey && existingTier === tier) {
    const customer = await stripe.customers.retrieve(customerId);
    const email = (!customer.deleted && customer.email) ? customer.email : session.customer_email ?? undefined;
    return { handled: true, event: 'checkout.session.completed', customerId, licenseKey: existingKey, tier, email };
  }

  // Use subscription current_period_end for expiry (aligned with billing cycle)
  const expiresAt = new Date(getSubscriptionPeriodEnd(subscription) * 1000);
  const licenseKey = generateLicenseKey(tier, expiresAt, signingSecret);

  await stripe.subscriptions.update(subscriptionId, {
    metadata: {
      product: 'migrationpilot',
      license_key: licenseKey,
      license_tier: tier,
      license_expires: expiresAt.toISOString().slice(0, 10),
    },
  });

  const customer = await stripe.customers.retrieve(customerId);
  const email = (!customer.deleted && customer.email) ? customer.email : session.customer_email ?? undefined;

  return {
    handled: true,
    event: 'checkout.session.completed',
    customerId,
    licenseKey,
    tier,
    email,
  };
}

/**
 * Handle subscription updated (upgrade/downgrade).
 * Generates a new license key when the tier changes.
 */
async function handleSubscriptionUpdated(
  stripe: Stripe,
  subscription: Stripe.Subscription,
  signingSecret: string,
): Promise<WebhookResult> {
  if (subscription.metadata?.product !== 'migrationpilot') {
    return { handled: false, event: 'customer.subscription.updated' };
  }

  const tier = resolveTierFromSubscription(subscription);
  const customerId = typeof subscription.customer === 'string'
    ? subscription.customer
    : subscription.customer.id;

  // If tier changed, generate a new license key
  const existingTier = subscription.metadata?.license_tier;
  if (existingTier !== tier) {
    const expiresAt = new Date(getSubscriptionPeriodEnd(subscription) * 1000);
    const licenseKey = generateLicenseKey(tier, expiresAt, signingSecret);

    await stripe.subscriptions.update(subscription.id, {
      metadata: {
        product: 'migrationpilot',
        license_key: licenseKey,
        license_tier: tier,
        license_expires: expiresAt.toISOString().slice(0, 10),
      },
    });

    const customer = await stripe.customers.retrieve(customerId);
    const email = (!customer.deleted && customer.email) ? customer.email : undefined;

    return { handled: true, event: 'customer.subscription.updated', customerId, licenseKey, tier, email };
  }

  return {
    handled: true,
    event: 'customer.subscription.updated',
    customerId,
    tier,
  };
}

/**
 * Handle subscription deleted (cancelled).
 * License key naturally expires at current_period_end — no revocation needed.
 */
function handleSubscriptionDeleted(
  subscription: Stripe.Subscription,
): WebhookResult {
  if (subscription.metadata?.product !== 'migrationpilot') {
    return { handled: false, event: 'customer.subscription.deleted' };
  }

  const customerId = typeof subscription.customer === 'string'
    ? subscription.customer
    : subscription.customer.id;

  return {
    handled: true,
    event: 'customer.subscription.deleted',
    customerId,
    tier: 'free',
  };
}

/**
 * Handle invoice.paid — refresh the license key on each billing cycle renewal.
 * This ensures the key expiry stays aligned with the subscription period.
 */
async function handleInvoicePaid(
  stripe: Stripe,
  invoice: Stripe.Invoice,
  signingSecret: string,
): Promise<WebhookResult> {
  const subscriptionId = getInvoiceSubscriptionId(invoice);

  if (!subscriptionId) {
    return { handled: false, event: 'invoice.paid' };
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);

  if (subscription.metadata?.product !== 'migrationpilot') {
    return { handled: false, event: 'invoice.paid' };
  }

  const tier = resolveTierFromSubscription(subscription);
  const customerId = typeof subscription.customer === 'string'
    ? subscription.customer
    : subscription.customer.id;

  // Generate a fresh key with the new period end
  const expiresAt = new Date(getSubscriptionPeriodEnd(subscription) * 1000);
  const licenseKey = generateLicenseKey(tier, expiresAt, signingSecret);

  await stripe.subscriptions.update(subscriptionId, {
    metadata: {
      product: 'migrationpilot',
      license_key: licenseKey,
      license_tier: tier,
      license_expires: expiresAt.toISOString().slice(0, 10),
    },
  });

  const customer = await stripe.customers.retrieve(customerId);
  const email = (!customer.deleted && customer.email) ? customer.email : undefined;

  return {
    handled: true,
    event: 'invoice.paid',
    customerId,
    licenseKey,
    tier,
    email,
  };
}

/**
 * Resolve tier from a subscription's price metadata or product name.
 * Falls back to 'pro' if unable to determine.
 */
function resolveTierFromSubscription(subscription: Stripe.Subscription): Exclude<LicenseTier, 'free'> {
  // Check price metadata first (most reliable)
  const item = subscription.items.data[0];
  if (item?.price?.metadata?.tier && isValidPaidTier(item.price.metadata.tier)) {
    return item.price.metadata.tier;
  }

  // Check subscription metadata (set by us on previous events)
  const metaTier = subscription.metadata?.license_tier;
  if (metaTier && isValidPaidTier(metaTier)) return metaTier;

  // Check price lookup_key pattern (e.g., 'migrationpilot_pro_monthly')
  const lookupKey = item?.price?.lookup_key ?? '';
  if (lookupKey.includes('enterprise')) return 'enterprise';
  if (lookupKey.includes('team')) return 'team';

  return 'pro';
}

function isValidPaidTier(tier: string): tier is Exclude<LicenseTier, 'free'> {
  return tier === 'pro' || tier === 'team' || tier === 'enterprise';
}
