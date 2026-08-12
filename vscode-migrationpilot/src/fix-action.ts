/**
 * Quick-fix computation, with no dependency on the `vscode` API.
 *
 * Every fix the editor offers is produced by the engine's own fixer, so a
 * quick-fix writes exactly the bytes `migrationpilot --fix` would write. The
 * set of fixable rules and the label for each one are read from the fixer's
 * registry rather than listed again here, which is what keeps the extension
 * from drifting behind the CLI when a rule is added.
 *
 * Keeping this file free of `vscode` imports is what makes it testable from
 * the parent project's vitest suite; `quickfix.ts` is the thin adapter that
 * turns a `QuickFix` into a `vscode.WorkspaceEdit`.
 */

import { autoFix, isFixable, fixableRuleIds } from '../../src/fixer/fix';
import { FIX_CLASSIFICATION } from '../../src/fixer/classification';
import type { RuleViolation } from '../../src/rules/engine';

export { isFixable, fixableRuleIds };

/** A single edit that resolves one violation. Offsets index the original SQL. */
export interface QuickFix {
  /** Offset of the first character replaced */
  start: number;
  /** Offset one past the last character replaced */
  end: number;
  /** What goes in its place */
  newText: string;
  /** Menu label, e.g. "Add CONCURRENTLY to CREATE INDEX" */
  title: string;
}

/** Menu label for a rule's fix. */
export function fixTitle(ruleId: string): string {
  return FIX_CLASSIFICATION.get(ruleId)?.fixTitle ?? `Apply the ${ruleId} fix`;
}

/**
 * The edit that fixes one violation, or null when there is nothing to apply.
 *
 * Null covers three cases that all mean "do not offer a lightbulb here": the
 * rule is not mechanical, the statement on that line is not one this fix
 * applies to, and the file already satisfies the rule some other way (a
 * `SET lock_timeout` higher up already covers this statement, say).
 *
 * `line` is 1-based and should come from the diagnostic's current range rather
 * than the analysis that produced it, so the fix still lands on the right
 * statement after the file has been edited.
 */
export function computeQuickFix(sql: string, ruleId: string, line: number): QuickFix | null {
  if (!isFixable(ruleId)) return null;

  const result = autoFix(sql, [violationFor(ruleId, line)]);
  if (result.fixedCount === 0 || result.fixedSql === sql) return null;

  return { ...narrow(sql, result.fixedSql), title: fixTitle(ruleId) };
}

/**
 * The fixer reads only `ruleId` and `line` off a violation; the rest of the
 * shape is required by the type and never by the code path, so the editor can
 * rebuild one from a diagnostic without carrying the original around.
 */
function violationFor(ruleId: string, line: number): RuleViolation {
  return { ruleId, line, ruleName: ruleId, severity: 'warning', message: '' };
}

/**
 * Reduce a whole-file rewrite to the span that actually changed.
 *
 * The fixer returns the entire file, but replacing the entire document would
 * throw away the cursor position, folding state and undo granularity for an
 * edit that is usually one inserted word.
 */
function narrow(before: string, after: string): { start: number; end: number; newText: string } {
  const limit = Math.min(before.length, after.length);

  let start = 0;
  while (start < limit && before[start] === after[start]) start++;

  let tail = 0;
  while (tail < limit - start && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail++;

  return {
    start,
    end: before.length - tail,
    newText: after.slice(start, after.length - tail),
  };
}

/** Apply a `QuickFix` to the SQL it was computed from. Used by the tests. */
export function applyQuickFix(sql: string, fix: QuickFix): string {
  return sql.slice(0, fix.start) + fix.newText + sql.slice(fix.end);
}
