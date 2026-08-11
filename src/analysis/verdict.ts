/**
 * Shared fail-threshold gate for MigrationPilot.
 *
 * One source of truth for "does this set of violations fail the build?".
 * The CLI turns it into an exit code; the MCP `check_before_apply` tool turns
 * it into a pass/fail verdict an agent can act on. Both must agree — a
 * guardrail that blocks in CI but waves the same migration through in an
 * editor is worse than no guardrail at all.
 */

import type { RuleViolation, Severity } from '../rules/engine.js';

export type FailOnThreshold = 'critical' | 'warning' | 'never';

export type Verdict = 'pass' | 'fail';

const THRESHOLDS: readonly string[] = ['critical', 'warning', 'never'];

/**
 * Coerce an arbitrary string to a valid threshold, falling back to `critical`.
 */
export function normalizeFailOn(value: string | undefined | null): FailOnThreshold {
  return value && THRESHOLDS.includes(value) ? value as FailOnThreshold : 'critical';
}

/**
 * Compute the process exit code for a set of violations.
 * 0 = clean, 1 = warnings (when failOn is `warning`), 2 = critical violations.
 */
export function computeExitCode(failOn: string, violations: RuleViolation[]): number {
  if (failOn === 'never') return 0;
  const hasCritical = violations.some(v => v.severity === 'critical');
  if (hasCritical) return 2;
  const hasWarning = violations.some(v => v.severity === 'warning');
  if (failOn === 'warning' && hasWarning) return 1;
  return 0;
}

/**
 * Whether a single violation's severity is blocking at the given threshold.
 */
export function isBlocking(severity: Severity, failOn: string): boolean {
  if (failOn === 'never') return false;
  if (severity === 'critical') return true;
  return failOn === 'warning';
}

/**
 * Pass/fail verdict for a set of violations at the given threshold.
 */
export function computeVerdict(failOn: string, violations: RuleViolation[]): Verdict {
  return computeExitCode(failOn, violations) > 0 ? 'fail' : 'pass';
}
