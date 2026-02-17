/**
 * License key validation for MigrationPilot paid tiers.
 *
 * Key format: MP-<TIER>-<EXPIRY>-<BASE64URL_SIGNATURE>
 * Example:    MP-PRO-20261231-<ed25519-signature-base64url>
 *
 * - TIER: PRO, TEAM, or ENTERPRISE
 * - EXPIRY: YYYYMMDD date
 * - SIGNATURE: Ed25519 signature of "MP-<TIER>-<EXPIRY>" (base64url encoded)
 *
 * Validation uses asymmetric cryptography (Ed25519):
 * - Private key: server-only (Vercel webhook), used to SIGN license keys
 * - Public key: embedded in CLI, used to VERIFY license keys
 * - Even if someone extracts the public key, they CANNOT forge signatures
 */

import { sign, verify, createPublicKey, createPrivateKey } from 'node:crypto';

export type LicenseTier = 'free' | 'pro' | 'team' | 'enterprise';

export interface LicenseStatus {
  valid: boolean;
  tier: LicenseTier;
  expiresAt?: Date;
  error?: string;
}

/**
 * Ed25519 public key for license verification.
 * This is safe to embed — public keys cannot be used to forge signatures.
 */
const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAcDLU0la74O2PoN2oN9kJ+R9ytt8SsygL3nAqW8n7sbg=
-----END PUBLIC KEY-----`;

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
  // Format: MP-TIER-EXPIRY-SIGNATURE
  // The signature is base64url which may contain hyphens, so split carefully
  const firstDash = key.indexOf('-');
  if (firstDash === -1 || key.slice(0, firstDash) !== 'MP') {
    return { valid: false, tier: 'free', error: 'Invalid key format' };
  }

  const afterPrefix = key.slice(firstDash + 1); // "TIER-EXPIRY-SIGNATURE"
  const secondDash = afterPrefix.indexOf('-');
  if (secondDash === -1) {
    return { valid: false, tier: 'free', error: 'Invalid key format' };
  }

  const tierStr = afterPrefix.slice(0, secondDash);
  const afterTier = afterPrefix.slice(secondDash + 1); // "EXPIRY-SIGNATURE"
  const thirdDash = afterTier.indexOf('-');
  if (thirdDash === -1) {
    return { valid: false, tier: 'free', error: 'Invalid key format' };
  }

  const expiryStr = afterTier.slice(0, thirdDash);
  const signature = afterTier.slice(thirdDash + 1);

  if (!tierStr || !expiryStr || !signature) {
    return { valid: false, tier: 'free', error: 'Invalid key format' };
  }

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

  // Verify Ed25519 signature
  const payload = `MP-${tierStr}-${expiryStr}`;

  try {
    const publicKey = createPublicKey(PUBLIC_KEY_PEM);
    const signatureBuffer = Buffer.from(signature, 'base64url');
    const isValid = verify(null, Buffer.from(payload), publicKey, signatureBuffer);

    if (!isValid) {
      return { valid: false, tier: 'free', error: 'Invalid signature' };
    }
  } catch {
    return { valid: false, tier: 'free', error: 'Invalid signature' };
  }

  return { valid: true, tier, expiresAt };
}

/**
 * Generate a license key for the given tier and expiry.
 * Used by the Stripe webhook handler to create keys after payment.
 *
 * Requires the Ed25519 private key (PEM format).
 * The private key is NEVER embedded in the CLI — it exists only on the server.
 */
export function generateLicenseKey(
  tier: Exclude<LicenseTier, 'free'>,
  expiresAt: Date,
  privateKeyPem?: string,
): string {
  const keyPem = privateKeyPem || process.env.MIGRATIONPILOT_SIGNING_PRIVATE_KEY;
  if (!keyPem) {
    throw new Error('Ed25519 private key not available. Set MIGRATIONPILOT_SIGNING_PRIVATE_KEY environment variable.');
  }

  const tierStr = tier.toUpperCase();
  const expiryStr = formatExpiry(expiresAt);
  const payload = `MP-${tierStr}-${expiryStr}`;

  const privateKey = createPrivateKey(keyPem);
  const signature = sign(null, Buffer.from(payload), privateKey);
  return `${payload}-${signature.toString('base64url')}`;
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
