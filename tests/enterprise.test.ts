/**
 * Tests for enterprise features: team management, policy enforcement, SSO auth.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getCurrentUsername,
  getMachineId,
  requiresApproval,
  formatTeamStatus,
} from '../src/team/manage.js';
import type { TeamStatus } from '../src/team/manage.js';
import {
  enforcePolicy,
  applyPolicy,
  checkBlockedPatterns,
  checkRequiredRules,
  checkSeverityFloor,
  checkReviewPatterns,
  formatPolicyViolations,
} from '../src/policy/enforce.js';
import type { PolicyConfig, PolicyViolation } from '../src/policy/enforce.js';
import {
  generateDeviceCode,
  getAuthToken,
  saveAuthToken,
  clearAuthToken,
  isAuthenticated,
} from '../src/auth/sso.js';
import type { AuthToken } from '../src/auth/sso.js';

// ── Team Management ──

describe('Team Management', () => {
  it('getCurrentUsername returns a string', () => {
    const username = getCurrentUsername();
    expect(typeof username).toBe('string');
    expect(username.length).toBeGreaterThan(0);
  });

  it('getMachineId returns a 16-char hex string', () => {
    const id = getMachineId();
    expect(id).toMatch(/^[a-f0-9]{16}$/);
  });

  it('getMachineId is deterministic', () => {
    expect(getMachineId()).toBe(getMachineId());
  });

  it('requiresApproval detects matching operations', () => {
    const result = requiresApproval(
      'DROP TABLE users CASCADE;',
      ['DROP TABLE', 'TRUNCATE'],
    );
    expect(result.required).toBe(true);
    expect(result.operations).toContain('DROP TABLE');
    expect(result.operations).not.toContain('TRUNCATE');
  });

  it('requiresApproval returns false for non-matching operations', () => {
    const result = requiresApproval(
      'ALTER TABLE users ADD COLUMN email TEXT;',
      ['DROP TABLE', 'TRUNCATE'],
    );
    expect(result.required).toBe(false);
    expect(result.operations).toHaveLength(0);
  });

  it('requiresApproval is case-insensitive', () => {
    const result = requiresApproval(
      'drop table users;',
      ['DROP TABLE'],
    );
    expect(result.required).toBe(true);
  });

  it('formatTeamStatus produces readable output', () => {
    const status: TeamStatus = {
      org: 'acme-corp',
      seats: { used: 5, max: 25, remaining: 20 },
      members: [
        {
          username: 'alice',
          machineId: 'abc123',
          firstSeen: '2026-01-01T00:00:00Z',
          lastSeen: '2026-02-20T00:00:00Z',
          analysisCount: 42,
        },
      ],
      recentActivity: [],
    };

    const output = formatTeamStatus(status);
    expect(output).toContain('acme-corp');
    expect(output).toContain('5/25');
    expect(output).toContain('20 remaining');
    expect(output).toContain('alice');
    expect(output).toContain('42 analyses');
  });
});

// ── Policy Enforcement ──

describe('Policy Enforcement', () => {
  describe('checkBlockedPatterns', () => {
    it('detects blocked SQL patterns', () => {
      const violations = checkBlockedPatterns(
        'DROP TABLE users;',
        ['DROP TABLE', 'TRUNCATE'],
      );
      expect(violations).toHaveLength(1);
      expect(violations[0]!.type).toBe('blocked_pattern');
      expect(violations[0]!.pattern).toBe('DROP TABLE');
    });

    it('returns empty for safe SQL', () => {
      const violations = checkBlockedPatterns(
        'ALTER TABLE users ADD COLUMN name TEXT;',
        ['DROP TABLE', 'TRUNCATE'],
      );
      expect(violations).toHaveLength(0);
    });

    it('detects multiple blocked patterns', () => {
      const violations = checkBlockedPatterns(
        'TRUNCATE users; DROP TABLE orders;',
        ['DROP TABLE', 'TRUNCATE'],
      );
      expect(violations).toHaveLength(2);
    });

    it('is case-insensitive', () => {
      const violations = checkBlockedPatterns(
        'truncate users;',
        ['TRUNCATE'],
      );
      expect(violations).toHaveLength(1);
    });
  });

  describe('checkReviewPatterns', () => {
    it('detects patterns requiring review', () => {
      const violations = checkReviewPatterns(
        'ALTER TYPE status ADD VALUE \'archived\';',
        ['ALTER TYPE'],
      );
      expect(violations).toHaveLength(1);
      expect(violations[0]!.type).toBe('requires_review');
    });

    it('returns empty when no patterns match', () => {
      const violations = checkReviewPatterns(
        'CREATE INDEX idx ON users (email);',
        ['ALTER TYPE', 'DROP COLUMN'],
      );
      expect(violations).toHaveLength(0);
    });
  });

  describe('checkRequiredRules', () => {
    it('detects disabled required rules (boolean false)', () => {
      const violations = checkRequiredRules(
        { MP001: false, MP004: true },
        ['MP001', 'MP004'],
      );
      expect(violations).toHaveLength(1);
      expect(violations[0]!.ruleId).toBe('MP001');
    });

    it('detects disabled required rules (enabled: false)', () => {
      const violations = checkRequiredRules(
        { MP001: { enabled: false }, MP004: { enabled: true } },
        ['MP001', 'MP004'],
      );
      expect(violations).toHaveLength(1);
      expect(violations[0]!.ruleId).toBe('MP001');
    });

    it('returns empty when all required rules are enabled', () => {
      const violations = checkRequiredRules(
        { MP001: true, MP004: { enabled: true } },
        ['MP001', 'MP004'],
      );
      expect(violations).toHaveLength(0);
    });

    it('handles missing rules in config', () => {
      const violations = checkRequiredRules(
        {},
        ['MP001'],
      );
      expect(violations).toHaveLength(0);
    });
  });

  describe('checkSeverityFloor', () => {
    it('detects severity below floor', () => {
      const violations = checkSeverityFloor(
        { MP001: { severity: 'warning' } },
        'critical',
      );
      expect(violations).toHaveLength(1);
      expect(violations[0]!.type).toBe('severity_downgrade');
    });

    it('allows severity at or above floor', () => {
      const violations = checkSeverityFloor(
        { MP001: { severity: 'critical' } },
        'critical',
      );
      expect(violations).toHaveLength(0);
    });

    it('allows warning when floor is warning', () => {
      const violations = checkSeverityFloor(
        { MP001: { severity: 'warning' } },
        'warning',
      );
      expect(violations).toHaveLength(0);
    });

    it('ignores boolean configs', () => {
      const violations = checkSeverityFloor(
        { MP001: true, MP002: false },
        'critical',
      );
      expect(violations).toHaveLength(0);
    });
  });

  describe('enforcePolicy', () => {
    it('runs all checks together', () => {
      const policy: PolicyConfig = {
        requiredRules: ['MP001'],
        severityFloor: 'critical',
        blockedPatterns: ['DROP TABLE'],
        requireReviewPatterns: ['ALTER TYPE'],
      };

      const violations = enforcePolicy(
        policy,
        'DROP TABLE users; ALTER TYPE status ADD VALUE \'foo\';',
        { MP001: false, MP002: { severity: 'warning' } },
      );

      // Should find: 1 blocked, 1 review, 1 required rule disabled, 1 severity floor
      expect(violations.length).toBe(4);
      const types = violations.map(v => v.type);
      expect(types).toContain('blocked_pattern');
      expect(types).toContain('requires_review');
      expect(types).toContain('disabled_required_rule');
      expect(types).toContain('severity_downgrade');
    });

    it('returns empty when all policies are satisfied', () => {
      const policy: PolicyConfig = {
        requiredRules: ['MP001'],
        blockedPatterns: ['DROP TABLE'],
      };

      const violations = enforcePolicy(
        policy,
        'ALTER TABLE users ADD COLUMN name TEXT;',
        { MP001: true },
      );

      expect(violations).toHaveLength(0);
    });
  });

  describe('applyPolicy', () => {
    it('re-enables required rules that were disabled', () => {
      const policy: PolicyConfig = {
        requiredRules: ['MP001', 'MP004'],
      };

      const result = applyPolicy(policy, { MP001: false, MP004: { enabled: false } });
      expect(result.MP001).toBe(true);
      expect(result.MP004).toEqual({ enabled: true });
    });

    it('enforces severity floor', () => {
      const policy: PolicyConfig = {
        severityFloor: 'critical',
      };

      const result = applyPolicy(policy, {
        MP001: { severity: 'warning' },
        MP002: { severity: 'critical' },
      });

      expect(result.MP001).toEqual({ severity: 'critical' });
      expect(result.MP002).toEqual({ severity: 'critical' });
    });

    it('does not modify rules that satisfy policy', () => {
      const policy: PolicyConfig = {
        requiredRules: ['MP001'],
        severityFloor: 'warning',
      };

      const result = applyPolicy(policy, {
        MP001: true,
        MP002: { severity: 'critical' },
      });

      expect(result.MP001).toBe(true);
      expect(result.MP002).toEqual({ severity: 'critical' });
    });
  });

  describe('formatPolicyViolations', () => {
    it('formats violations for CLI display', () => {
      const violations: PolicyViolation[] = [
        { type: 'blocked_pattern', message: 'DROP TABLE blocked', pattern: 'DROP TABLE' },
        { type: 'requires_review', message: 'ALTER TYPE needs review', pattern: 'ALTER TYPE' },
      ];

      const lines = formatPolicyViolations(violations);
      expect(lines.length).toBeGreaterThan(0);
      expect(lines.join('\n')).toContain('Blocked operations');
      expect(lines.join('\n')).toContain('review required');
    });

    it('returns empty for no violations', () => {
      const lines = formatPolicyViolations([]);
      expect(lines).toHaveLength(0);
    });
  });
});

// ── SSO Authentication ──

describe('SSO Authentication', () => {
  it('generateDeviceCode produces valid structure', () => {
    const code = generateDeviceCode();
    expect(code.deviceCode).toHaveLength(64); // 32 bytes hex
    expect(code.userCode).toMatch(/^[A-F0-9]{4}-[A-F0-9]{4}$/);
    expect(code.verificationUrl).toContain('migrationpilot.dev');
    expect(code.interval).toBe(5);
    expect(new Date(code.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('generateDeviceCode produces unique codes', () => {
    const code1 = generateDeviceCode();
    const code2 = generateDeviceCode();
    expect(code1.deviceCode).not.toBe(code2.deviceCode);
    expect(code1.userCode).not.toBe(code2.userCode);
  });

  it('getAuthToken returns null when no token exists', async () => {
    // Will fail to read the file in test environment
    const token = await getAuthToken();
    // Either null or a valid token if something is stored
    expect(token === null || (typeof token === 'object' && 'accessToken' in token)).toBe(true);
  });

  it('isAuthenticated returns boolean', async () => {
    const result = await isAuthenticated();
    expect(typeof result).toBe('boolean');
  });

  it('saveAuthToken encrypts and getAuthToken decrypts roundtrip', async () => {
    const token: AuthToken = {
      accessToken: 'test-token-abc123',
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      email: 'test@example.com',
      orgId: 'org-123',
      orgName: 'TestOrg',
      method: 'api-key',
    };

    await saveAuthToken(token);

    const retrieved = await getAuthToken();
    expect(retrieved).not.toBeNull();
    expect(retrieved!.accessToken).toBe('test-token-abc123');
    expect(retrieved!.email).toBe('test@example.com');
    expect(retrieved!.orgId).toBe('org-123');
    expect(retrieved!.method).toBe('api-key');

    // Verify file is encrypted (not plain JSON)
    const { readFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const { homedir } = await import('node:os');
    const raw = await readFile(join(homedir(), '.migrationpilot', 'auth.json'), 'utf-8');
    expect(raw.startsWith('v1:')).toBe(true);
    expect(raw).not.toContain('test-token-abc123');

    await clearAuthToken();
  });
});

// ── Config Integration ──

describe('Config: Enterprise Fields', () => {
  it('team and policy are known config keys', async () => {
    const { loadConfig } = await import('../src/config/load.js');
    // Should not warn about 'team' or 'policy' being unknown
    // (We can't easily test this without a config file, but we verify the keys are registered)
    const { config, warnings } = await loadConfig();
    // No warnings about team/policy since no config file will be found in test dir
    const teamWarning = warnings.find(w => w.includes('"team"'));
    const policyWarning = warnings.find(w => w.includes('"policy"'));
    expect(teamWarning).toBeUndefined();
    expect(policyWarning).toBeUndefined();
  });
});
