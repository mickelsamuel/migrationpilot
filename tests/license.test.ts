import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateLicense, generateLicenseKey, isProOrAbove } from '../src/license/validate.js';
import type { LicenseStatus } from '../src/license/validate.js';

describe('generateLicenseKey', () => {
  it('generates a key with correct format', () => {
    const key = generateLicenseKey('pro', new Date(2027, 0, 1));
    expect(key).toMatch(/^MP-PRO-20270101-[a-f0-9]{32}$/);
  });

  it('generates different keys for different tiers', () => {
    const expiry = new Date(2027, 5, 15);
    const proKey = generateLicenseKey('pro', expiry);
    const teamKey = generateLicenseKey('team', expiry);
    const enterpriseKey = generateLicenseKey('enterprise', expiry);

    expect(proKey).toContain('MP-PRO-');
    expect(teamKey).toContain('MP-TEAM-');
    expect(enterpriseKey).toContain('MP-ENTERPRISE-');

    // All different signatures
    expect(proKey).not.toBe(teamKey);
    expect(teamKey).not.toBe(enterpriseKey);
  });

  it('generates different keys for different expiry dates', () => {
    const key1 = generateLicenseKey('pro', new Date(2027, 0, 1));
    const key2 = generateLicenseKey('pro', new Date(2027, 6, 1));
    expect(key1).not.toBe(key2);
  });
});

describe('validateLicense', () => {
  it('returns free tier when no key provided', () => {
    const status = validateLicense();
    expect(status.valid).toBe(true);
    expect(status.tier).toBe('free');
  });

  it('validates a correctly generated Pro key', () => {
    const key = generateLicenseKey('pro', new Date(2027, 11, 31));
    const status = validateLicense(key);
    expect(status.valid).toBe(true);
    expect(status.tier).toBe('pro');
    expect(status.expiresAt).toBeDefined();
  });

  it('validates a Team key', () => {
    const key = generateLicenseKey('team', new Date(2027, 5, 15));
    const status = validateLicense(key);
    expect(status.valid).toBe(true);
    expect(status.tier).toBe('team');
  });

  it('validates an Enterprise key', () => {
    const key = generateLicenseKey('enterprise', new Date(2028, 0, 1));
    const status = validateLicense(key);
    expect(status.valid).toBe(true);
    expect(status.tier).toBe('enterprise');
  });

  it('rejects expired key', () => {
    const key = generateLicenseKey('pro', new Date(2020, 0, 1));
    const status = validateLicense(key);
    expect(status.valid).toBe(false);
    expect(status.error).toContain('expired');
  });

  it('rejects tampered signature', () => {
    const key = generateLicenseKey('pro', new Date(2027, 11, 31));
    const tampered = key.slice(0, -5) + 'xxxxx';
    const status = validateLicense(tampered);
    expect(status.valid).toBe(false);
    expect(status.error).toContain('signature');
  });

  it('rejects tampered tier', () => {
    const key = generateLicenseKey('pro', new Date(2027, 11, 31));
    // Change PRO to ENTERPRISE but keep old signature
    const tampered = key.replace('MP-PRO-', 'MP-ENTERPRISE-');
    const status = validateLicense(tampered);
    expect(status.valid).toBe(false);
  });

  it('rejects tampered expiry', () => {
    const key = generateLicenseKey('pro', new Date(2027, 0, 1));
    // Change expiry to a later date but keep old signature
    const tampered = key.replace('20270101', '20291231');
    const status = validateLicense(tampered);
    expect(status.valid).toBe(false);
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

  it('rejects invalid date format (extra dashes)', () => {
    // '2027-01' contains a dash, creating 5 parts → fails format check
    const status = validateLicense('MP-PRO-2027-01-abcdef1234567890abcdef1234567890');
    expect(status.valid).toBe(false);
    expect(status.error).toContain('format');
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

describe('isProOrAbove', () => {
  it('returns false for free tier', () => {
    expect(isProOrAbove({ valid: true, tier: 'free' })).toBe(false);
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
    const key = generateLicenseKey('pro', new Date(2027, 11, 31));
    process.env.MIGRATIONPILOT_LICENSE_KEY = key;
    const status = validateLicense();
    expect(status.valid).toBe(true);
    expect(status.tier).toBe('pro');
  });

  it('explicit key takes precedence over env var', () => {
    const proKey = generateLicenseKey('pro', new Date(2027, 11, 31));
    const teamKey = generateLicenseKey('team', new Date(2027, 11, 31));
    process.env.MIGRATIONPILOT_LICENSE_KEY = teamKey;
    const status = validateLicense(proKey);
    expect(status.tier).toBe('pro');
  });
});

describe('Feature gating integration', () => {
  it('free tier gets rules without MP013/MP014/MP019', async () => {
    const { allRules } = await import('../src/rules/index.js');
    const PRO_RULE_IDS = new Set(['MP013', 'MP014', 'MP019']);
    const freeRules = allRules.filter(r => !PRO_RULE_IDS.has(r.id));
    const proRules = allRules;

    expect(freeRules.length).toBe(allRules.length - 3);
    expect(proRules.length).toBe(allRules.length);

    // Free tier has MP001-MP012
    expect(freeRules.map(r => r.id)).toContain('MP001');
    expect(freeRules.map(r => r.id)).toContain('MP012');
    expect(freeRules.map(r => r.id)).not.toContain('MP013');
    expect(freeRules.map(r => r.id)).not.toContain('MP014');
    expect(freeRules.map(r => r.id)).not.toContain('MP019');
  });
});
