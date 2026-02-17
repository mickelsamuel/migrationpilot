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
export async function sendLicenseKeyEmail(
  config: EmailConfig,
  params: LicenseEmailParams,
): Promise<EmailResult> {
  const from = config.from || 'MigrationPilot <noreply@migrationpilot.dev>';

  const html = buildLicenseEmailHtml(params);
  const text = buildLicenseEmailText(params);

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [params.to],
        subject: `Your MigrationPilot ${params.tier.charAt(0).toUpperCase() + params.tier.slice(1)} License Key`,
        html,
        text,
      }),
    }) as unknown as { ok: boolean; status: number; text: () => Promise<string>; json: () => Promise<{ id: string }> };

    if (!response.ok) {
      const body = await response.text();
      return { sent: false, error: `Resend API error (${response.status}): ${body}` };
    }

    const data = await response.json();
    return { sent: true, id: data.id };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Build the HTML email body for license key delivery.
 */
function buildLicenseEmailHtml(params: LicenseEmailParams): string {
  const tierName = params.tier.charAt(0).toUpperCase() + params.tier.slice(1);

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1a1a1a;">
  <div style="text-align: center; padding: 20px 0; border-bottom: 2px solid #2563eb;">
    <h1 style="color: #2563eb; margin: 0; font-size: 24px;">MigrationPilot</h1>
    <p style="color: #6b7280; margin: 5px 0 0;">PostgreSQL Migration Safety</p>
  </div>

  <div style="padding: 30px 0;">
    <h2 style="margin: 0 0 10px;">Welcome to MigrationPilot ${tierName}!</h2>
    <p>Thank you for your subscription. Here's your license key:</p>

    <div style="background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 8px; padding: 16px; margin: 20px 0; font-family: monospace; font-size: 14px; word-break: break-all;">
      ${params.licenseKey}
    </div>

    <h3 style="margin: 20px 0 10px;">Setup</h3>

    <p><strong>CLI:</strong></p>
    <pre style="background: #1e293b; color: #e2e8f0; padding: 12px; border-radius: 6px; overflow-x: auto; font-size: 13px;">export MIGRATIONPILOT_LICENSE_KEY="${params.licenseKey}"
migrationpilot analyze migration.sql --database-url $DATABASE_URL</pre>

    <p><strong>GitHub Action:</strong></p>
    <pre style="background: #1e293b; color: #e2e8f0; padding: 12px; border-radius: 6px; overflow-x: auto; font-size: 13px;">- uses: mickelsamuel/migrationpilot@main
  with:
    migration-path: 'migrations/*.sql'
    license-key: \${{ secrets.MIGRATIONPILOT_LICENSE_KEY }}
    database-url: \${{ secrets.DATABASE_URL }}</pre>

    <p style="color: #6b7280; font-size: 14px;">
      <strong>Tier:</strong> ${tierName}<br>
      <strong>Expires:</strong> ${params.expiresAt}<br>
      Store your key as an environment variable or GitHub secret. Never commit it to source control.
    </p>
  </div>

  <div style="border-top: 1px solid #e5e7eb; padding: 20px 0; color: #9ca3af; font-size: 12px; text-align: center;">
    <p>MigrationPilot &mdash; Know exactly what your migration will do before you merge.</p>
    <p><a href="https://migrationpilot.dev" style="color: #2563eb;">migrationpilot.dev</a> &middot; <a href="https://migrationpilot.dev/billing" style="color: #2563eb;">Manage billing</a></p>
  </div>
</body>
</html>`;
}

/**
 * Build the plain-text email body for license key delivery.
 */
function buildLicenseEmailText(params: LicenseEmailParams): string {
  const tierName = params.tier.charAt(0).toUpperCase() + params.tier.slice(1);

  return `Welcome to MigrationPilot ${tierName}!

Thank you for your subscription. Here's your license key:

${params.licenseKey}

Setup
-----

CLI:
  export MIGRATIONPILOT_LICENSE_KEY="${params.licenseKey}"
  migrationpilot analyze migration.sql --database-url $DATABASE_URL

GitHub Action:
  - uses: mickelsamuel/migrationpilot@main
    with:
      migration-path: 'migrations/*.sql'
      license-key: \${{ secrets.MIGRATIONPILOT_LICENSE_KEY }}
      database-url: \${{ secrets.DATABASE_URL }}

Tier: ${tierName}
Expires: ${params.expiresAt}

Store your key as an environment variable or GitHub secret.
Never commit it to source control.

---
MigrationPilot — Know exactly what your migration will do before you merge.
https://migrationpilot.dev
`;
}
