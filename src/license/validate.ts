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

import { createHmac, timingSafeEqual } from 'node:crypto';

export type LicenseTier = 'free' | 'pro' | 'team' | 'enterprise';

export interface LicenseStatus {
  valid: boolean;
  tier: LicenseTier;
  expiresAt?: Date;
  error?: string;
}

/**
 * The signing secret used for HMAC-SHA256 key generation/validation.
 * In production, this would be set via environment variable.
 * For the open-source CLI, this is the default development key.
 */
const SIGNING_SECRET = process.env.MIGRATIONPILOT_SIGNING_SECRET || 'mp-dev-signing-secret-do-not-use-in-production';

/**
 * Validates a license key and returns the license status.
 *
 * Reads from:
 * 1. Explicit key parameter
 * 2. MIGRATIONPILOT_LICENSE_KEY environment variable
 *
 * Returns { valid: true, tier: 'free' } if no key is provided (free tier).
 */
export function validateLicense(licenseKey?: string): LicenseStatus {
  const key = licenseKey || process.env.MIGRATIONPILOT_LICENSE_KEY;

  if (!key) {
    return { valid: true, tier: 'free' };
  }

  return validateKey(key);
}

/**
 * Parse and validate a license key string.
 */
function validateKey(key: string): LicenseStatus {
  const parts = key.split('-');

  // Expected: MP-TIER-EXPIRY-SIGNATURE (4 parts with prefix)
  if (parts.length !== 4 || parts[0] !== 'MP') {
    return { valid: false, tier: 'free', error: 'Invalid key format' };
  }

  const [, tierStr, expiryStr, signature] = parts;

  // Validate tier
  const tier = parseTier(tierStr);
  if (!tier) {
    return { valid: false, tier: 'free', error: `Unknown tier: ${tierStr}` };
  }

  // Validate expiry date format
  const expiresAt = parseExpiry(expiryStr);
  if (!expiresAt) {
    return { valid: false, tier: 'free', error: 'Invalid expiry date' };
  }

  // Check if expired
  if (expiresAt < new Date()) {
    return { valid: false, tier, expiresAt, error: 'License expired' };
  }

  // Verify HMAC signature
  const payload = `MP-${tierStr}-${expiryStr}`;
  const expectedSignature = computeSignature(payload);

  if (!safeCompare(signature, expectedSignature)) {
    return { valid: false, tier: 'free', error: 'Invalid signature' };
  }

  return { valid: true, tier, expiresAt };
}

/**
 * Generate a license key for the given tier and expiry.
 * Used by the Stripe webhook handler to create keys after payment.
 */
export function generateLicenseKey(
  tier: Exclude<LicenseTier, 'free'>,
  expiresAt: Date,
  secret?: string
): string {
  const tierStr = tier.toUpperCase();
  const expiryStr = formatExpiry(expiresAt);
  const payload = `MP-${tierStr}-${expiryStr}`;
  const signature = computeSignature(payload, secret);
  return `${payload}-${signature}`;
}

/**
 * Check if a license allows access to Pro features.
 */
export function isProOrAbove(status: LicenseStatus): boolean {
  if (!status.valid) return false;
  return status.tier === 'pro' || status.tier === 'team' || status.tier === 'enterprise';
}

// --- Internal helpers ---

function parseTier(str: string): LicenseTier | null {
  const map: Record<string, LicenseTier> = {
    'PRO': 'pro',
    'TEAM': 'team',
    'ENTERPRISE': 'enterprise',
  };
  return map[str.toUpperCase()] ?? null;
}

function parseExpiry(str: string): Date | null {
  if (!/^\d{8}$/.test(str)) return null;

  const year = parseInt(str.slice(0, 4), 10);
  const month = parseInt(str.slice(4, 6), 10) - 1;
  const day = parseInt(str.slice(6, 8), 10);

  const date = new Date(year, month, day, 23, 59, 59, 999);

  if (isNaN(date.getTime())) return null;
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) return null;

  return date;
}

function formatExpiry(date: Date): string {
  const y = date.getFullYear().toString();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}${m}${d}`;
}

function computeSignature(payload: string, secret?: string): string {
  return createHmac('sha256', secret || SIGNING_SECRET)
    .update(payload)
    .digest('hex')
    .slice(0, 32); // First 32 chars of hex digest (128 bits — enough for tamper-proofing)
}

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}
