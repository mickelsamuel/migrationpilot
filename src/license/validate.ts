/**
 * License key validation for MigrationPilot paid tiers.
 *
 * Key format: MP-v<VERSION>-<TIER>-<EXPIRY>-<BASE64URL_SIGNATURE>
 * Example:    MP-v2-ORG-20271231-<ed25519-signature-base64url>
 *
 * - VERSION: which signing key made it (see public-keys.ts)
 * - TIER: ORG, or one of the legacy PRO, TEAM, ENTERPRISE
 * - EXPIRY: YYYYMMDD date
 * - SIGNATURE: Ed25519 signature of "MP-v<VERSION>-<TIER>-<EXPIRY>" (base64url encoded)
 *
 * Validation uses asymmetric cryptography (Ed25519):
 * - Private key: server-only (Vercel webhook), used to SIGN license keys
 * - Public key: embedded in CLI, used to VERIFY license keys
 * - Even if someone extracts the public key, they CANNOT forge signatures
 */

import { sign, verify, createPublicKey, createPrivateKey } from 'node:crypto';
import { CURRENT_KEY_VERSION, PUBLIC_KEYS } from './public-keys.js';

export type LicenseTier = 'free' | 'org' | 'pro' | 'team' | 'enterprise';

export interface LicenseStatus {
  valid: boolean;
  tier: LicenseTier;
  expiresAt?: Date;
  error?: string;
}

/** A key with no version in it was signed with version 1, which is retired. */
const UNVERSIONED_KEY_VERSION = '1';

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
  const key = (licenseKey || process.env.MIGRATIONPILOT_LICENSE_KEY)?.trim();

  if (!key) {
    return { valid: true, tier: 'free' };
  }

  return validateKey(key);
}

/**
 * Parse and validate a license key string.
 *
 * Supports two formats:
 * - Legacy:    MP-TIER-EXPIRY-SIGNATURE (uses default key version)
 * - Versioned: MP-v1-TIER-EXPIRY-SIGNATURE (explicit key version)
 */
function validateKey(key: string): LicenseStatus {
  const firstDash = key.indexOf('-');
  if (firstDash === -1 || key.slice(0, firstDash) !== 'MP') {
    return { valid: false, tier: 'free', error: 'Invalid key format' };
  }

  const afterPrefix = key.slice(firstDash + 1);
  const secondDash = afterPrefix.indexOf('-');
  if (secondDash === -1) {
    return { valid: false, tier: 'free', error: 'Invalid key format' };
  }

  // Detect versioned format: MP-v1-TIER-EXPIRY-SIG
  let keyVersion: string;
  let tierStr: string;
  let rest: string; // "EXPIRY-SIGNATURE"

  const firstPart = afterPrefix.slice(0, secondDash);
  if (/^v\d+$/.test(firstPart)) {
    // Versioned format
    keyVersion = firstPart.slice(1);
    const afterVersion = afterPrefix.slice(secondDash + 1);
    const nextDash = afterVersion.indexOf('-');
    if (nextDash === -1) {
      return { valid: false, tier: 'free', error: 'Invalid key format' };
    }
    tierStr = afterVersion.slice(0, nextDash);
    rest = afterVersion.slice(nextDash + 1);
  } else {
    // Legacy format
    keyVersion = UNVERSIONED_KEY_VERSION;
    tierStr = firstPart;
    rest = afterPrefix.slice(secondDash + 1);
  }

  const expiryDash = rest.indexOf('-');
  if (expiryDash === -1) {
    return { valid: false, tier: 'free', error: 'Invalid key format' };
  }

  const expiryStr = rest.slice(0, expiryDash);
  const signature = rest.slice(expiryDash + 1);

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

  // Check if expired — return tier:'free' to prevent accidental Pro access
  if (expiresAt < new Date()) {
    return { valid: false, tier: 'free', expiresAt, error: 'License expired' };
  }

  // Look up the public key for this version
  const publicKeyPem = PUBLIC_KEYS[keyVersion];
  if (!publicKeyPem) {
    return {
      valid: false,
      tier: 'free',
      error: keyVersion === UNVERSIONED_KEY_VERSION
        ? 'This key was signed with a retired signing key; write to hello@migrationpilot.dev for a new one'
        : 'Unknown key version',
    };
  }

  // Verify Ed25519 signature against the payload
  // Payload includes version prefix for versioned keys
  const payload = /^v\d+$/.test(firstPart)
    ? `MP-v${keyVersion}-${tierStr}-${expiryStr}`
    : `MP-${tierStr}-${expiryStr}`;

  try {
    const publicKey = createPublicKey(publicKeyPem);
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
  const payload = `MP-v${CURRENT_KEY_VERSION}-${tierStr}-${expiryStr}`;

  const privateKey = createPrivateKey(keyPem);
  const signature = sign(null, Buffer.from(payload), privateKey);
  return `${payload}-${signature.toString('base64url')}`;
}

/**
 * Check if a license allows access to Pro features.
 */
export function isProOrAbove(status: LicenseStatus): boolean {
  if (!status.valid) return false;
  return status.tier !== 'free';
}

/**
 * Does this license turn on the Org plan features: the config's `policy` block
 * and its audit log? Any valid paid key does. The legacy tiers predate the Org
 * plan and are kept so a key sold under them keeps working.
 */
export function hasOrgFeatures(status: LicenseStatus): boolean {
  return isProOrAbove(status);
}

// --- Internal helpers ---

function parseTier(str: string): LicenseTier | null {
  const map: Record<string, LicenseTier> = {
    'ORG': 'org',
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

  // Use UTC to avoid timezone-dependent expiry behavior
  const date = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));

  if (isNaN(date.getTime())) return null;
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) return null;

  return date;
}

function formatExpiry(date: Date): string {
  // UTC, to match parseExpiry above and the ISO date the webhook stores on the
  // subscription. Reading local date parts here handed a key one day earlier
  // than the expiry it was issued for, anywhere west of UTC.
  const y = date.getUTCFullYear().toString();
  const m = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const d = date.getUTCDate().toString().padStart(2, '0');
  return `${y}${m}${d}`;
}
