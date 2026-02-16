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
 * - MIGRATIONPILOT_SIGNING_SECRET
 * - RESEND_API_KEY (optional — skips email if not set)
 * - EMAIL_FROM (optional)
 */
export interface WebhookResponse {
    status: number;
    body: string;
}
export interface WebhookConfig {
    stripeSecretKey: string;
    stripeWebhookSecret: string;
    signingSecret: string;
    resendApiKey?: string;
    emailFrom?: string;
}
/**
 * Load webhook config from environment variables.
 * Throws if required variables are missing.
 */
export declare function loadWebhookConfig(): WebhookConfig;
/**
 * Process a Stripe webhook request.
 *
 * @param rawBody - Raw request body (string or Buffer, NOT parsed JSON)
 * @param signature - Value of the 'stripe-signature' header
 * @param config - Webhook configuration
 * @returns Response with status code and body
 */
export declare function processWebhook(rawBody: string | Buffer, signature: string, config: WebhookConfig): Promise<WebhookResponse>;
//# sourceMappingURL=webhook.d.ts.map