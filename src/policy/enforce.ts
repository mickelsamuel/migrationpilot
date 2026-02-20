/**
 * Policy enforcement for MigrationPilot Enterprise.
 *
 * Allows organizations to enforce:
 * - Required rules that cannot be disabled by individual devs
 * - Minimum severity floors (rules can't be downgraded below org minimum)
 * - Blocked operations (DDL patterns that are never allowed)
 * - Required review for certain migration patterns
 *
 * Config in .migrationpilotrc.yml:
 *
 * policy:
 *   requiredRules:
 *     - MP001
 *     - MP004
 *     - MP008
 *   severityFloor: warning
 *   blockedPatterns:
 *     - "DROP TABLE"
 *     - "TRUNCATE"
 *   requireReviewPatterns:
 *     - "ALTER TYPE"
 *     - "DROP COLUMN"
 */

import type { Severity } from '../rules/engine.js';

export interface PolicyConfig {
  /** Rules that must always be enabled — cannot be disabled via config or inline comments */
  requiredRules?: string[];
  /** Minimum severity — rules cannot be downgraded below this level */
  severityFloor?: Severity;
  /** SQL patterns that are completely blocked (analysis fails immediately) */
  blockedPatterns?: string[];
  /** SQL patterns that require explicit team review before proceeding */
  requireReviewPatterns?: string[];
}

export interface PolicyViolation {
  type: 'blocked_pattern' | 'disabled_required_rule' | 'severity_downgrade' | 'requires_review';
  message: string;
  pattern?: string;
  ruleId?: string;
}

/**
 * Validate SQL against organization policy blocked patterns.
 * Returns violations for any matched blocked patterns.
 */
export function checkBlockedPatterns(
  sql: string,
  blockedPatterns: string[],
): PolicyViolation[] {
  const violations: PolicyViolation[] = [];
  const upperSql = sql.toUpperCase();

  for (const pattern of blockedPatterns) {
    if (upperSql.includes(pattern.toUpperCase())) {
      violations.push({
        type: 'blocked_pattern',
        message: `Organization policy blocks "${pattern}" operations. Contact your team admin for an exception.`,
        pattern,
      });
    }
  }

  return violations;
}

/**
 * Validate SQL against patterns that require review.
 * Returns violations (as warnings) for matched patterns.
 */
export function checkReviewPatterns(
  sql: string,
  reviewPatterns: string[],
): PolicyViolation[] {
  const violations: PolicyViolation[] = [];
  const upperSql = sql.toUpperCase();

  for (const pattern of reviewPatterns) {
    if (upperSql.includes(pattern.toUpperCase())) {
      violations.push({
        type: 'requires_review',
        message: `Organization policy requires team review for "${pattern}" operations.`,
        pattern,
      });
    }
  }

  return violations;
}

/**
 * Validate that a rule configuration doesn't disable required rules.
 * Returns violations for any required rules that were disabled.
 */
export function checkRequiredRules(
  ruleConfig: Record<string, boolean | { enabled?: boolean }>,
  requiredRules: string[],
): PolicyViolation[] {
  const violations: PolicyViolation[] = [];

  for (const ruleId of requiredRules) {
    const config = ruleConfig[ruleId];
    if (config === false) {
      violations.push({
        type: 'disabled_required_rule',
        message: `Rule ${ruleId} is required by organization policy and cannot be disabled.`,
        ruleId,
      });
    } else if (typeof config === 'object' && config.enabled === false) {
      violations.push({
        type: 'disabled_required_rule',
        message: `Rule ${ruleId} is required by organization policy and cannot be disabled.`,
        ruleId,
      });
    }
  }

  return violations;
}

/**
 * Validate that severity overrides don't go below the organization floor.
 * Returns violations for any rules with severity below the floor.
 */
export function checkSeverityFloor(
  ruleConfig: Record<string, boolean | { severity?: Severity }>,
  severityFloor: Severity,
): PolicyViolation[] {
  const violations: PolicyViolation[] = [];
  const severityRank: Record<string, number> = {
    'critical': 2,
    'warning': 1,
  };

  const floorRank = severityRank[severityFloor] ?? 0;

  for (const [ruleId, config] of Object.entries(ruleConfig)) {
    if (typeof config === 'object' && config.severity) {
      const configRank = severityRank[config.severity] ?? 0;
      if (configRank < floorRank) {
        violations.push({
          type: 'severity_downgrade',
          message: `Rule ${ruleId} severity "${config.severity}" is below the organization minimum "${severityFloor}".`,
          ruleId,
        });
      }
    }
  }

  return violations;
}

/**
 * Enforce all organization policies against SQL and config.
 * Returns all policy violations found.
 */
export function enforcePolicy(
  policy: PolicyConfig,
  sql: string,
  ruleConfig: Record<string, boolean | { enabled?: boolean; severity?: Severity }>,
): PolicyViolation[] {
  const violations: PolicyViolation[] = [];

  if (policy.blockedPatterns?.length) {
    violations.push(...checkBlockedPatterns(sql, policy.blockedPatterns));
  }

  if (policy.requireReviewPatterns?.length) {
    violations.push(...checkReviewPatterns(sql, policy.requireReviewPatterns));
  }

  if (policy.requiredRules?.length) {
    violations.push(...checkRequiredRules(ruleConfig, policy.requiredRules));
  }

  if (policy.severityFloor) {
    violations.push(...checkSeverityFloor(ruleConfig, policy.severityFloor));
  }

  return violations;
}

/**
 * Apply policy enforcement to a rule config — re-enable required rules
 * and enforce severity floor. Returns the corrected config.
 */
export function applyPolicy(
  policy: PolicyConfig,
  ruleConfig: Record<string, boolean | { enabled?: boolean; severity?: Severity }>,
): Record<string, boolean | { enabled?: boolean; severity?: Severity }> {
  const result = { ...ruleConfig };

  // Re-enable required rules
  if (policy.requiredRules) {
    for (const ruleId of policy.requiredRules) {
      const config = result[ruleId];
      if (config === false) {
        result[ruleId] = true;
      } else if (typeof config === 'object' && config.enabled === false) {
        result[ruleId] = { ...config, enabled: true };
      }
    }
  }

  // Enforce severity floor
  if (policy.severityFloor) {
    const severityRank: Record<string, number> = {
      'critical': 2,
      'warning': 1,
    };
    const floorRank = severityRank[policy.severityFloor] ?? 0;

    for (const [ruleId, config] of Object.entries(result)) {
      if (typeof config === 'object' && config.severity) {
        const configRank = severityRank[config.severity] ?? 0;
        if (configRank < floorRank) {
          result[ruleId] = { ...config, severity: policy.severityFloor };
        }
      }
    }
  }

  return result;
}

/**
 * Format policy violations for CLI display.
 */
export function formatPolicyViolations(violations: PolicyViolation[]): string[] {
  const lines: string[] = [];

  const blocked = violations.filter(v => v.type === 'blocked_pattern');
  const required = violations.filter(v => v.type === 'disabled_required_rule');
  const severity = violations.filter(v => v.type === 'severity_downgrade');
  const review = violations.filter(v => v.type === 'requires_review');

  if (blocked.length > 0) {
    lines.push('Policy: Blocked operations detected');
    for (const v of blocked) {
      lines.push(`  ${v.message}`);
    }
  }

  if (required.length > 0) {
    lines.push('Policy: Required rules were disabled');
    for (const v of required) {
      lines.push(`  ${v.message}`);
    }
  }

  if (severity.length > 0) {
    lines.push('Policy: Severity floor violations');
    for (const v of severity) {
      lines.push(`  ${v.message}`);
    }
  }

  if (review.length > 0) {
    lines.push('Policy: Team review required');
    for (const v of review) {
      lines.push(`  ${v.message}`);
    }
  }

  return lines;
}
