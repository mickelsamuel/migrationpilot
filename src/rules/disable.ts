/**
 * Inline disable comment parser for MigrationPilot.
 *
 * Supports these comment formats in SQL:
 *
 * -- migrationpilot-disable MP001
 *     Disables MP001 for the next SQL statement
 *
 * -- migrationpilot-disable MP001, MP002
 *     Disables multiple rules for the next statement
 *
 * -- migrationpilot-disable
 *     Disables ALL rules for the next statement
 *
 * -- migrationpilot-disable-file
 *     Disables ALL rules for the entire file
 *
 * -- migrationpilot-disable-file MP001
 *     Disables MP001 for the entire file
 *
 * Comment markers are case-insensitive and work with both -- and block comments.
 */

import type { RuleViolation } from './engine.js';

export interface DisableDirective {
  type: 'statement' | 'file';
  ruleIds: string[] | 'all';
  line: number;
}

/**
 * Parse all disable directives from the SQL source.
 */
export function parseDisableDirectives(sql: string): DisableDirective[] {
  const directives: DisableDirective[] = [];
  const lines = sql.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    const lineNum = i + 1;

    // Check single-line comments
    const inlineMatch = line.match(/--\s*migrationpilot-disable(-file)?\s*(.*?)$/i);
    if (inlineMatch) {
      const isFile = !!inlineMatch[1];
      const ruleStr = (inlineMatch[2] ?? '').trim();
      directives.push({
        type: isFile ? 'file' : 'statement',
        ruleIds: parseRuleIds(ruleStr),
        line: lineNum,
      });
    }

    // Check block comments on the same line
    const blockMatch = line.match(/\/\*\s*migrationpilot-disable(-file)?\s*(.*?)\*\//i);
    if (blockMatch) {
      const isFile = !!blockMatch[1];
      const ruleStr = (blockMatch[2] ?? '').trim();
      directives.push({
        type: isFile ? 'file' : 'statement',
        ruleIds: parseRuleIds(ruleStr),
        line: lineNum,
      });
    }
  }

  return directives;
}

/**
 * Parse rule IDs from a comma-separated string.
 * Returns 'all' if empty (disables everything).
 */
function parseRuleIds(str: string): string[] | 'all' {
  if (!str || str.trim() === '') return 'all';

  return str
    .split(/[,\s]+/)
    .map(s => s.trim().toUpperCase())
    .filter(s => /^MP\d{3}$/.test(s));
}

/**
 * Filter violations based on disable directives.
 *
 * A statement-level directive disables rules for the nearest following
 * SQL statement (by line number). A file-level directive applies to all.
 */
export function filterDisabledViolations(
  violations: RuleViolation[],
  directives: DisableDirective[],
  statementLines: number[],
): RuleViolation[] {
  if (directives.length === 0) return violations;

  // Build file-level disable set
  const fileDisabled = new Set<string>();
  let fileDisableAll = false;

  for (const d of directives) {
    if (d.type === 'file') {
      if (d.ruleIds === 'all') {
        fileDisableAll = true;
      } else {
        for (const id of d.ruleIds) fileDisabled.add(id);
      }
    }
  }

  if (fileDisableAll) return [];

  // Build statement-level disable map: statementLine → Set<ruleId> | 'all'
  const stmtDisableMap = new Map<number, Set<string> | 'all'>();

  for (const d of directives) {
    if (d.type !== 'statement') continue;

    // Find the next statement line after this directive
    const nextStmtLine = statementLines.find(l => l >= d.line);
    if (!nextStmtLine) continue;

    const existing = stmtDisableMap.get(nextStmtLine);
    if (existing === 'all' || d.ruleIds === 'all') {
      stmtDisableMap.set(nextStmtLine, 'all');
    } else {
      const set = existing ?? new Set<string>();
      for (const id of d.ruleIds) set.add(id);
      stmtDisableMap.set(nextStmtLine, set);
    }
  }

  return violations.filter(v => {
    // Check file-level disable
    if (fileDisabled.has(v.ruleId)) return false;

    // Check statement-level disable
    const stmtDisable = stmtDisableMap.get(v.line);
    if (!stmtDisable) return true;
    if (stmtDisable === 'all') return false;
    return !stmtDisable.has(v.ruleId);
  });
}

export interface StaleDirective {
  line: number;
  ruleIds: string[];
  reason: string;
}

/**
 * Find disable directives that don't suppress any violations.
 * These are stale and should be cleaned up.
 */
export function findStaleDirectives(
  directives: DisableDirective[],
  violations: RuleViolation[],
  statementLines: number[],
): StaleDirective[] {
  const stale: StaleDirective[] = [];

  for (const d of directives) {
    if (d.ruleIds === 'all') continue; // blanket disables are intentional

    if (d.type === 'file') {
      // Check if any violation matches any of the file-disabled rules
      const unusedIds = d.ruleIds.filter(id =>
        !violations.some(v => v.ruleId === id)
      );
      if (unusedIds.length > 0) {
        stale.push({
          line: d.line,
          ruleIds: unusedIds,
          reason: 'File-level disable does not suppress any violations',
        });
      }
    } else {
      // Statement-level: find the next statement line
      const nextStmtLine = statementLines.find(l => l >= d.line);
      if (!nextStmtLine) {
        stale.push({
          line: d.line,
          ruleIds: d.ruleIds,
          reason: 'Disable comment has no following SQL statement',
        });
        continue;
      }

      const unusedIds = d.ruleIds.filter(id =>
        !violations.some(v => v.ruleId === id && v.line === nextStmtLine)
      );
      if (unusedIds.length > 0) {
        stale.push({
          line: d.line,
          ruleIds: unusedIds,
          reason: 'Disable comment does not suppress any violations on the next statement',
        });
      }
    }
  }

  return stale;
}
