/**
 * Reversibility grading.
 *
 * `rollback` answers "what is the reverse SQL?". This answers the question you
 * ask before merging: "if this goes wrong at 2am, can we get back?"
 *
 * Every statement is classified by the rollback generator itself
 * (see assessReversibility in ./rollback.ts) — this module only rolls those
 * verdicts up into one grade per migration:
 *
 * - GREEN  — every statement has an exact inverse.
 * - YELLOW — reversible with care: something the reverse cannot restore from
 *            the migration alone (an index definition, a default expression,
 *            a constraint body), but no row data is destroyed.
 * - RED    — irreversible: undoing it cannot bring the data back.
 *
 * Pure by design — no filesystem, no network — because it runs in the browser
 * playground as well as the CLI. Finding the companion down file lives in
 * ./down-file.ts.
 */

import { assessReversibility } from './rollback.js';
import type { Reversibility } from './rollback.js';
import type { CompanionDown } from './down-file.js';

export type ReversibilityGrade = 'GREEN' | 'YELLOW' | 'RED';

export interface ReversibilityReason {
  /** Grade contributed by this statement — `clean` statements are not listed. */
  grade: Exclude<ReversibilityGrade, 'GREEN'>;
  /** The statement, collapsed to a single line and truncated for display. */
  statement: string;
  /** Why the reversal is imperfect. */
  reason: string;
  /** Line in the migration file, when known. */
  line?: number;
}

export interface ReversibilityAssessment {
  grade: ReversibilityGrade;
  counts: { clean: number; care: number; irreversible: number };
  /** One entry per statement that is not cleanly reversible, in file order. */
  reasons: ReversibilityReason[];
  /** Set by the CLI once the filesystem has been checked — never by the grader. */
  companionDown?: CompanionDown;
}

interface GradableStatement {
  stmt: Record<string, unknown>;
  originalSql: string;
  line?: number;
}

/**
 * Grade how reversible a parsed migration is.
 *
 * Pure: no filesystem, no network. The companion down file is resolved
 * separately by {@link resolveCompanionDown} and attached by the caller.
 */
export function gradeReversibility(statements: GradableStatement[]): ReversibilityAssessment {
  const counts = { clean: 0, care: 0, irreversible: 0 };
  const reasons: ReversibilityReason[] = [];

  for (const entry of statements) {
    const { reversibility, reason } = assessReversibility(entry.stmt, entry.originalSql);
    counts[reversibility]++;

    if (reversibility === 'clean') continue;

    reasons.push({
      grade: reversibility === 'irreversible' ? 'RED' : 'YELLOW',
      statement: preview(entry.originalSql),
      reason: reason ?? 'This statement cannot be undone exactly.',
      ...(entry.line !== undefined && { line: entry.line }),
    });
  }

  return { grade: rollUp(counts), counts, reasons };
}

/** Roll per-statement verdicts up into the file's grade — worst wins. */
export function rollUp(counts: Record<Reversibility, number>): ReversibilityGrade {
  if (counts.irreversible > 0) return 'RED';
  if (counts.care > 0) return 'YELLOW';
  return 'GREEN';
}

/**
 * Collapse a statement to one line for display, dropping the comment block it
 * may be introduced by — the parser hands back everything since the previous
 * semicolon, comments included.
 */
function preview(sql: string, max = 100): string {
  const flat = sql.replace(/^(?:[ \t]*--[^\n]*\n)+/, '').replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 3)}...` : flat;
}
