/**
 * The Org plan's policy, applied to one run.
 *
 * A valid paid license key turns on two parts of the config: the `policy` block
 * and the audit log. With it, the policy holds on every path a gate takes:
 * required rules run whatever the config, a preset, --exclude or a disable
 * comment says, the severity floor stops a downgrade, and a blocked pattern
 * fails the run. Without it, neither part applies and the run says so once,
 * rather than quietly doing less than the config asks.
 */

import { allRules } from '../rules/index.js';
import { hasOrgFeatures, validateLicense } from '../license/validate.js';
import { disabledViolationMatcher, parseDisableDirectives } from '../rules/disable.js';
import { applyPolicy, findPatternStatements } from './enforce.js';
import type { MigrationPilotConfig } from '../config/load.js';
import type { Rule, RuleViolation, Severity } from '../rules/engine.js';
import type { PatternMatch } from './enforce.js';

export interface OrgPolicy {
  /** The config the run uses: the policy applied to its rules when the policy is on. */
  config: MigrationPilotConfig;
  /** True when a valid key turned the policy block and the audit log on. */
  entitled: boolean;
  /** Rules the policy holds on. Empty when the policy is off. */
  requiredRules: ReadonlySet<string>;
  /** Patterns that fail the run. Empty when the policy is off. */
  blockedPatterns: readonly string[];
  /** Patterns the run flags for team review. Empty when the policy is off. */
  reviewPatterns: readonly string[];
  /** The audit log settings to configure: undefined when the log is off. */
  auditLog: MigrationPilotConfig['auditLog'];
  /** Something in the config isn't being applied. Shown on every run, quiet or not. */
  warnings: string[];
  /** What the policy changed from what the config asked for. */
  notes: string[];
}

const DEFAULT_SEVERITY = new Map<string, Severity>(allRules.map(r => [r.id, r.severity]));
const defaultSeverity = (ruleId: string) => DEFAULT_SEVERITY.get(ruleId);

/**
 * Work out what the config's Org features do on this run.
 *
 * @param licenseKey - The key the run was given, if any; the
 *   MIGRATIONPILOT_LICENSE_KEY environment variable is read when it is empty.
 * @param keyHint - Where a key goes, for the message when one is missing.
 */
export function resolveOrgPolicy(
  config: MigrationPilotConfig,
  licenseKey: string | undefined,
  keyHint: string,
): OrgPolicy {
  const policy = config.policy;
  const wantsAudit = config.auditLog?.enabled === true;
  const off: OrgPolicy = {
    config,
    entitled: false,
    requiredRules: new Set(),
    blockedPatterns: [],
    reviewPatterns: [],
    auditLog: undefined,
    warnings: [],
    notes: [],
  };

  if (!policy && !wantsAudit) return off;

  const status = validateLicense(licenseKey);
  if (!hasOrgFeatures(status)) {
    const wanted = [policy && 'policy block', wantsAudit && 'audit log'].filter(Boolean).join(' and ');
    const both = !!policy && wantsAudit;
    const reason = status.error ? `the key was refused (${status.error})` : 'no key was given';
    off.warnings.push(
      `The config's ${wanted} ${both ? 'need' : 'needs'} an Org plan license key (${keyHint}), and ${reason}. `
      + `${both ? 'Neither is' : 'It is not'} applied on this run.`,
    );
    return off;
  }

  const notes: string[] = [];
  const rules = config.rules ?? {};
  const required = new Set((policy?.requiredRules ?? []).map(r => r.trim().toUpperCase()).filter(Boolean));

  for (const id of required) {
    if (/^MP\d{3}$/.test(id) && !DEFAULT_SEVERITY.has(id)) {
      notes.push(`Policy: requiredRules names ${id}, which is not a MigrationPilot rule.`);
    }
    const rc = rules[id];
    if (rc === false || (typeof rc === 'object' && rc.enabled === false)) {
      notes.push(`Policy: ${id} is required, so it runs although the config turns it off.`);
    }
  }

  const effectiveRules = policy
    ? applyPolicy({ ...policy, requiredRules: [...required] }, rules, defaultSeverity)
    : rules;

  for (const [id, rc] of Object.entries(effectiveRules)) {
    const before = rules[id];
    if (typeof rc === 'object' && typeof before === 'object' && rc.severity && before.severity && rc.severity !== before.severity) {
      notes.push(`Policy: ${id} stays ${rc.severity}; the config's severity: ${before.severity} is below the policy's floor.`);
    }
  }

  return {
    config: { ...config, rules: effectiveRules },
    entitled: true,
    requiredRules: required,
    blockedPatterns: policy?.blockedPatterns ?? [],
    reviewPatterns: policy?.requireReviewPatterns ?? [],
    auditLog: wantsAudit ? config.auditLog : undefined,
    warnings: [],
    notes,
  };
}

/**
 * Drop excluded rules, except the ones the policy holds on.
 *
 * @returns The rules to run, and the excluded ids the policy kept.
 */
export function excludeRules(
  rules: Rule[],
  exclude: Iterable<string>,
  org: OrgPolicy,
): { rules: Rule[]; kept: string[] } {
  const excluded = new Set([...exclude].map(s => s.trim()).filter(Boolean));
  const kept = [...excluded].filter(id => org.requiredRules.has(id.toUpperCase()));
  for (const id of kept) excluded.delete(id);
  return { rules: rules.filter(r => !excluded.has(r.id)), kept };
}

/** The note for excluded rules the policy kept, or undefined when it kept none. */
export function keptByPolicyNote(kept: string[], flag: string): string | undefined {
  if (kept.length === 0) return undefined;
  const many = kept.length > 1;
  return `Policy: ${kept.join(', ')} ${many ? 'are' : 'is'} required, so ${flag} does not drop ${many ? 'them' : 'it'}.`;
}

/**
 * Notes for the disable comments the policy overrode: a required rule's
 * violation that a comment would have switched off.
 */
export function overriddenDisableNotes(
  sql: string,
  violations: readonly RuleViolation[],
  statementLines: number[],
  org: OrgPolicy,
): string[] {
  if (org.requiredRules.size === 0) return [];
  const directives = parseDisableDirectives(sql);
  if (directives.length === 0) return [];
  const isDisabled = disabledViolationMatcher(directives, statementLines);
  return violations
    .filter(v => org.requiredRules.has(v.ruleId) && isDisabled(v))
    .map(v => `Policy: ${v.ruleId} on line ${v.line} is required; the disable comment for it does not apply.`);
}

/** Statements that match a blocked pattern. Empty when the policy is off. */
export function blockedStatements(
  statements: ReadonlyArray<{ sql: string; line: number }>,
  org: OrgPolicy,
): PatternMatch[] {
  return findPatternStatements(statements, org.blockedPatterns);
}

/** Statements that match a review pattern. Empty when the policy is off. */
export function reviewStatements(
  statements: ReadonlyArray<{ sql: string; line: number }>,
  org: OrgPolicy,
): PatternMatch[] {
  return findPatternStatements(statements, org.reviewPatterns);
}

/** What a blocked statement's report says, without the file and line. */
export function blockedMessage(m: PatternMatch): string {
  return `[policy] "${m.pattern}" is blocked by the organization policy.`;
}

/** What a review statement's report says, without the file and line. */
export function reviewMessage(m: PatternMatch): string {
  return `[policy] "${m.pattern}" needs team review under the organization policy.`;
}

/** One line for a blocked statement, in the file:line: form the CLI prints. */
export function formatBlocked(file: string, m: PatternMatch): string {
  return `${file}:${m.line}: ${blockedMessage(m)}`;
}

/** One line for a statement that needs team review. */
export function formatReview(file: string, m: PatternMatch): string {
  return `${file}:${m.line}: ${reviewMessage(m)}`;
}
