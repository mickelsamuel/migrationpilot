/**
 * Stripe billing integration for MigrationPilot Pro.
 *
 * Handles:
 * - Creating checkout sessions for Pro/Team/Enterprise subscriptions
 * - Processing webhook events (checkout complete, subscription changes)
 * - Generating license keys on successful payment
 * - Customer portal sessions for billing management
 *
 * Environment variables required:
 * - STRIPE_SECRET_KEY: Stripe secret API key
 * - STRIPE_WEBHOOK_SECRET: Webhook endpoint signing secret
 * - MIGRATIONPILOT_SIGNING_SECRET: HMAC secret for license key generation
 */
import Stripe from 'stripe';
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
export declare function createStripeClient(secretKey: string): Stripe;
/**
 * Create a Checkout Session for a new subscription.
 */
export declare function createCheckoutSession(stripe: Stripe, config: Pick<BillingConfig, 'successUrl' | 'cancelUrl'>, priceId: string, customerEmail?: string): Promise<CheckoutResult>;
/**
 * Create a Customer Portal session for managing billing.
 */
export declare function createPortalSession(stripe: Stripe, customerId: string, returnUrl: string): Promise<string>;
/**
 * Verify and parse a Stripe webhook event.
 */
export declare function verifyWebhookEvent(stripe: Stripe, payload: string | Buffer, signature: string, webhookSecret: string): Stripe.Event;
/**
 * Handle a verified Stripe webhook event.
 * Returns the result including any generated license key.
 */
export declare function handleWebhookEvent(stripe: Stripe, event: Stripe.Event, signingSecret: string): Promise<WebhookResult>;
//# sourceMappingURL=stripe.d.ts.map