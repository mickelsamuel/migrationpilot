/**
 * Auto-fix engine for MigrationPilot.
 *
 * Automatically rewrites unsafe SQL statements into safe alternatives
 * for rules that have clean, automatable fixes. Complex multi-step fixes
 * (expand-contract, multi-deploy) are marked as manual-only.
 *
 * Fixable rules:
 * - MP001: CREATE INDEX → CREATE INDEX CONCURRENTLY
 * - MP004: Prepend SET lock_timeout before DDL
 * - MP009: DROP INDEX → DROP INDEX CONCURRENTLY
 * - MP020: Prepend SET statement_timeout before long-running DDL
 *
 * Non-fixable (too complex / requires human judgment):
 * - MP002, MP003, MP005-MP008, MP010-MP019
 */

import type { RuleViolation } from '../rules/engine.js';

/** Which rules can be auto-fixed */
const FIXABLE_RULES = new Set(['MP001', 'MP004', 'MP009', 'MP020']);

export interface FixResult {
  /** The fixed SQL output */
  fixedSql: string;
  /** Number of violations that were auto-fixed */
  fixedCount: number;
  /** Violations that could not be auto-fixed (require manual intervention) */
  unfixable: RuleViolation[];
}

/**
 * Auto-fix a SQL migration by replacing unsafe statements with safe alternatives.
 * Returns the fixed SQL and a list of unfixable violations.
 */
export function autoFix(
  sql: string,
  violations: RuleViolation[],
): FixResult {
  const fixable = violations.filter(v => FIXABLE_RULES.has(v.ruleId));
  const unfixable = violations.filter(v => !FIXABLE_RULES.has(v.ruleId));

  if (fixable.length === 0) {
    return { fixedSql: sql, fixedCount: 0, unfixable };
  }

  // Group violations by line
  const violationsByLine = new Map<number, RuleViolation[]>();
  for (const v of fixable) {
    const existing = violationsByLine.get(v.line) || [];
    existing.push(v);
    violationsByLine.set(v.line, existing);
  }

  const lines = sql.split('\n');
  const outputLines: string[] = [];
  // Track which lines already have lock_timeout / statement_timeout prepended
  let hasLockTimeout = false;
  let hasStatementTimeout = false;

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const lineViolations = violationsByLine.get(lineNum);

    if (!lineViolations || lineViolations.length === 0) {
      // Check if this line sets timeouts (for tracking)
      const lower = lines[i].toLowerCase();
      if (lower.includes('lock_timeout')) hasLockTimeout = true;
      if (lower.includes('statement_timeout')) hasStatementTimeout = true;
      outputLines.push(lines[i]);
      continue;
    }

    let currentLine = lines[i];
    let prependLines: string[] = [];

    for (const v of lineViolations) {
      switch (v.ruleId) {
        case 'MP001':
          currentLine = fixMP001(currentLine);
          break;
        case 'MP004':
          if (!hasLockTimeout) {
            prependLines.push("SET lock_timeout = '5s';");
            hasLockTimeout = true;
          }
          break;
        case 'MP009':
          currentLine = fixMP009(currentLine);
          break;
        case 'MP020':
          if (!hasStatementTimeout) {
            prependLines.push("SET statement_timeout = '30s';");
            hasStatementTimeout = true;
          }
          break;
      }
    }

    outputLines.push(...prependLines, currentLine);
  }

  return {
    fixedSql: outputLines.join('\n'),
    fixedCount: fixable.length,
    unfixable,
  };
}

/**
 * Check if a rule is auto-fixable.
 */
export function isFixable(ruleId: string): boolean {
  return FIXABLE_RULES.has(ruleId);
}

/**
 * MP001: CREATE INDEX → CREATE INDEX CONCURRENTLY
 * Handles both "CREATE INDEX" and "CREATE UNIQUE INDEX".
 */
function fixMP001(line: string): string {
  // Already concurrent
  if (/create\s+index\s+concurrently/i.test(line)) return line;

  // CREATE UNIQUE INDEX → CREATE UNIQUE INDEX CONCURRENTLY
  return line.replace(
    /CREATE\s+UNIQUE\s+INDEX\s+/i,
    'CREATE UNIQUE INDEX CONCURRENTLY '
  ).replace(
    /CREATE\s+INDEX\s+/i,
    'CREATE INDEX CONCURRENTLY '
  );
}

/**
 * MP009: DROP INDEX → DROP INDEX CONCURRENTLY
 */
function fixMP009(line: string): string {
  if (/drop\s+index\s+concurrently/i.test(line)) return line;

  // Handle IF EXISTS variant first
  if (/DROP\s+INDEX\s+IF\s+EXISTS\s+/i.test(line)) {
    return line.replace(
      /DROP\s+INDEX\s+IF\s+EXISTS\s+/i,
      'DROP INDEX CONCURRENTLY IF EXISTS '
    );
  }

  return line.replace(
    /DROP\s+INDEX\s+/i,
    'DROP INDEX CONCURRENTLY '
  );
}
