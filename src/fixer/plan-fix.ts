/**
 * Expand-contract planner.
 *
 * Some violations have no one-line fix. Making a column NOT NULL safely is
 * four statements; changing a column's type is a new column, a sync trigger, a
 * batched backfill, an application release, and only then a drop. `--fix`
 * refuses to touch those, and this is what it hands you instead: a numbered
 * plan where every step is runnable SQL, carries its own lock note, and sits
 * on the correct side of a deploy boundary.
 *
 * A deploy boundary is a point where the database cannot move on until the
 * application has shipped. Steps inside one deploy can all run in the same
 * migration; steps across a boundary cannot.
 */

import type { RuleViolation } from '../rules/engine.js';
import type { ParsedStatement } from '../parser/parse.js';

export type StepDuration = 'instant' | 'seconds' | 'minutes' | 'hours';

export interface PlanFixStep {
  /** 1-based step number within the plan */
  number: number;
  title: string;
  /** Runnable SQL for this step */
  sql: string;
  /** Heaviest lock the step takes */
  lock: string;
  /** What that lock blocks, in one line */
  lockNote: string;
  duration: StepDuration;
  /** false when PostgreSQL forbids this step inside a transaction block */
  transactional: boolean;
  /** 1-based deploy this step belongs to */
  deploy: number;
}

export interface DeployBoundary {
  /** The boundary sits immediately after this step number */
  afterStep: number;
  /** What has to ship before the following steps may run */
  reason: string;
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

type Draft = Omit<PlanFixStep, 'number'>;

interface Builder {
  (ctx: BuilderContext): FixPlan | null;
}

interface BuilderContext {
  violation: RuleViolation;
  stmt: Record<string, unknown>;
  sql: string;
  pgVersion: number;
}

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
 * `statements` must be the parsed statements of `sql`, in file order — the
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
    let plan: FixPlan | null = null;
    if (builder) {
      for (const candidate of candidates) {
        plan = builder({ violation, stmt: candidate.stmt, sql: candidate.originalSql, pgVersion });
        if (plan) break;
      }
    }

    if (!plan) {
      unplanned.push({
        ruleId: violation.ruleId,
        line: violation.line,
        message: violation.message,
        fixClass: fixClassOf(violation.ruleId),
      });
      continue;
    }

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

/* ── choreographies ─────────────────────────────────────────────────────── */

/**
 * SET NOT NULL without the full-table scan.
 *
 * PG18 stores NOT NULL in pg_constraint, so it can be added NOT VALID and
 * validated under a lock that allows reads and writes — two steps. Before
 * that, the same effect is reached the long way round: a CHECK constraint
 * stands in as the proof PostgreSQL needs, so the final SET NOT NULL is
 * instant. On PG < 12 that shortcut does not exist and the scan is
 * unavoidable, so the plan is about failing fast instead.
 */
function planSetNotNull(ctx: BuilderContext): FixPlan | null {
  const target = setNotNullTarget(ctx.stmt);
  if (!target) return null;
  const { table, column } = target;
  const constraint = `${table}_${column}_not_null`;
  const base = {
    ruleId: ctx.violation.ruleId,
    ruleName: ctx.violation.ruleName,
    line: ctx.violation.line,
    title: `Make ${table}.${column} NOT NULL without a blocking scan`,
  };

  if (ctx.pgVersion >= 18) {
    return assemble({
      ...base,
      pattern: 'pg18-not-null-not-valid',
      summary: 'PostgreSQL 18 adds the constraint instantly and validates it under a lock that allows reads and writes.',
      drafts: [
        {
          title: 'Add the NOT NULL constraint NOT VALID',
          sql: `SET lock_timeout = '5s';\nALTER TABLE ${table}\n  ADD CONSTRAINT ${constraint} NOT NULL ${column} NOT VALID;`,
          lock: 'ACCESS EXCLUSIVE',
          lockNote: 'Held for milliseconds — no rows are read, only the catalog is written.',
          duration: 'instant',
          transactional: true,
          deploy: 1,
        },
        {
          title: 'Validate the constraint',
          sql: `SET lock_timeout = '5s';\nALTER TABLE ${table} VALIDATE CONSTRAINT ${constraint};`,
          lock: 'SHARE UPDATE EXCLUSIVE',
          lockNote: 'Reads and writes continue; only other schema changes wait.',
          duration: 'minutes',
          transactional: true,
          deploy: 1,
        },
      ],
      boundaries: [],
      notes: [
        `Rows inserted from step 1 onward are already checked — the constraint is enforced immediately, it is only the existing rows that step 2 confirms.`,
        `If step 2 fails, some existing rows are NULL. Backfill them, then re-run VALIDATE CONSTRAINT.`,
      ],
    });
  }

  if (ctx.pgVersion < 12) {
    return assemble({
      ...base,
      pattern: 'not-null-scan-guarded',
      summary: `PostgreSQL ${ctx.pgVersion} cannot skip the scan — SET NOT NULL always reads every row under ACCESS EXCLUSIVE. Plan for a short, guarded outage window instead.`,
      drafts: [
        {
          title: 'Backfill the remaining NULLs in batches',
          sql: batchedUpdateSql(table, `${column} = <value>`, `${column} IS NULL`, ctx.pgVersion),
          lock: 'ROW EXCLUSIVE',
          lockNote: 'Per-batch row locks only; readers are never blocked.',
          duration: 'hours',
          transactional: false,
          deploy: 1,
        },
        {
          title: 'Take the scan behind a short lock_timeout',
          sql: `SET lock_timeout = '5s';\nALTER TABLE ${table} ALTER COLUMN ${column} SET NOT NULL;\nRESET lock_timeout;`,
          lock: 'ACCESS EXCLUSIVE',
          lockNote: 'Blocks all reads and writes for the length of a full table scan.',
          duration: 'minutes',
          transactional: true,
          deploy: 1,
        },
      ],
      boundaries: [],
      notes: [
        `Upgrading to PostgreSQL 12 or later turns step 2 into an instant catalog update.`,
        `Retry step 2 rather than raising lock_timeout — a long wait queues every query behind it.`,
      ],
    });
  }

  return assemble({
    ...base,
    pattern: 'check-then-not-null',
    summary: 'A validated CHECK constraint is proof enough for PostgreSQL 12+, so the final SET NOT NULL never scans the table.',
    drafts: [
      {
        title: 'Add the CHECK constraint NOT VALID',
        sql: `SET lock_timeout = '5s';\nALTER TABLE ${table}\n  ADD CONSTRAINT ${constraint} CHECK (${column} IS NOT NULL) NOT VALID;`,
        lock: 'ACCESS EXCLUSIVE',
        lockNote: 'Held for milliseconds — NOT VALID skips the scan of existing rows.',
        duration: 'instant',
        transactional: true,
        deploy: 1,
      },
      {
        title: 'Validate the constraint',
        sql: `SET lock_timeout = '5s';\nALTER TABLE ${table} VALIDATE CONSTRAINT ${constraint};`,
        lock: 'SHARE UPDATE EXCLUSIVE',
        lockNote: 'Reads and writes continue; only other schema changes wait.',
        duration: 'minutes',
        transactional: true,
        deploy: 1,
      },
      {
        title: 'Set NOT NULL — instant, backed by the validated CHECK',
        sql: `SET lock_timeout = '5s';\nALTER TABLE ${table} ALTER COLUMN ${column} SET NOT NULL;`,
        lock: 'ACCESS EXCLUSIVE',
        lockNote: 'Held for milliseconds — PostgreSQL 12+ trusts the validated CHECK instead of rescanning.',
        duration: 'instant',
        transactional: true,
        deploy: 1,
      },
      {
        title: 'Drop the now-redundant CHECK constraint',
        sql: `SET lock_timeout = '5s';\nALTER TABLE ${table} DROP CONSTRAINT ${constraint};`,
        lock: 'ACCESS EXCLUSIVE',
        lockNote: 'Held for milliseconds — catalog only.',
        duration: 'instant',
        transactional: true,
        deploy: 1,
      },
    ],
    boundaries: [],
    notes: [
      `All four steps are database-only — no application release sits between them.`,
      `If step 2 fails, existing rows are NULL. Backfill them, then re-run VALIDATE CONSTRAINT.`,
      `Steps 3 and 4 must not run before step 2 succeeds, or step 3 falls back to a full scan.`,
    ],
  });
}

/** MP081: the CHECK workaround is unnecessary on PG18 — replace it in place. */
function planPg18NotNull(ctx: BuilderContext): FixPlan | null {
  const target = checkConstraintTarget(ctx.stmt, ctx.sql);
  if (!target) return null;
  const { table, column } = target;
  const constraint = `${table}_${column}_not_null`;

  return assemble({
    ruleId: ctx.violation.ruleId,
    ruleName: ctx.violation.ruleName,
    line: ctx.violation.line,
    pattern: 'pg18-not-null-not-valid',
    title: `Replace the CHECK workaround on ${table}.${column} with a native NOT NULL constraint`,
    summary: 'PostgreSQL 18 can add NOT NULL itself with NOT VALID, so the CHECK constraint and its later cleanup are no longer needed.',
    drafts: [
      {
        title: 'Add the native NOT NULL constraint NOT VALID',
        sql: `SET lock_timeout = '5s';\nALTER TABLE ${table}\n  ADD CONSTRAINT ${constraint} NOT NULL ${column} NOT VALID;`,
        lock: 'ACCESS EXCLUSIVE',
        lockNote: 'Held for milliseconds — catalog only, no scan.',
        duration: 'instant',
        transactional: true,
        deploy: 1,
      },
      {
        title: 'Validate the constraint',
        sql: `SET lock_timeout = '5s';\nALTER TABLE ${table} VALIDATE CONSTRAINT ${constraint};`,
        lock: 'SHARE UPDATE EXCLUSIVE',
        lockNote: 'Reads and writes continue; only other schema changes wait.',
        duration: 'minutes',
        transactional: true,
        deploy: 1,
      },
    ],
    boundaries: [],
    notes: [
      `This replaces the two-constraint dance: no CHECK to add, validate, lean on, and drop.`,
      `Drop any CHECK (${column} IS NOT NULL) left over from the old pattern once this constraint is valid.`,
    ],
  });
}

/**
 * Change a column's type without rewriting the table under an exclusive lock.
 *
 * The old and new columns coexist while a trigger keeps them in sync and a
 * batched backfill catches up the history. The application then switches over
 * in its own release — that release is the deploy boundary — and only after it
 * is live does the old column go.
 */
function planColumnTypeChange(ctx: BuilderContext): FixPlan | null {
  const target = alterTypeTarget(ctx.stmt, ctx.sql);
  if (!target) return null;
  const { table, column, newType } = target;
  const shadow = `${column}_new`;
  const trigger = `${table}_${column}_sync`;
  const fn = `${table}_${column}_sync_fn`;
  const narrowing = ctx.violation.ruleId === 'MP044';

  const drafts: Draft[] = [];

  if (narrowing) {
    drafts.push({
      title: `Confirm no existing value overflows ${newType}`,
      sql: `-- Must return 0. Any other number means the new type would lose data.\nSELECT count(*) FROM ${table}\nWHERE ${column} IS NOT NULL\n  AND ${column}::text <> (${column}::${newType})::text;`,
      lock: 'ACCESS SHARE',
      lockNote: 'A read — blocks nothing.',
      duration: 'minutes',
      transactional: true,
      deploy: 1,
    });
  }

  drafts.push(
    {
      title: `Add ${shadow} with the new type`,
      sql: `SET lock_timeout = '5s';\nALTER TABLE ${table} ADD COLUMN ${shadow} ${newType};`,
      lock: 'ACCESS EXCLUSIVE',
      lockNote: 'Held for milliseconds — a nullable column with no default is catalog-only.',
      duration: 'instant',
      transactional: true,
      deploy: 1,
    },
    {
      title: 'Keep both columns in sync while the backfill runs',
      sql: `CREATE OR REPLACE FUNCTION ${fn}() RETURNS trigger AS $$\nBEGIN\n  NEW.${shadow} := NEW.${column}::${newType};\n  RETURN NEW;\nEND;\n$$ LANGUAGE plpgsql;\n\nSET lock_timeout = '5s';\nCREATE TRIGGER ${trigger}\n  BEFORE INSERT OR UPDATE ON ${table}\n  FOR EACH ROW EXECUTE FUNCTION ${fn}();`,
      lock: 'ACCESS EXCLUSIVE',
      lockNote: 'Held for milliseconds, but it waits for in-flight statements on the table to finish.',
      duration: 'instant',
      transactional: true,
      deploy: 1,
    },
    {
      title: 'Backfill the existing rows in batches',
      sql: batchedUpdateSql(table, `${shadow} = ${column}::${newType}`, `${shadow} IS NULL AND ${column} IS NOT NULL`, ctx.pgVersion),
      lock: 'ROW EXCLUSIVE',
      lockNote: 'Per-batch row locks only; readers are never blocked.',
      duration: 'hours',
      transactional: false,
      deploy: 1,
    },
    {
      title: 'Confirm the backfill is complete',
      sql: `-- Must return 0 before you ship the application release.\nSELECT count(*) FROM ${table}\nWHERE ${shadow} IS NULL AND ${column} IS NOT NULL;`,
      lock: 'ACCESS SHARE',
      lockNote: 'A read — blocks nothing.',
      duration: 'seconds',
      transactional: true,
      deploy: 1,
    },
    {
      title: 'Drop the sync trigger',
      sql: `SET lock_timeout = '5s';\nDROP TRIGGER ${trigger} ON ${table};\nDROP FUNCTION ${fn}();`,
      lock: 'ACCESS EXCLUSIVE',
      lockNote: 'Held for milliseconds — catalog only.',
      duration: 'instant',
      transactional: true,
      deploy: 2,
    },
    {
      title: `Drop the old ${column} column`,
      sql: `SET lock_timeout = '5s';\nALTER TABLE ${table} DROP COLUMN ${column};`,
      lock: 'ACCESS EXCLUSIVE',
      lockNote: 'Held for milliseconds — the data is reclaimed lazily by VACUUM.',
      duration: 'instant',
      transactional: true,
      deploy: 3,
    },
  );

  const backfillCheck = drafts.findIndex(d => d.title === 'Confirm the backfill is complete') + 1;
  const dropTrigger = drafts.findIndex(d => d.title === 'Drop the sync trigger') + 1;

  return assemble({
    ruleId: ctx.violation.ruleId,
    ruleName: ctx.violation.ruleName,
    line: ctx.violation.line,
    pattern: 'expand-contract-column-type',
    title: `Change ${table}.${column} to ${newType} without a table rewrite`,
    summary: `A second column carries the new type while a trigger and a batched backfill bring it level with the old one. The application hands over across two releases, and only then does the old column go.`,
    drafts,
    boundaries: [
      // The trigger writes shadow from column, so it must outlive any release
      // that still writes column, and it must be gone before any release stops.
      {
        afterStep: backfillCheck,
        reason: `Ship the application release that reads ${shadow} and writes both ${column} and ${shadow}. The trigger keeps overwriting ${shadow} from ${column} until the next step, so both values have to agree.`,
      },
      {
        afterStep: dropTrigger,
        reason: `Ship the release that writes only ${shadow}, and wait for every instance to roll. Doing this before the trigger is dropped would let it overwrite ${shadow} with a stale ${column}.`,
      },
    ],
    notes: [
      `Steps up to the first boundary are additive — rolling back means dropping ${shadow}, and nothing that is live depends on it yet.`,
      `If you would rather not touch application code, swap the names instead of dropping: rename ${column} out of the way and ${shadow} into its place inside one transaction. That trades both deploy boundaries for a brief ACCESS EXCLUSIVE lock and a trigger that must be rebuilt.`,
      narrowing
        ? `Step 1 is not optional here — ${newType} is narrower than the current type, so a value that does not fit would be lost silently in the backfill.`
        : `Copy any index, default, or constraint from ${column} onto ${shadow} before the first boundary; they do not follow the data.`,
    ],
  });
}

/** MP011: a full-table UPDATE becomes a loop that commits and pauses. */
function planBatchedUpdate(ctx: BuilderContext): FixPlan | null {
  const table = relationName(ctx.stmt, 'UpdateStmt');
  if (!table) return null;
  const assignment = updateAssignment(ctx.sql) ?? '<column> = <value>';
  const predicate = donePredicate(assignment);

  return assemble({
    ruleId: ctx.violation.ruleId,
    ruleName: ctx.violation.ruleName,
    line: ctx.violation.line,
    pattern: 'batched-backfill',
    title: `Rewrite the ${table} backfill as batches`,
    summary: 'One UPDATE over the whole table holds its locks and its WAL until the last row. Batching commits as it goes, so replicas keep up and other queries get a turn.',
    drafts: [
      {
        title: 'Run the backfill in committed batches',
        sql: batchedUpdateSql(table, assignment, predicate, ctx.pgVersion),
        lock: 'ROW EXCLUSIVE',
        lockNote: 'Per-batch row locks, released at each COMMIT; readers are never blocked.',
        duration: 'hours',
        transactional: false,
        deploy: 1,
      },
      {
        title: 'Confirm no rows are left',
        sql: `-- Must return 0.\nSELECT count(*) FROM ${table} WHERE ${predicate};`,
        lock: 'ACCESS SHARE',
        lockNote: 'A read — blocks nothing.',
        duration: 'seconds',
        transactional: true,
        deploy: 1,
      },
    ],
    boundaries: [],
    notes: [
      `Replace the placeholder predicate with one that is false once a row is done — the loop exits when a pass updates nothing.`,
      `The loop needs an index supporting the predicate, or every batch degrades into a sequential scan.`,
      `Watch replication lag while it runs and raise the sleep if replicas fall behind.`,
    ],
  });
}

/** MP067: a full-table DELETE is either TRUNCATE or a batched loop. */
function planBatchedDelete(ctx: BuilderContext): FixPlan | null {
  const table = relationName(ctx.stmt, 'DeleteStmt');
  if (!table) return null;

  return assemble({
    ruleId: ctx.violation.ruleId,
    ruleName: ctx.violation.ruleName,
    line: ctx.violation.line,
    pattern: 'batched-backfill',
    title: `Rewrite the ${table} delete as batches`,
    summary: 'A WHERE-less DELETE writes a WAL record per row and holds its locks to the end. If the whole table really is going, TRUNCATE does it in one catalog operation; otherwise delete in committed batches.',
    drafts: [
      {
        title: 'Delete in committed batches',
        sql: batchedDeleteSql(table, ctx.pgVersion),
        lock: 'ROW EXCLUSIVE',
        lockNote: 'Per-batch row locks, released at each COMMIT; readers are never blocked.',
        duration: 'hours',
        transactional: false,
        deploy: 1,
      },
      {
        title: 'Reclaim the space',
        sql: `VACUUM (ANALYZE) ${table};`,
        lock: 'SHARE UPDATE EXCLUSIVE',
        lockNote: 'Reads and writes continue; only other schema changes wait.',
        duration: 'minutes',
        transactional: false,
        deploy: 1,
      },
    ],
    boundaries: [],
    notes: [
      `If every row is going and no other transaction needs to read the table meanwhile, TRUNCATE ${table}; is one statement and almost no WAL — but it takes ACCESS EXCLUSIVE and cannot be undone row by row.`,
      `Add a WHERE clause to the batch to keep the rows you meant to keep; the loop as written removes everything.`,
      `Batched deletes leave dead tuples behind, which is why step 2 exists.`,
    ],
  });
}

/** MP027: build the unique index first, then adopt it as the constraint. */
function planUniqueConstraint(ctx: BuilderContext): FixPlan | null {
  const target = uniqueConstraintTarget(ctx.stmt);
  if (!target) return null;
  const { table, constraint, columns } = target;
  const index = `${constraint}_idx`;
  const columnList = columns.length > 0 ? columns.join(', ') : '<columns>';

  return assemble({
    ruleId: ctx.violation.ruleId,
    ruleName: ctx.violation.ruleName,
    line: ctx.violation.line,
    pattern: 'index-then-constraint',
    title: `Add the ${constraint} unique constraint without blocking writes`,
    summary: 'ADD CONSTRAINT UNIQUE builds its index while holding ACCESS EXCLUSIVE. Building the index concurrently first and then adopting it leaves only a catalog update to lock.',
    drafts: [
      {
        title: 'Build the unique index concurrently',
        sql: `SET lock_timeout = '5s';\nCREATE UNIQUE INDEX CONCURRENTLY ${index}\n  ON ${table} (${columnList});`,
        lock: 'SHARE UPDATE EXCLUSIVE',
        lockNote: 'Reads and writes continue throughout the build.',
        duration: 'minutes',
        transactional: false,
        deploy: 1,
      },
      {
        title: 'Adopt the index as the constraint',
        sql: `SET lock_timeout = '5s';\nALTER TABLE ${table}\n  ADD CONSTRAINT ${constraint} UNIQUE USING INDEX ${index};`,
        lock: 'ACCESS EXCLUSIVE',
        lockNote: 'Held for milliseconds — the index already exists, so nothing is scanned.',
        duration: 'instant',
        transactional: true,
        deploy: 1,
      },
    ],
    boundaries: [],
    notes: [
      `Step 1 cannot run inside a transaction block. If your migration tool wraps files in BEGIN/COMMIT, put this step in its own file or disable the wrapper for it.`,
      `A failed CONCURRENTLY build leaves an invalid index behind. Check with \\d ${table}, DROP INDEX CONCURRENTLY ${index}, and start over.`,
      `Step 2 renames the index to ${constraint}. That is PostgreSQL's doing, not a mistake.`,
    ],
  });
}

/**
 * Rename a column without breaking the running application.
 *
 * Two boundaries, because there is no instant at which every instance can
 * switch names at once: one release starts writing both, the next stops
 * reading the old one.
 */
function planRenameColumn(ctx: BuilderContext): FixPlan | null {
  const target = renameTarget(ctx.stmt);
  if (!target) return null;
  const { table, from, to } = target;
  const trigger = `${table}_${from}_sync`;
  const fn = `${table}_${from}_sync_fn`;

  return assemble({
    ruleId: ctx.violation.ruleId,
    ruleName: ctx.violation.ruleName,
    line: ctx.violation.line,
    pattern: 'expand-contract-rename',
    title: `Rename ${table}.${from} to ${to} without breaking running code`,
    summary: `RENAME COLUMN is instant in the database and immediate for every query already written against ${from}. Adding ${to} alongside lets the application move over one release at a time.`,
    drafts: [
      {
        title: `Add ${to} with the same type as ${from}`,
        sql: `SET lock_timeout = '5s';\nALTER TABLE ${table} ADD COLUMN ${to} <same type as ${from}>;`,
        lock: 'ACCESS EXCLUSIVE',
        lockNote: 'Held for milliseconds — a nullable column with no default is catalog-only.',
        duration: 'instant',
        transactional: true,
        deploy: 1,
      },
      {
        title: 'Mirror writes from the old column to the new one',
        sql: `CREATE OR REPLACE FUNCTION ${fn}() RETURNS trigger AS $$\nBEGIN\n  NEW.${to} := NEW.${from};\n  RETURN NEW;\nEND;\n$$ LANGUAGE plpgsql;\n\nSET lock_timeout = '5s';\nCREATE TRIGGER ${trigger}\n  BEFORE INSERT OR UPDATE ON ${table}\n  FOR EACH ROW EXECUTE FUNCTION ${fn}();`,
        lock: 'ACCESS EXCLUSIVE',
        lockNote: 'Held for milliseconds, but it waits for in-flight statements on the table to finish.',
        duration: 'instant',
        transactional: true,
        deploy: 1,
      },
      {
        title: 'Backfill the existing rows in batches',
        sql: batchedUpdateSql(table, `${to} = ${from}`, `${to} IS NULL AND ${from} IS NOT NULL`, ctx.pgVersion),
        lock: 'ROW EXCLUSIVE',
        lockNote: 'Per-batch row locks only; readers are never blocked.',
        duration: 'hours',
        transactional: false,
        deploy: 1,
      },
      {
        title: 'Drop the mirroring trigger',
        sql: `SET lock_timeout = '5s';\nDROP TRIGGER ${trigger} ON ${table};\nDROP FUNCTION ${fn}();`,
        lock: 'ACCESS EXCLUSIVE',
        lockNote: 'Held for milliseconds — catalog only.',
        duration: 'instant',
        transactional: true,
        deploy: 2,
      },
      {
        title: `Drop ${from}`,
        sql: `SET lock_timeout = '5s';\nALTER TABLE ${table} DROP COLUMN ${from};`,
        lock: 'ACCESS EXCLUSIVE',
        lockNote: 'Held for milliseconds — the data is reclaimed lazily by VACUUM.',
        duration: 'instant',
        transactional: true,
        deploy: 3,
      },
    ],
    // The trigger writes `to` from `from`, so it has to outlive every release
    // that still writes `from`, and be gone before any release stops.
    boundaries: [
      {
        afterStep: 3,
        reason: `Ship the application release that reads ${to} and writes both columns. The trigger keeps overwriting ${to} from ${from} until the next step, so both values have to agree.`,
      },
      {
        afterStep: 4,
        reason: `Ship the release that stops touching ${from} entirely, and wait for every instance to roll. Doing this before the trigger is dropped would let it overwrite ${to} with a NULL ${from}. Views, functions, and triggers elsewhere that name ${from} must move too.`,
      },
    ],
    notes: [
      `Nothing before the first boundary is visible to the application, so it can be rolled back by dropping ${to}.`,
      `Check for other references first: SELECT * FROM pg_depend and \\d+ on any view over ${table}.`,
      `If ${from} is NOT NULL, add the same constraint to ${to} after the backfill — see MP002 for how to do that without a scan.`,
    ],
  });
}

/** MP005 / MP030: the NOT VALID that `--fix` adds still needs validating. */
function planValidateConstraint(ctx: BuilderContext): FixPlan | null {
  const target = addConstraintTarget(ctx.stmt);
  if (!target) return null;
  const { table, constraint, kind } = target;
  const label = kind === 'foreign key' ? 'FOREIGN KEY (...) REFERENCES ...' : 'CHECK (...)';

  return assemble({
    ruleId: ctx.violation.ruleId,
    ruleName: ctx.violation.ruleName,
    line: ctx.violation.line,
    pattern: 'not-valid-then-validate',
    title: `Add ${constraint} to ${table} without scanning under an exclusive lock`,
    summary: `NOT VALID splits the work in two: the constraint starts enforcing new rows immediately under a lock held for milliseconds, and the existing rows are checked afterwards under a lock that allows reads and writes.`,
    drafts: [
      {
        title: 'Add the constraint NOT VALID',
        sql: `SET lock_timeout = '5s';\nALTER TABLE ${table}\n  ADD CONSTRAINT ${constraint} ${label} NOT VALID;`,
        lock: 'ACCESS EXCLUSIVE',
        lockNote: 'Held for milliseconds — existing rows are not read.',
        duration: 'instant',
        transactional: true,
        deploy: 1,
      },
      {
        title: 'Validate the existing rows',
        sql: `SET lock_timeout = '5s';\nALTER TABLE ${table} VALIDATE CONSTRAINT ${constraint};`,
        lock: 'SHARE UPDATE EXCLUSIVE',
        lockNote: 'Reads and writes continue; only other schema changes wait.',
        duration: 'minutes',
        transactional: true,
        deploy: 1,
      },
    ],
    boundaries: [],
    notes: [
      `\`migrationpilot analyze --fix\` writes step 1 for you. Step 2 is the part it cannot add, because a constraint that fails validation needs the bad rows dealt with first.`,
      kind === 'foreign key'
        ? `A NOT VALID foreign key still locks the referenced table briefly, and the planner ignores it for join elimination until it is validated.`
        : `Until step 2 runs, the constraint is enforced for new rows but the planner will not use it to prove anything about existing ones.`,
    ],
  });
}

/* ── SQL fragments ──────────────────────────────────────────────────────── */

/**
 * A batched loop that commits per batch and pauses between them.
 *
 * Transaction control inside DO arrived in PostgreSQL 11. Before that the loop
 * has to be driven from outside the database, so the plan says so rather than
 * emitting SQL that errors.
 */
function batchedUpdateSql(table: string, assignment: string, predicate: string, pgVersion: number): string {
  if (pgVersion < 11) {
    return `-- PostgreSQL ${pgVersion} cannot COMMIT inside a DO block, so drive the loop\n-- from your application or a shell script, one statement per iteration:\n\nSET lock_timeout = '5s';\nUPDATE ${table} SET ${assignment}\nWHERE ctid IN (\n  SELECT ctid FROM ${table}\n  WHERE ${predicate}\n  LIMIT 10000\n  FOR UPDATE SKIP LOCKED\n);\n-- Repeat until it reports UPDATE 0.`;
  }

  return `SET lock_timeout = '5s';\n\nDO $$\nDECLARE\n  batch_size CONSTANT int := 10000;\n  touched int;\nBEGIN\n  LOOP\n    UPDATE ${table} SET ${assignment}\n    WHERE ctid IN (\n      SELECT ctid FROM ${table}\n      WHERE ${predicate}\n      LIMIT batch_size\n      FOR UPDATE SKIP LOCKED\n    );\n    GET DIAGNOSTICS touched = ROW_COUNT;\n    EXIT WHEN touched = 0;\n    COMMIT;\n    PERFORM pg_sleep(0.1);\n  END LOOP;\nEND $$;`;
}

function batchedDeleteSql(table: string, pgVersion: number): string {
  if (pgVersion < 11) {
    return `-- PostgreSQL ${pgVersion} cannot COMMIT inside a DO block, so drive the loop\n-- from your application or a shell script, one statement per iteration:\n\nSET lock_timeout = '5s';\nDELETE FROM ${table}\nWHERE ctid IN (\n  SELECT ctid FROM ${table}\n  WHERE <keep-this-row is false>\n  LIMIT 10000\n  FOR UPDATE SKIP LOCKED\n);\n-- Repeat until it reports DELETE 0.`;
  }

  return `SET lock_timeout = '5s';\n\nDO $$\nDECLARE\n  batch_size CONSTANT int := 10000;\n  removed int;\nBEGIN\n  LOOP\n    DELETE FROM ${table}\n    WHERE ctid IN (\n      SELECT ctid FROM ${table}\n      WHERE <keep-this-row is false>\n      LIMIT batch_size\n      FOR UPDATE SKIP LOCKED\n    );\n    GET DIAGNOSTICS removed = ROW_COUNT;\n    EXIT WHEN removed = 0;\n    COMMIT;\n    PERFORM pg_sleep(0.1);\n  END LOOP;\nEND $$;`;
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

/* ── assembly ───────────────────────────────────────────────────────────── */

function assemble(input: {
  ruleId: string;
  ruleName: string;
  line: number;
  pattern: string;
  title: string;
  summary: string;
  drafts: Draft[];
  boundaries: DeployBoundary[];
  notes: string[];
}): FixPlan {
  return {
    ruleId: input.ruleId,
    ruleName: input.ruleName,
    line: input.line,
    pattern: input.pattern,
    title: input.title,
    summary: input.summary,
    steps: input.drafts.map((draft, i) => ({ number: i + 1, ...draft })),
    boundaries: input.boundaries,
    notes: input.notes,
    alsoResolves: [],
  };
}
