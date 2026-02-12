/**
 * License key validation for paid tiers.
 * Validates against MigrationPilot API, with 7-day offline cache.
 *
 * Placeholder — will be implemented in Phase C (Weeks 9-10)
 */

export interface LicenseStatus {
  valid: boolean;
  tier: 'free' | 'pro' | 'team' | 'enterprise';
  expiresAt?: Date;
}

export async function validateLicense(): Promise<LicenseStatus> {
  // Phase C implementation
  return { valid: true, tier: 'free' };
}
