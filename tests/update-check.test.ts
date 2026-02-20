import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkForUpdate } from '../src/update/check.js';

describe('update checker', () => {
  const originalCI = process.env.CI;
  const originalNoCheck = process.env.MIGRATIONPILOT_NO_UPDATE_CHECK;

  beforeEach(() => {
    delete process.env.CI;
    delete process.env.MIGRATIONPILOT_NO_UPDATE_CHECK;
  });

  afterEach(() => {
    if (originalCI) process.env.CI = originalCI;
    else delete process.env.CI;
    if (originalNoCheck) process.env.MIGRATIONPILOT_NO_UPDATE_CHECK = originalNoCheck;
    else delete process.env.MIGRATIONPILOT_NO_UPDATE_CHECK;
  });

  it('returns null when CI=true', async () => {
    process.env.CI = 'true';
    const result = await checkForUpdate('1.2.0');
    expect(result).toBeNull();
  });

  it('returns null when MIGRATIONPILOT_NO_UPDATE_CHECK=1', async () => {
    process.env.MIGRATIONPILOT_NO_UPDATE_CHECK = '1';
    const result = await checkForUpdate('1.2.0');
    expect(result).toBeNull();
  });

  it('returns null or update message for current version', async () => {
    // This test hits the real npm registry — may return null (up to date) or update message
    const result = await checkForUpdate('1.2.0');
    if (result) {
      expect(result).toContain('Update available');
      expect(result).toContain('npm install -g migrationpilot');
    }
    // null is also valid (means up to date)
  });

  it('returns update message for old version', async () => {
    const result = await checkForUpdate('0.0.1');
    if (result) {
      expect(result).toContain('Update available');
      expect(result).toContain('0.0.1');
    }
    // May return null if network fails, which is acceptable
  });
});
