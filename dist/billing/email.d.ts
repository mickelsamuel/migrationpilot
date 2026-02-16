/**
 * Email delivery for MigrationPilot license keys.
 *
 * Uses the Resend API (https://resend.com) for transactional email.
 * Falls back to a no-op in development when RESEND_API_KEY is not set.
 *
 * Environment variables:
 * - RESEND_API_KEY: Resend API key for sending emails
 * - EMAIL_FROM: Sender address (default: noreply@migrationpilot.dev)
 *
 * IMPORTANT: The sender domain (migrationpilot.dev) must be verified in Resend
 * with SPF, DKIM, and DMARC DNS records before emails will be delivered.
 */
export interface EmailConfig {
    resendApiKey: string;
    from?: string;
}
export interface LicenseEmailParams {
    to: string;
    licenseKey: string;
    tier: string;
    expiresAt: string;
}
export interface EmailResult {
    sent: boolean;
    id?: string;
    error?: string;
}
/**
 * Send a license key email to the customer.
 */
export declare function sendLicenseKeyEmail(config: EmailConfig, params: LicenseEmailParams): Promise<EmailResult>;
//# sourceMappingURL=email.d.ts.map