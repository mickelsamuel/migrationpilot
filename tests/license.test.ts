import { describe, it, expect, afterEach, vi } from 'vitest';
import { createPrivateKey, generateKeyPairSync, sign } from 'node:crypto';

// A signing pair made for this run. The mock puts its public half where the CLI
// looks for key version 2, so these tests never need the real signing key,
// which lives only in the server's environment.
const TEST_KEYS = await vi.hoisted(async () => {
  const { generateKeyPairSync } = await import('node:crypto');
  return generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
});

vi.mock('../src/license/public-keys.js', () => ({
  PUBLIC_KEYS: { '2': TEST_KEYS.publicKey },
  CURRENT_KEY_VERSION: '2',
}));

import { validateLicense, generateLicenseKey, isProOrAbove, hasOrgFeatures } from '../src/license/validate.js';

const TEST_PRIVATE_KEY = TEST_KEYS.privateKey;

/** Sign any payload with the test key, to build keys generateLicenseKey won't. */
function signed(payload: string): string {
  const sig = sign(null, Buffer.from(payload), createPrivateKey(TEST_PRIVATE_KEY));
  return `${payload}-${sig.toString('base64url')}`;
}

describe('generateLicenseKey', () => {
  it('generates a key with correct format', () => {
    const key = generateLicenseKey('pro', new Date(Date.UTC(2027, 0, 1)), TEST_PRIVATE_KEY);
    // Format: MP-v2-PRO-YYYYMMDD-<base64url signature>
    expect(key).toMatch(/^MP-v2-PRO-20270101-.+$/);
    // Ed25519 signature is 64 bytes → 86 chars in base64url
    const sig = key.split('-').slice(4).join('-');
    expect(sig.length).toBeGreaterThan(40);
  });

  it('generates different keys for different tiers', () => {
    const expiry = new Date(2027, 5, 15);
    const orgKey = generateLicenseKey('org', expiry, TEST_PRIVATE_KEY);
    const proKey = generateLicenseKey('pro', expiry, TEST_PRIVATE_KEY);
    const teamKey = generateLicenseKey('team', expiry, TEST_PRIVATE_KEY);
    const enterpriseKey = generateLicenseKey('enterprise', expiry, TEST_PRIVATE_KEY);

    expect(orgKey).toContain('MP-v2-ORG-');
    expect(proKey).toContain('MP-v2-PRO-');
    expect(teamKey).toContain('MP-v2-TEAM-');
    expect(enterpriseKey).toContain('MP-v2-ENTERPRISE-');

    // All different signatures
    expect(orgKey).not.toBe(proKey);
    expect(proKey).not.toBe(teamKey);
    expect(teamKey).not.toBe(enterpriseKey);
  });

  it('generates different keys for different expiry dates', () => {
    const key1 = generateLicenseKey('pro', new Date(2027, 0, 1), TEST_PRIVATE_KEY);
    const key2 = generateLicenseKey('pro', new Date(2027, 6, 1), TEST_PRIVATE_KEY);
    expect(key1).not.toBe(key2);
  });

  it('generates deterministic keys for same inputs', () => {
    const key1 = generateLicenseKey('pro', new Date(2027, 0, 1), TEST_PRIVATE_KEY);
    const key2 = generateLicenseKey('pro', new Date(2027, 0, 1), TEST_PRIVATE_KEY);
    expect(key1).toBe(key2);
  });

  // The date in the key is the UTC date, the same one parseExpiry reads back and
  // the webhook stores as license_expires. Formatting it from local parts issued
  // keys that expired a day early for anyone west of UTC.
  it('stamps the UTC date, not the local one', () => {
    // 2027-01-01T02:00Z is still 2026-12-31 in every timezone west of UTC.
    const key = generateLicenseKey('pro', new Date('2027-01-01T02:00:00Z'), TEST_PRIVATE_KEY);
    expect(key).toMatch(/^MP-v2-PRO-20270101-/);
    expect(validateLicense(key).expiresAt?.toISOString().slice(0, 10)).toBe('2027-01-01');
  });

  it('throws without private key', () => {
    const orig = process.env.MIGRATIONPILOT_SIGNING_PRIVATE_KEY;
    delete process.env.MIGRATIONPILOT_SIGNING_PRIVATE_KEY;
    expect(() => generateLicenseKey('pro', new Date(2027, 0, 1))).toThrow('private key');
    if (orig) process.env.MIGRATIONPILOT_SIGNING_PRIVATE_KEY = orig;
  });
});

describe('validateLicense', () => {
  it('returns free tier when no key provided', () => {
    const status = validateLicense();
    expect(status.valid).toBe(true);
    expect(status.tier).toBe('free');
  });

  it('validates an Org key', () => {
    const key = generateLicenseKey('org', new Date(2027, 11, 31), TEST_PRIVATE_KEY);
    const status = validateLicense(key);
    expect(status.valid).toBe(true);
    expect(status.tier).toBe('org');
    expect(status.expiresAt).toBeDefined();
  });

  it('validates a correctly generated Pro key', () => {
    const key = generateLicenseKey('pro', new Date(2027, 11, 31), TEST_PRIVATE_KEY);
    const status = validateLicense(key);
    expect(status.valid).toBe(true);
    expect(status.tier).toBe('pro');
    expect(status.expiresAt).toBeDefined();
  });

  it('validates a Team key', () => {
    const key = generateLicenseKey('team', new Date(2027, 5, 15), TEST_PRIVATE_KEY);
    const status = validateLicense(key);
    expect(status.valid).toBe(true);
    expect(status.tier).toBe('team');
  });

  it('validates an Enterprise key', () => {
    const key = generateLicenseKey('enterprise', new Date(2028, 0, 1), TEST_PRIVATE_KEY);
    const status = validateLicense(key);
    expect(status.valid).toBe(true);
    expect(status.tier).toBe('enterprise');
  });

  it('rejects expired key', () => {
    const key = generateLicenseKey('pro', new Date(2020, 0, 1), TEST_PRIVATE_KEY);
    const status = validateLicense(key);
    expect(status.valid).toBe(false);
    expect(status.error).toContain('expired');
  });

  it('rejects tampered signature', () => {
    const key = generateLicenseKey('pro', new Date(2027, 11, 31), TEST_PRIVATE_KEY);
    const tampered = key.slice(0, -5) + 'xxxxx';
    const status = validateLicense(tampered);
    expect(status.valid).toBe(false);
    expect(status.error).toContain('signature');
  });

  it('rejects tampered tier', () => {
    const key = generateLicenseKey('pro', new Date(2027, 11, 31), TEST_PRIVATE_KEY);
    // Change PRO to ENTERPRISE but keep old signature
    const tampered = key.replace('-PRO-', '-ENTERPRISE-');
    const status = validateLicense(tampered);
    expect(status.valid).toBe(false);
  });

  it('rejects tampered expiry', () => {
    const key = generateLicenseKey('pro', new Date(Date.UTC(2027, 0, 1)), TEST_PRIVATE_KEY);
    // Change expiry to a later date but keep old signature
    const tampered = key.replace('20270101', '20291231');
    const status = validateLicense(tampered);
    expect(status.valid).toBe(false);
  });

  it('rejects key signed with wrong private key', () => {
    // Generate a different key pair
    const { privateKey: wrongKey } = generateKeyPairSync('ed25519', {
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    const key = generateLicenseKey('pro', new Date(2027, 11, 31), wrongKey);
    const status = validateLicense(key);
    expect(status.valid).toBe(false);
    expect(status.error).toContain('signature');
  });

  it('rejects invalid format — missing parts', () => {
    const status = validateLicense('MP-PRO-20270101');
    expect(status.valid).toBe(false);
    expect(status.error).toContain('format');
  });

  it('rejects invalid format — wrong prefix', () => {
    const status = validateLicense('XX-PRO-20270101-abcdef1234567890abcdef1234567890');
    expect(status.valid).toBe(false);
    expect(status.error).toContain('format');
  });

  it('rejects invalid tier', () => {
    const status = validateLicense('MP-GOLD-20270101-abcdef1234567890abcdef1234567890');
    expect(status.valid).toBe(false);
    expect(status.error).toContain('tier');
  });

  it('rejects invalid date format (non-8-digit expiry)', () => {
    const status = validateLicense('MP-PRO-202701-abcdef1234567890abcdef1234567890');
    expect(status.valid).toBe(false);
    expect(status.error).toContain('expiry');
  });

  it('rejects completely garbage input', () => {
    const status = validateLicense('not-a-license-key');
    expect(status.valid).toBe(false);
  });
});

// Version 1's private key was in this repository, so anyone could sign with it.
// A key from that era is refused whatever its signature, with a way to get a new one.
describe('retired signing key', () => {
  it('refuses a key in the unversioned format, which version 1 signed', () => {
    const status = validateLicense(signed('MP-ENTERPRISE-20991231'));
    expect(status.valid).toBe(false);
    expect(status.tier).toBe('free');
    expect(status.error).toContain('retired');
  });

  it('refuses a key that names version 1', () => {
    const status = validateLicense(signed('MP-v1-ORG-20991231'));
    expect(status.valid).toBe(false);
    expect(status.error).toContain('retired');
  });

  it('refuses a version it has no public key for', () => {
    const status = validateLicense(signed('MP-v9-ORG-20991231'));
    expect(status.valid).toBe(false);
    expect(status.error).toBe('Unknown key version');
  });

  it('accepts the same payload once it names the current version', () => {
    const status = validateLicense(signed('MP-v2-ORG-20991231'));
    expect(status.valid).toBe(true);
    expect(status.tier).toBe('org');
  });
});

describe('isProOrAbove', () => {
  it('returns false for free tier', () => {
    expect(isProOrAbove({ valid: true, tier: 'free' })).toBe(false);
  });

  it('returns true for org tier', () => {
    expect(isProOrAbove({ valid: true, tier: 'org' })).toBe(true);
  });

  it('returns true for pro tier', () => {
    expect(isProOrAbove({ valid: true, tier: 'pro' })).toBe(true);
  });

  it('returns true for team tier', () => {
    expect(isProOrAbove({ valid: true, tier: 'team' })).toBe(true);
  });

  it('returns true for enterprise tier', () => {
    expect(isProOrAbove({ valid: true, tier: 'enterprise' })).toBe(true);
  });

  it('returns false for invalid license even with pro tier', () => {
    expect(isProOrAbove({ valid: false, tier: 'pro', error: 'expired' })).toBe(false);
  });
});

describe('hasOrgFeatures', () => {
  it('is on for a valid Org key', () => {
    expect(hasOrgFeatures(validateLicense(generateLicenseKey('org', new Date(2027, 11, 31), TEST_PRIVATE_KEY)))).toBe(true);
  });

  it('is on for a valid key from a legacy paid tier', () => {
    expect(hasOrgFeatures(validateLicense(generateLicenseKey('pro', new Date(2027, 11, 31), TEST_PRIVATE_KEY)))).toBe(true);
  });

  it('is off with no key', () => {
    expect(hasOrgFeatures(validateLicense())).toBe(false);
  });

  it('is off for an expired key', () => {
    expect(hasOrgFeatures(validateLicense(generateLicenseKey('org', new Date(2020, 0, 1), TEST_PRIVATE_KEY)))).toBe(false);
  });

  it('is off for a forged key', () => {
    const { privateKey } = generateKeyPairSync('ed25519', {
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    expect(hasOrgFeatures(validateLicense(generateLicenseKey('org', new Date(2099, 11, 31), privateKey)))).toBe(false);
  });
});

describe('environment variable fallback', () => {
  const originalEnv = process.env.MIGRATIONPILOT_LICENSE_KEY;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.MIGRATIONPILOT_LICENSE_KEY = originalEnv;
    } else {
      delete process.env.MIGRATIONPILOT_LICENSE_KEY;
    }
  });

  it('reads key from MIGRATIONPILOT_LICENSE_KEY env var', () => {
    const key = generateLicenseKey('pro', new Date(2027, 11, 31), TEST_PRIVATE_KEY);
    process.env.MIGRATIONPILOT_LICENSE_KEY = key;
    const status = validateLicense();
    expect(status.valid).toBe(true);
    expect(status.tier).toBe('pro');
  });

  it('explicit key takes precedence over env var', () => {
    const proKey = generateLicenseKey('pro', new Date(2027, 11, 31), TEST_PRIVATE_KEY);
    const teamKey = generateLicenseKey('team', new Date(2027, 11, 31), TEST_PRIVATE_KEY);
    process.env.MIGRATIONPILOT_LICENSE_KEY = teamKey;
    const status = validateLicense(proKey);
    expect(status.tier).toBe('pro');
  });
});

describe('Feature gating integration', () => {
  it('no rule is gated behind a license', async () => {
    const { allRules, staticRules } = await import('../src/rules/index.js');

    // MP013/MP014/MP019 were once withheld from unlicensed users. Nothing is
    // withheld now — the only thing that limits a rule is whether it needs a
    // database connection.
    for (const id of ['MP013', 'MP014', 'MP019']) {
      expect(allRules.map(r => r.id)).toContain(id);
    }

    const needsDatabase = allRules.filter(r => r.requiresDatabaseUrl);
    expect(staticRules.length).toBe(allRules.length - needsDatabase.length);
  });
});
