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
 * - MP021: REINDEX → REINDEX CONCURRENTLY
 * - MP023: CREATE TABLE/INDEX → CREATE TABLE/INDEX IF NOT EXISTS
 * - MP030: ADD CONSTRAINT CHECK → ADD CONSTRAINT CHECK NOT VALID
 * - MP033: REFRESH MATERIALIZED VIEW → REFRESH MATERIALIZED VIEW CONCURRENTLY
 * - MP037: VARCHAR(n) → TEXT
 * - MP040: TIMESTAMP → TIMESTAMPTZ
 * - MP041: CHAR(n) → TEXT
 * - MP046: DETACH PARTITION → DETACH PARTITION CONCURRENTLY
 *
 * Non-fixable (too complex / requires human judgment):
 * - MP002, MP003, MP005-MP008, MP010-MP019, MP022, MP024-MP029, MP031-MP032, MP034-MP036, MP038-MP039, MP042-MP045, MP047-MP051
 */

import type { RuleViolation } from '../rules/engine.js';

/** Which rules can be auto-fixed */
const FIXABLE_RULES = new Set(['MP001', 'MP004', 'MP009', 'MP020', 'MP021', 'MP023', 'MP030', 'MP033', 'MP037', 'MP040', 'MP041', 'MP046']);

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
    const currentLineStr = lines[i];
    if (currentLineStr === undefined) continue;
    const lineViolations = violationsByLine.get(lineNum);

    if (!lineViolations || lineViolations.length === 0) {
      // Check if this line sets timeouts (for tracking)
      const lower = currentLineStr.toLowerCase();
      if (lower.includes('lock_timeout')) hasLockTimeout = true;
      if (lower.includes('statement_timeout')) hasStatementTimeout = true;
      outputLines.push(currentLineStr);
      continue;
    }

    let currentLine = currentLineStr;
    const prependLines: string[] = [];

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
        case 'MP030':
          currentLine = fixMP030(currentLine);
          break;
        case 'MP021':
          currentLine = fixMP021(currentLine);
          break;
        case 'MP023':
          currentLine = fixMP023(currentLine);
          break;
        case 'MP033':
          currentLine = fixMP033(currentLine);
          break;
        case 'MP037':
          currentLine = fixMP037(currentLine);
          break;
        case 'MP040':
          currentLine = fixMP040(currentLine);
          break;
        case 'MP041':
          currentLine = fixMP041(currentLine);
          break;
        case 'MP046':
          currentLine = fixMP046(currentLine);
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

/**
 * MP030: ADD CONSTRAINT CHECK → ADD CONSTRAINT CHECK ... NOT VALID
 * Appends NOT VALID before the trailing semicolon.
 */
function fixMP030(line: string): string {
  if (/not\s+valid/i.test(line)) return line;

  // Insert NOT VALID before the closing semicolon
  return line.replace(/\)\s*;?\s*$/, ') NOT VALID;');
}

/**
 * MP021: REINDEX → REINDEX CONCURRENTLY
 * Handles REINDEX TABLE, REINDEX INDEX, REINDEX SCHEMA, REINDEX DATABASE.
 */
function fixMP021(line: string): string {
  if (/concurrently/i.test(line)) return line;

  return line.replace(
    /REINDEX\s+(TABLE|INDEX|SCHEMA|DATABASE)\s+/i,
    'REINDEX $1 CONCURRENTLY '
  );
}

/**
 * MP023: CREATE TABLE/INDEX → CREATE TABLE/INDEX IF NOT EXISTS
 * Handles CREATE TABLE, CREATE INDEX, CREATE UNIQUE INDEX, and CONCURRENTLY variants.
 */
function fixMP023(line: string): string {
  if (/if\s+not\s+exists/i.test(line)) return line;

  // CREATE UNIQUE INDEX CONCURRENTLY
  if (/CREATE\s+UNIQUE\s+INDEX\s+CONCURRENTLY\s+/i.test(line)) {
    return line.replace(
      /CREATE\s+UNIQUE\s+INDEX\s+CONCURRENTLY\s+/i,
      'CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS '
    );
  }

  // CREATE INDEX CONCURRENTLY
  if (/CREATE\s+INDEX\s+CONCURRENTLY\s+/i.test(line)) {
    return line.replace(
      /CREATE\s+INDEX\s+CONCURRENTLY\s+/i,
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS '
    );
  }

  // CREATE UNIQUE INDEX
  if (/CREATE\s+UNIQUE\s+INDEX\s+/i.test(line)) {
    return line.replace(
      /CREATE\s+UNIQUE\s+INDEX\s+/i,
      'CREATE UNIQUE INDEX IF NOT EXISTS '
    );
  }

  // CREATE INDEX
  if (/CREATE\s+INDEX\s+/i.test(line)) {
    return line.replace(
      /CREATE\s+INDEX\s+/i,
      'CREATE INDEX IF NOT EXISTS '
    );
  }

  // CREATE TABLE
  return line.replace(
    /CREATE\s+TABLE\s+/i,
    'CREATE TABLE IF NOT EXISTS '
  );
}

/**
 * MP033: REFRESH MATERIALIZED VIEW → REFRESH MATERIALIZED VIEW CONCURRENTLY
 */
function fixMP033(line: string): string {
  if (/concurrently/i.test(line)) return line;

  return line.replace(
    /REFRESH\s+MATERIALIZED\s+VIEW\s+/i,
    'REFRESH MATERIALIZED VIEW CONCURRENTLY '
  );
}

/**
 * MP037: VARCHAR(n) → TEXT
 * Replaces VARCHAR(n) and CHARACTER VARYING(n) with TEXT.
 */
function fixMP037(line: string): string {
  return line
    .replace(/CHARACTER\s+VARYING\s*\(\s*\d+\s*\)/gi, 'TEXT')
    .replace(/VARCHAR\s*\(\s*\d+\s*\)/gi, 'TEXT');
}

/**
 * MP040: TIMESTAMP → TIMESTAMPTZ
 * Replaces TIMESTAMP WITHOUT TIME ZONE and bare TIMESTAMP with TIMESTAMPTZ.
 * Does not touch TIMESTAMPTZ which is already correct.
 */
function fixMP040(line: string): string {
  return line
    .replace(/TIMESTAMP\s+WITHOUT\s+TIME\s+ZONE/gi, 'TIMESTAMPTZ')
    .replace(/\bTIMESTAMP\b(?!\s*TZ|\s*WITH|\s*WITHOUT)/gi, 'TIMESTAMPTZ');
}

/**
 * MP041: CHAR(n) → TEXT
 * Replaces CHAR(n) and CHARACTER(n) with TEXT. Does not touch VARCHAR.
 */
function fixMP041(line: string): string {
  // Replace CHARACTER(n) but not CHARACTER VARYING
  return line
    .replace(/CHARACTER\s*\(\s*\d+\s*\)(?!\s+VARYING)/gi, 'TEXT')
    .replace(/\bCHAR\s*\(\s*\d+\s*\)/gi, 'TEXT');
}

/**
 * MP046: DETACH PARTITION → DETACH PARTITION CONCURRENTLY
 */
function fixMP046(line: string): string {
  if (/concurrently/i.test(line)) return line;

  return line.replace(
    /DETACH\s+PARTITION\s+/i,
    'DETACH PARTITION CONCURRENTLY '
  );
}
