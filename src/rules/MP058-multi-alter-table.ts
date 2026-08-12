import type { Rule, RuleContext, RuleViolation } from './engine.js';
import { enclosingBeginIndex, enclosingBeginIndexAt } from './helpers.js';
import { extractTargets } from '../parser/extract.js';

/**
 * MP058: multi-alter-table-same-table
 *
 * Combining subcommands into one ALTER TABLE turns N lock acquisitions into
 * one. That advice is only worth giving when the merge is free, and there are
 * three shapes where it is not — each of them a pattern the handbook prescribes:
 *
 * - `VALIDATE CONSTRAINT` on its own takes SHARE UPDATE EXCLUSIVE, so writes
 *   continue during the scan. Merged into a sibling subcommand it runs under the
 *   statement's ACCESS EXCLUSIVE instead, and the scan blocks everything
 *   (MPH-004). Verified on PostgreSQL 18.3: the split form reports
 *   `ShareUpdateExclusiveLock`, the merged form `AccessExclusiveLock`.
 * - `SET NOT NULL` skips its table scan only while the CHECK that proves the
 *   column non-null is still there. The ALTER TABLE manual: the scan is skipped
 *   if a valid CHECK exists "and is not dropped in the same command". Merging
 *   the DROP CONSTRAINT back in reinstates the scan (MPH-003).
 * - Statements separated by something that reads or writes the table cannot be
 *   merged without moving that statement, which is a different migration.
 *
 * Outside those, separate ALTERs on one table are just wasted lock cycles and
 * the rule fires.
 */

interface AlterMember {
  index: number;
  subtypes: string[];
  /** Names of constraints this statement adds NOT VALID. */
  addsNotValid: string[];
}

export const multiAlterTable: Rule = {
  id: 'MP058',
  name: 'multi-alter-table-same-table',
  severity: 'warning',
  description: 'Independent ALTER TABLE statements on the same table acquire the lock once each. Combine them into a single statement.',
  whyItMatters: 'Each ALTER TABLE acquires ACCESS EXCLUSIVE lock independently. Multiple separate ALTER TABLE statements on the same table means multiple lock/unlock cycles, each going through the lock queue. Long-running queries must finish before each lock acquisition. Combining subcommands into a single ALTER TABLE reduces the blocking window from N separate lock cycles to one. This only holds for subcommands that are independent of each other: a NOT VALID constraint and its VALIDATE, or a SET NOT NULL and the CHECK constraint proving it, are deliberately kept apart, and merging them takes the scan they were written to avoid and puts it back under ACCESS EXCLUSIVE.',
  docsUrl: 'https://migrationpilot.dev/rules/mp058',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (!('AlterTableStmt' in stmt)) return null;

    const alter = stmt.AlterTableStmt as { relation?: { relname?: string } };
    const table = alter.relation?.relname ?? 'unknown';

    // One finding per group, raised on its first member.
    const block = enclosingBeginIndex(ctx);
    const members = collectMembers(ctx, table, block);
    if (members.length <= 1) return null;
    if (members[0]!.index !== ctx.statementIndex) return null;

    if (!isMergeFree(ctx, table, members)) return null;

    const count = members.length;
    return {
      ruleId: 'MP058',
      ruleName: 'multi-alter-table-same-table',
      severity: 'warning',
      message: `${count} separate ALTER TABLE statements on "${table}". Each acquires ACCESS EXCLUSIVE lock independently. Combine into a single ALTER TABLE with multiple subcommands to reduce lock acquisitions from ${count} to 1.`,
      line: ctx.line,
      safeAlternative: `-- Combine into a single statement:
-- ALTER TABLE ${table}
--   ADD COLUMN ...,
--   ALTER COLUMN ...,
--   ADD CONSTRAINT ...;`,
    };
  },
};

/**
 * Every ALTER TABLE on `table` that shares a transaction block with this one.
 *
 * Statements in different blocks cannot be merged — there is a COMMIT between
 * them — so each block is considered on its own. `block` is the index of the
 * enclosing BEGIN, or -1 for autocommit, where consecutive statements are
 * separate implicit transactions and merging them is exactly the point.
 */
function collectMembers(ctx: RuleContext, table: string, block: number): AlterMember[] {
  const members: AlterMember[] = [];

  for (let i = 0; i < ctx.allStatements.length; i++) {
    const entry = ctx.allStatements[i];
    if (!entry || !('AlterTableStmt' in entry.stmt)) continue;

    const alter = entry.stmt.AlterTableStmt as {
      relation?: { relname?: string };
      cmds?: Array<{ AlterTableCmd?: { subtype?: string; def?: Record<string, unknown> } }>;
    };
    if ((alter.relation?.relname ?? 'unknown') !== table) continue;
    if (enclosingBeginIndexAt(ctx.allStatements, i) !== block) continue;

    const subtypes: string[] = [];
    const addsNotValid: string[] = [];
    for (const wrapper of alter.cmds ?? []) {
      const cmd = wrapper.AlterTableCmd;
      if (!cmd?.subtype) continue;
      subtypes.push(cmd.subtype);
      const constraint = cmd.def?.Constraint as
        | { conname?: string; skip_validation?: boolean }
        | undefined;
      if (constraint?.skip_validation && constraint.conname) {
        addsNotValid.push(constraint.conname.toLowerCase());
      }
    }
    members.push({ index: i, subtypes, addsNotValid });
  }

  return members;
}

/** Would merging this group cost nothing? */
function isMergeFree(ctx: RuleContext, table: string, members: AlterMember[]): boolean {
  const subtypes = new Set(members.flatMap(m => m.subtypes));

  // MPH-004. VALIDATE alone runs under SHARE UPDATE EXCLUSIVE; merged, its scan
  // runs under the statement's ACCESS EXCLUSIVE. Splitting it is the pattern.
  if (subtypes.has('AT_ValidateConstraint')) return false;

  // MPH-003. The scan is skipped only while the proving CHECK survives the
  // command. Merge the DROP CONSTRAINT in and the full scan comes back.
  if (subtypes.has('AT_SetNotNull') && subtypes.has('AT_DropConstraint')) return false;

  // A constraint added NOT VALID here and dropped or altered further down is the
  // same two-phase choreography under another name.
  const notValid = new Set(members.flatMap(m => m.addsNotValid));
  if (notValid.size > 0 && subtypes.has('AT_DropConstraint')) return false;

  // Anything that reads or writes the table between two members pins their
  // order: merging them would move a statement past it.
  const first = members[0]!.index;
  const last = members[members.length - 1]!.index;
  const memberIndices = new Set(members.map(m => m.index));

  for (let i = first + 1; i < last; i++) {
    if (memberIndices.has(i)) continue;
    const entry = ctx.allStatements[i];
    if (!entry) continue;
    if (touchesTable(entry.stmt, table)) return false;
  }

  return true;
}

/** Does this statement name the table, as a DDL target or in DML? */
function touchesTable(stmt: Record<string, unknown>, table: string): boolean {
  if (extractTargets(stmt).some(t => t.tableName === table)) return true;

  for (const key of ['UpdateStmt', 'InsertStmt', 'DeleteStmt']) {
    if (!(key in stmt)) continue;
    const dml = stmt[key] as { relation?: { relname?: string } };
    if (dml.relation?.relname === table) return true;
  }

  return false;
}
