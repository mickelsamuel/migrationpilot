/**
 * License key validation for MigrationPilot paid tiers.
 *
 * Key format: MP-<TIER>-<EXPIRY>-<SIGNATURE>
 * Example:    MP-PRO-20261231-a1b2c3d4e5f6...
 *
 * - TIER: PRO, TEAM, or ENTERPRISE
 * - EXPIRY: YYYYMMDD date
 * - SIGNATURE: HMAC-SHA256 of "MP-<TIER>-<EXPIRY>" using the signing secret
 *
 * Validation is 100% client-side — no API calls needed.
 * The signing secret is baked into the key generation side (Stripe webhook).
 * Validation uses the public verification approach (re-compute and compare).
 */
export type LicenseTier = 'free' | 'pro' | 'team' | 'enterprise';
export interface LicenseStatus {
    valid: boolean;
    tier: LicenseTier;
    expiresAt?: Date;
    error?: string;
}
/**
 * Validates a license key and returns the license status.
 *
 * Reads from:
 * 1. Explicit key parameter
 * 2. MIGRATIONPILOT_LICENSE_KEY environment variable
 *
 * Returns { valid: true, tier: 'free' } if no key is provided (free tier).
 */
export declare function validateLicense(licenseKey?: string): LicenseStatus;
/**
 * Generate a license key for the given tier and expiry.
 * Used by the Stripe webhook handler to create keys after payment.
 */
export declare function generateLicenseKey(tier: Exclude<LicenseTier, 'free'>, expiresAt: Date, secret?: string): string;
/**
 * Check if a license allows access to Pro features.
 */
export declare function isProOrAbove(status: LicenseStatus): boolean;
//# sourceMappingURL=validate.d.ts.map