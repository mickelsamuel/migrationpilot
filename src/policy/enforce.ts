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

import { parseDisableDirectives } from '../rules/disable.js';
import type { Severity } from '../rules/engine.js';

/**
 * A rule's own severity, when known. Given one, the severity floor only stops a
 * downgrade: a rule that ships as a warning stays a warning under a critical floor.
 */
export type DefaultSeverityLookup = (ruleId: string) => Severity | undefined;

const SEVERITY_RANK: Record<string, number> = {
  'critical': 2,
  'warning': 1,
};

/** The lowest severity a rule may be set to under this floor. */
function floorFor(ruleId: string, severityFloor: Severity, defaultSeverity?: DefaultSeverityLookup): Severity {
  const own = defaultSeverity?.(ruleId);
  if (own && (SEVERITY_RANK[own] ?? 0) < (SEVERITY_RANK[severityFloor] ?? 0)) return own;
  return severityFloor;
}

/**
 * The SQL as a pattern sees it: comments removed, every run of whitespace one
 * space, upper case. String and dollar-quoted bodies stay, since they run too.
 */
export function normalizeForPatternMatch(sql: string): string {
  let out = '';
  let i = 0;
  const n = sql.length;
  const dollarTag = /\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/y;

  while (i < n) {
    const c = sql[i];
    const next = sql[i + 1];

    if (c === '-' && next === '-') {
      while (i < n && sql[i] !== '\n') i++;
      out += ' ';
      continue;
    }

    if (c === '/' && next === '*') {
      // PostgreSQL block comments nest.
      let depth = 1;
      i += 2;
      while (i < n && depth > 0) {
        if (sql[i] === '/' && sql[i + 1] === '*') { depth++; i += 2; }
        else if (sql[i] === '*' && sql[i + 1] === '/') { depth--; i += 2; }
        else i++;
      }
      out += ' ';
      continue;
    }

    if (c === '\'' || c === '"') {
      let j = i + 1;
      while (j < n) {
        if (sql[j] === c) {
          if (sql[j + 1] === c) { j += 2; continue; }
          j++;
          break;
        }
        j++;
      }
      out += sql.slice(i, j);
      i = j;
      continue;
    }

    if (c === '$') {
      dollarTag.lastIndex = i;
      const tag = dollarTag.exec(sql)?.[0];
      if (tag) {
        const close = sql.indexOf(tag, i + tag.length);
        const end = close === -1 ? n : close + tag.length;
        out += sql.slice(i, end);
        i = end;
        continue;
      }
    }

    out += c;
    i++;
  }

  return out.replace(/\s+/g, ' ').trim().toUpperCase();
}

/**
 * Does normalized SQL contain this pattern? Whitespace in the pattern matches any
 * whitespace, case doesn't matter, and a pattern that starts or ends with a word
 * character only matches whole words: "DROP TABLE" doesn't match DROP TABLESPACE.
 */
export function matchesPattern(normalizedSql: string, pattern: string): boolean {
  const p = pattern.replace(/\s+/g, ' ').trim().toUpperCase();
  if (!p) return false;
  const body = p.split(' ').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join(' ');
  const start = /^[A-Z0-9_]/.test(p) ? '(?<![A-Z0-9_])' : '';
  const end = /[A-Z0-9_]$/.test(p) ? '(?![A-Z0-9_])' : '';
  return new RegExp(start + body + end).test(normalizedSql);
}

/** A statement a pattern matched, and the pattern. */
export interface PatternMatch {
  line: number;
  pattern: string;
}

/**
 * The statements each pattern matches, one entry per statement and pattern, in
 * statement order.
 */
export function findPatternStatements(
  statements: ReadonlyArray<{ sql: string; line: number }>,
  patterns: readonly string[],
): PatternMatch[] {
  const matches: PatternMatch[] = [];
  if (patterns.length === 0) return matches;
  for (const s of statements) {
    const normalized = normalizeForPatternMatch(s.sql);
    for (const pattern of patterns) {
      if (matchesPattern(normalized, pattern)) matches.push({ line: s.line, pattern });
    }
  }
  return matches;
}

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

/** Per-rule config, as the config file's `rules` block holds it. */
export type PolicyRuleConfig = Record<string, boolean | { enabled?: boolean; severity?: Severity; threshold?: number }>;

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
  const normalized = normalizeForPatternMatch(sql);

  for (const pattern of blockedPatterns) {
    if (matchesPattern(normalized, pattern)) {
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
  const normalized = normalizeForPatternMatch(sql);

  for (const pattern of reviewPatterns) {
    if (matchesPattern(normalized, pattern)) {
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
 * Find disable comments that name a required rule, or disable every rule.
 * Policy holds required rules on whatever a comment says.
 */
export function checkInlineDisables(
  sql: string,
  requiredRules: string[],
): PolicyViolation[] {
  const violations: PolicyViolation[] = [];
  const required = requiredRules.map(r => r.toUpperCase());

  for (const d of parseDisableDirectives(sql)) {
    const hit = d.ruleIds === 'all' ? required : required.filter(id => (d.ruleIds as string[]).includes(id));
    for (const ruleId of hit) {
      violations.push({
        type: 'disabled_required_rule',
        message: `Rule ${ruleId} is required by organization policy; the disable comment on line ${d.line} does not apply to it.`,
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
  defaultSeverity?: DefaultSeverityLookup,
): PolicyViolation[] {
  const violations: PolicyViolation[] = [];

  for (const [ruleId, config] of Object.entries(ruleConfig)) {
    if (typeof config === 'object' && config.severity) {
      const floor = floorFor(ruleId, severityFloor, defaultSeverity);
      if ((SEVERITY_RANK[config.severity] ?? 0) < (SEVERITY_RANK[floor] ?? 0)) {
        violations.push({
          type: 'severity_downgrade',
          message: `Rule ${ruleId} severity "${config.severity}" is below the organization minimum "${floor}".`,
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
  defaultSeverity?: DefaultSeverityLookup,
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
    violations.push(...checkInlineDisables(sql, policy.requiredRules));
  }

  if (policy.severityFloor) {
    violations.push(...checkSeverityFloor(ruleConfig, policy.severityFloor, defaultSeverity));
  }

  return violations;
}

/**
 * Apply policy enforcement to a rule config — re-enable required rules
 * and enforce severity floor. Returns the corrected config.
 */
export function applyPolicy(
  policy: PolicyConfig,
  ruleConfig: PolicyRuleConfig,
  defaultSeverity?: DefaultSeverityLookup,
): PolicyRuleConfig {
  const result: PolicyRuleConfig = { ...ruleConfig };

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
    for (const [ruleId, config] of Object.entries(result)) {
      if (typeof config === 'object' && config.severity) {
        const floor = floorFor(ruleId, policy.severityFloor, defaultSeverity);
        if ((SEVERITY_RANK[config.severity] ?? 0) < (SEVERITY_RANK[floor] ?? 0)) {
          result[ruleId] = { ...config, severity: floor };
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
