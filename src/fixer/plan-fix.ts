/**
 * Expand-contract planner.
 *
 * Some violations have no one-line fix. Making a column NOT NULL safely is
 * four statements; changing a column's type is a new column, a sync trigger, a
 * batched backfill, application releases, and only then a drop. `--fix`
 * refuses to touch those, and this is what it hands you instead: a numbered
 * plan where every step is runnable SQL, carries its own lock note, and sits
 * on the correct side of a deploy boundary.
 *
 * None of the SQL is written here. The choreographies live in
 * `src/templates/choreography.ts`, shared with `migrationpilot template` —
 * that command takes the change from you as flags, this one reads it off a
 * violation. This module is the violation-to-choreography mapping: it pulls
 * the table, column and target type off the AST and picks the pattern.
 *
 * A deploy boundary is a point where the database cannot move on until the
 * application has shipped. Steps inside one deploy can all run in the same
 * migration; steps across a boundary cannot.
 */

import type { RuleViolation } from '../rules/engine.js';
import type { ParsedStatement } from '../parser/parse.js';
import {
  addNotNullChoreography,
  changeTypeChoreography,
  renameColumnChoreography,
  batchedUpdateChoreography,
  batchedDeleteChoreography,
  uniqueConstraintChoreography,
  validateConstraintChoreography,
} from '../templates/choreography.js';
import type { Choreography, ChoreographyStep, DeployBoundary } from '../templates/choreography.js';

export type { DeployBoundary } from '../templates/choreography.js';
export type { StepDuration } from '../templates/choreography.js';

/** A choreography step, numbered for display. */
export interface PlanFixStep extends ChoreographyStep {
  /** 1-based step number within the plan */
  number: number;
}

export interface FixPlan {
  ruleId: string;
  ruleName: string;
  line: number;
  /** Short identifier for the choreography, e.g. `check-then-not-null` */
  pattern: string;
  title: string;
  summary: string;
  steps: PlanFixStep[];
  boundaries: DeployBoundary[];
  notes: string[];
  /**
   * Other rules on the same statement that this plan also resolves.
   * MP002 and MP018 both flag a bare SET NOT NULL, and one plan clears both.
   */
  alsoResolves: string[];
}

export interface UnplannedViolation {
  ruleId: string;
  line: number;
  message: string;
  /** `mechanical` (run --fix) or `unfixable` (needs a human) */
  fixClass: string;
}

export interface PlanFixReport {
  file: string;
  pgVersion: number;
  plans: FixPlan[];
  unplanned: UnplannedViolation[];
}

interface BuilderContext {
  violation: RuleViolation;
  stmt: Record<string, unknown>;
  sql: string;
  pgVersion: number;
}

/** Maps a violation onto a choreography, or null when the AST does not match. */
type Builder = (ctx: BuilderContext) => Choreography | null;

const BUILDERS: Record<string, Builder> = {
  MP002: planSetNotNull,
  MP018: planSetNotNull,
  MP081: planPg18NotNull,
  MP007: planColumnTypeChange,
  MP044: planColumnTypeChange,
  MP011: planBatchedUpdate,
  MP067: planBatchedDelete,
  MP027: planUniqueConstraint,
  MP010: planRenameColumn,
  MP071: planRenameColumn,
  MP005: planValidateConstraint,
  MP030: planValidateConstraint,
};

/** Rules `plan-fix` can emit a choreography for. */
export const PLANNABLE_RULE_IDS: ReadonlySet<string> = new Set(Object.keys(BUILDERS));

export function isPlannable(ruleId: string): boolean {
  return PLANNABLE_RULE_IDS.has(ruleId);
}

/**
 * Build expand-contract plans for every violation that has one.
 *
 * `statements` must be the parsed statements of the file, in file order — the
 * planner matches a violation to its statement by line and reads the details
 * (table, column, target type) off the AST rather than off the message text.
 */
export function buildPlanFixReport(
  file: string,
  statements: Array<ParsedStatement & { line: number }>,
  violations: RuleViolation[],
  pgVersion: number,
  fixClassOf: (ruleId: string) => string,
): PlanFixReport {
  const plans: FixPlan[] = [];
  const unplanned: UnplannedViolation[] = [];
  // Two rules can flag one statement and land on the same choreography.
  const seen = new Map<string, FixPlan>();

  for (const violation of violations) {
    const builder = BUILDERS[violation.ruleId];
    // Rules report the line of the previous statement's `;`, so more than one
    // statement can answer to a line. Try each and keep the one whose AST the
    // builder recognises — a builder returns null when the shape is wrong.
    const candidates = statements.filter(s => s.line === violation.line);
    let choreography: Choreography | null = null;
    if (builder) {
      for (const candidate of candidates) {
        choreography = builder({ violation, stmt: candidate.stmt, sql: candidate.originalSql, pgVersion });
        if (choreography) break;
      }
    }

    if (!choreography) {
      unplanned.push({
        ruleId: violation.ruleId,
        line: violation.line,
        message: violation.message,
        fixClass: fixClassOf(violation.ruleId),
      });
      continue;
    }

    const plan = toPlan(choreography, violation);
    const key = `${plan.line}:${plan.pattern}:${plan.title}`;
    const existing = seen.get(key);
    if (existing) {
      if (!existing.alsoResolves.includes(plan.ruleId)) existing.alsoResolves.push(plan.ruleId);
      continue;
    }
    seen.set(key, plan);
    plans.push(plan);
  }

  return { file, pgVersion, plans, unplanned };
}

function toPlan(choreography: Choreography, violation: RuleViolation): FixPlan {
  return {
    ruleId: violation.ruleId,
    ruleName: violation.ruleName,
    line: violation.line,
    pattern: choreography.pattern,
    title: choreography.name,
    summary: choreography.summary,
    steps: choreography.steps.map((step, i) => ({ number: i + 1, ...step })),
    boundaries: choreography.boundaries,
    notes: choreography.notes,
    alsoResolves: [],
  };
}

/* ── violation → choreography ───────────────────────────────────────────── */

function planSetNotNull(ctx: BuilderContext): Choreography | null {
  const target = setNotNullTarget(ctx.stmt);
  if (!target) return null;
  return addNotNullChoreography({ ...target, pgVersion: ctx.pgVersion });
}

/** MP081: the CHECK workaround is unnecessary on PG18 — the native path replaces it. */
function planPg18NotNull(ctx: BuilderContext): Choreography | null {
  const target = checkConstraintTarget(ctx.stmt, ctx.sql);
  if (!target) return null;
  // MP081 only fires on PG18+, where addNotNull already picks the native path.
  return addNotNullChoreography({ ...target, pgVersion: Math.max(ctx.pgVersion, 18) });
}

function planColumnTypeChange(ctx: BuilderContext): Choreography | null {
  const target = alterTypeTarget(ctx.stmt, ctx.sql);
  if (!target) return null;

  const choreography = changeTypeChoreography({
    table: target.table,
    column: target.column,
    newType: target.newType,
    pgVersion: ctx.pgVersion,
    // plan-fix defaults to handover: the deploy boundaries are the point of
    // the plan, and swapping names hides them inside one transaction.
    strategy: 'handover',
  });

  if (ctx.violation.ruleId !== 'MP044') return choreography;

  // Narrowing can lose data, so prove it cannot before anything is written.
  return {
    ...choreography,
    steps: [
      {
        title: `Confirm no existing value overflows ${target.newType}`,
        sql: `-- Must return 0. Any other number means the new type would lose data.\nSELECT count(*) FROM ${target.table}\nWHERE ${target.column} IS NOT NULL\n  AND ${target.column}::text <> (${target.column}::${target.newType})::text;`,
        lock: 'ACCESS SHARE',
        lockNote: 'A read — blocks nothing.',
        duration: 'minutes',
        transactional: true,
        phase: 'expand',
        deploy: 1,
      },
      ...choreography.steps,
    ],
    // Every step shifted by one, so the boundaries move with them.
    boundaries: choreography.boundaries.map(b => ({ ...b, afterStep: b.afterStep + 1 })),
    notes: [
      ...choreography.notes,
      `Step 1 is not optional here — ${target.newType} is narrower than the current type, so a value that does not fit would be lost silently in the backfill.`,
    ],
  };
}

function planBatchedUpdate(ctx: BuilderContext): Choreography | null {
  const table = relationName(ctx.stmt, 'UpdateStmt');
  if (!table) return null;
  const assignment = updateAssignment(ctx.sql) ?? '<column> = <value>';
  return batchedUpdateChoreography({
    table,
    assignment,
    predicate: donePredicate(assignment),
    pgVersion: ctx.pgVersion,
  });
}

function planBatchedDelete(ctx: BuilderContext): Choreography | null {
  const table = relationName(ctx.stmt, 'DeleteStmt');
  if (!table) return null;
  return batchedDeleteChoreography({ table, pgVersion: ctx.pgVersion });
}

function planUniqueConstraint(ctx: BuilderContext): Choreography | null {
  const target = uniqueConstraintTarget(ctx.stmt);
  if (!target) return null;
  return uniqueConstraintChoreography({ ...target, pgVersion: ctx.pgVersion });
}

function planRenameColumn(ctx: BuilderContext): Choreography | null {
  const target = renameTarget(ctx.stmt);
  if (!target) return null;
  // The migration file says nothing about the source column's type, so leave
  // the placeholder rather than guessing.
  return renameColumnChoreography({
    table: target.table,
    column: target.from,
    newName: target.to,
    pgVersion: ctx.pgVersion,
  });
}

function planValidateConstraint(ctx: BuilderContext): Choreography | null {
  const target = addConstraintTarget(ctx.stmt);
  if (!target) return null;
  return validateConstraintChoreography({ ...target, pgVersion: ctx.pgVersion });
}

/* ── AST extraction ─────────────────────────────────────────────────────── */

interface AlterTableCmd {
  subtype?: string;
  name?: string;
  def?: Record<string, unknown>;
}

function alterCmds(stmt: Record<string, unknown>): { table: string; cmds: AlterTableCmd[] } | null {
  if (!('AlterTableStmt' in stmt)) return null;
  const alter = stmt.AlterTableStmt as {
    relation?: { relname?: string };
    cmds?: Array<{ AlterTableCmd?: AlterTableCmd }>;
  };
  const table = alter.relation?.relname;
  if (!table || !alter.cmds) return null;
  const cmds = alter.cmds.map(c => c.AlterTableCmd).filter((c): c is AlterTableCmd => !!c);
  return { table, cmds };
}

function setNotNullTarget(stmt: Record<string, unknown>): { table: string; column: string } | null {
  const alter = alterCmds(stmt);
  if (!alter) return null;
  for (const cmd of alter.cmds) {
    if (cmd.subtype === 'AT_SetNotNull' && cmd.name) {
      return { table: alter.table, column: cmd.name };
    }
  }
  return null;
}

function alterTypeTarget(stmt: Record<string, unknown>, sql: string): { table: string; column: string; newType: string } | null {
  const alter = alterCmds(stmt);
  if (!alter) return null;
  for (const cmd of alter.cmds) {
    if (cmd.subtype !== 'AT_AlterColumnType' || !cmd.name) continue;
    // Take the type as the author spelled it, so `numeric(12,2)` survives.
    const written = /\bTYPE\s+([\s\S]+?)(?:\s+USING\b[\s\S]*)?;?\s*$/i.exec(sql);
    const newType = written?.[1]?.trim() ?? renderTypeName(cmd.def) ?? '<new_type>';
    return { table: alter.table, column: cmd.name, newType };
  }
  return null;
}

function renderTypeName(def: Record<string, unknown> | undefined): string | null {
  const colDef = def?.ColumnDef as { typeName?: { names?: Array<{ String?: { sval?: string } }> } } | undefined;
  const names = colDef?.typeName?.names?.map(n => n.String?.sval).filter((n): n is string => !!n) ?? [];
  const usable = names.filter(n => n !== 'pg_catalog');
  return usable.length > 0 ? usable.join('.') : null;
}

function checkConstraintTarget(stmt: Record<string, unknown>, sql: string): { table: string; column: string } | null {
  const alter = alterCmds(stmt);
  if (!alter) return null;
  for (const cmd of alter.cmds) {
    if (cmd.subtype !== 'AT_AddConstraint') continue;
    const constraint = cmd.def?.Constraint as { contype?: string; raw_expr?: unknown } | undefined;
    if (constraint?.contype !== 'CONSTR_CHECK') continue;
    const fromExpr = /"sval"\s*:\s*"([^"]+)"/.exec(JSON.stringify(constraint.raw_expr ?? ''));
    const fromSql = /CHECK\s*\(\s*([A-Za-z_][\w$]*)\s+IS\s+NOT\s+NULL/i.exec(sql);
    const column = fromSql?.[1] ?? fromExpr?.[1];
    if (column) return { table: alter.table, column };
  }
  return null;
}

function addConstraintTarget(stmt: Record<string, unknown>): { table: string; constraint: string; kind: 'foreign key' | 'check' } | null {
  const alter = alterCmds(stmt);
  if (!alter) return null;
  for (const cmd of alter.cmds) {
    if (cmd.subtype !== 'AT_AddConstraint') continue;
    const constraint = cmd.def?.Constraint as { contype?: string; conname?: string } | undefined;
    if (!constraint) continue;
    if (constraint.contype === 'CONSTR_FOREIGN') {
      return { table: alter.table, constraint: constraint.conname ?? `${alter.table}_fk`, kind: 'foreign key' };
    }
    if (constraint.contype === 'CONSTR_CHECK') {
      return { table: alter.table, constraint: constraint.conname ?? `${alter.table}_check`, kind: 'check' };
    }
  }
  return null;
}

function uniqueConstraintTarget(stmt: Record<string, unknown>): { table: string; constraint: string; columns: string[] } | null {
  const alter = alterCmds(stmt);
  if (!alter) return null;
  for (const cmd of alter.cmds) {
    if (cmd.subtype !== 'AT_AddConstraint') continue;
    const constraint = cmd.def?.Constraint as {
      contype?: string;
      conname?: string;
      keys?: Array<{ String?: { sval?: string } }>;
    } | undefined;
    if (constraint?.contype !== 'CONSTR_UNIQUE') continue;
    const columns = constraint.keys?.map(k => k.String?.sval).filter((k): k is string => !!k) ?? [];
    return {
      table: alter.table,
      constraint: constraint.conname ?? `${alter.table}_${columns.join('_') || 'key'}_key`,
      columns,
    };
  }
  return null;
}

function renameTarget(stmt: Record<string, unknown>): { table: string; from: string; to: string } | null {
  if (!('RenameStmt' in stmt)) return null;
  const rename = stmt.RenameStmt as {
    renameType?: string;
    relation?: { relname?: string };
    subname?: string;
    newname?: string;
  };
  if (rename.renameType !== 'OBJECT_COLUMN') return null;
  const table = rename.relation?.relname;
  if (!table || !rename.subname || !rename.newname) return null;
  return { table, from: rename.subname, to: rename.newname };
}

function relationName(stmt: Record<string, unknown>, key: 'UpdateStmt' | 'DeleteStmt'): string | null {
  if (!(key in stmt)) return null;
  const node = stmt[key] as { relation?: { relname?: string } };
  return node.relation?.relname ?? null;
}

/** The SET list of an UPDATE, as written. */
function updateAssignment(sql: string): string | null {
  const match = /\bSET\b([\s\S]+?)(?:\bFROM\b|\bWHERE\b|\bRETURNING\b|;\s*$|$)/i.exec(sql);
  const body = match?.[1]?.trim().replace(/;\s*$/, '').trim();
  return body && body.length > 0 ? body : null;
}

/**
 * A predicate that stops matching a row once the backfill has touched it,
 * so the loop terminates.
 *
 * Only a single assignment of a literal can be turned into one safely.
 * `updated_at = now()` is never equal to itself on the next pass, so deriving
 * a predicate from it would loop forever — those get a placeholder to fill in.
 */
function donePredicate(assignment: string): string {
  const single = splitAssignments(assignment);
  if (single.length === 1) {
    const match = /^\s*([A-Za-z_][\w$]*)\s*=\s*([\s\S]+?)\s*$/.exec(single[0]!);
    const value = match?.[2];
    if (match && value && isLiteral(value)) {
      return `${match[1]} IS DISTINCT FROM ${value}`;
    }
    if (match) return `${match[1]} IS DISTINCT FROM <value>`;
  }
  return '<column> IS DISTINCT FROM <value>';
}

/** True for values that mean the same thing every time they are evaluated. */
function isLiteral(value: string): boolean {
  return /^'(?:[^']|'')*'$/.test(value)
    || /^-?\d+(?:\.\d+)?$/.test(value)
    || /^(true|false|null)$/i.test(value);
}

/** Split a SET list on commas that are not nested or inside a string. */
function splitAssignments(assignment: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < assignment.length; i++) {
    const ch = assignment[i];
    if (ch === "'") {
      i = assignment.indexOf("'", i + 1);
      if (i === -1) break;
      continue;
    }
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      parts.push(assignment.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(assignment.slice(start));
  return parts.map(p => p.trim()).filter(Boolean);
}
