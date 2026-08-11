/**
 * Shared choreography model for multi-step schema changes.
 *
 * A choreography is one safe way to make a change that cannot be made in a
 * single statement. It is the single source of truth behind two commands that
 * ask for the same thing from different directions:
 *
 * - `migrationpilot template <op> --table t --column c` — you name the change.
 * - `migrationpilot plan-fix <file>` — a violation names it for you.
 *
 * `template` groups the steps into its three phases (expand / migrate /
 * contract); `plan-fix` numbers them and draws the deploy boundaries. Neither
 * writes SQL of its own.
 */

export type StepDuration = 'instant' | 'seconds' | 'minutes' | 'hours';

/** Which of `template`'s three phases a step belongs to. */
export type TemplatePhase = 'expand' | 'migrate' | 'contract';

export interface ChoreographyStep {
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
  phase: TemplatePhase;
  /** 1-based deploy this step belongs to */
  deploy: number;
}

export interface DeployBoundary {
  /** The boundary sits immediately after this step index (1-based) */
  afterStep: number;
  /** What has to ship before the following steps may run */
  reason: string;
}

export interface Choreography {
  /** Short identifier, e.g. `check-then-not-null` */
  pattern: string;
  /** Title for `template` output */
  name: string;
  /** Prose description for `template` output */
  description: string;
  /** One-paragraph summary for `plan-fix` output */
  summary: string;
  steps: ChoreographyStep[];
  boundaries: DeployBoundary[];
  notes: string[];
}

export interface ChoreographyOpts {
  table: string;
  column?: string;
  newName?: string;
  newType?: string;
  /** Type of the column being renamed, when it can be determined */
  columnType?: string;
  pgVersion?: number;
  /**
   * How a column type change ends.
   * `swap` renames the new column into the old one's place, so application
   * code never changes. `handover` moves the application across in its own
   * releases and drops the old column afterwards.
   */
  strategy?: 'swap' | 'handover';
}

/* ── shared SQL fragments ───────────────────────────────────────────────── */

const GUARD = "SET lock_timeout = '5s';";

/**
 * A batched loop that commits per batch and pauses between them.
 *
 * The `COMMIT` is the point. Without it the loop is one transaction: every row
 * lock is held to the end, the WAL never checkpoints, and the `pg_sleep` makes
 * it worse by extending the transaction. Transaction control inside `DO`
 * arrived in PostgreSQL 11, so before that the plan says to drive the loop from
 * outside rather than emitting SQL that errors.
 */
export function batchedUpdateSql(
  table: string,
  assignment: string,
  predicate: string,
  pgVersion: number,
): string {
  if (pgVersion < 11) {
    return [
      `-- PostgreSQL ${pgVersion} cannot COMMIT inside a DO block, so drive the loop`,
      `-- from your application or a shell script, one statement per iteration:`,
      ``,
      GUARD,
      `UPDATE ${table} SET ${assignment}`,
      `WHERE ctid IN (`,
      `  SELECT ctid FROM ${table}`,
      `  WHERE ${predicate}`,
      `  LIMIT 10000`,
      `  FOR UPDATE SKIP LOCKED`,
      `);`,
      `-- Repeat until it reports UPDATE 0.`,
    ].join('\n');
  }

  return [
    `-- Must not run inside a transaction block — the COMMIT below needs to be real.`,
    GUARD,
    ``,
    `DO $$`,
    `DECLARE`,
    `  batch_size CONSTANT int := 10000;`,
    `  touched int;`,
    `BEGIN`,
    `  LOOP`,
    `    UPDATE ${table} SET ${assignment}`,
    `    WHERE ctid IN (`,
    `      SELECT ctid FROM ${table}`,
    `      WHERE ${predicate}`,
    `      LIMIT batch_size`,
    `      FOR UPDATE SKIP LOCKED`,
    `    );`,
    `    GET DIAGNOSTICS touched = ROW_COUNT;`,
    `    EXIT WHEN touched = 0;`,
    `    COMMIT;`,
    `    PERFORM pg_sleep(0.1);`,
    `  END LOOP;`,
    `END $$;`,
  ].join('\n');
}

export function batchedDeleteSql(table: string, pgVersion: number): string {
  if (pgVersion < 11) {
    return [
      `-- PostgreSQL ${pgVersion} cannot COMMIT inside a DO block, so drive the loop`,
      `-- from your application or a shell script, one statement per iteration:`,
      ``,
      GUARD,
      `DELETE FROM ${table}`,
      `WHERE ctid IN (`,
      `  SELECT ctid FROM ${table}`,
      `  WHERE <keep-this-row is false>`,
      `  LIMIT 10000`,
      `  FOR UPDATE SKIP LOCKED`,
      `);`,
      `-- Repeat until it reports DELETE 0.`,
    ].join('\n');
  }

  return [
    `-- Must not run inside a transaction block — the COMMIT below needs to be real.`,
    GUARD,
    ``,
    `DO $$`,
    `DECLARE`,
    `  batch_size CONSTANT int := 10000;`,
    `  removed int;`,
    `BEGIN`,
    `  LOOP`,
    `    DELETE FROM ${table}`,
    `    WHERE ctid IN (`,
    `      SELECT ctid FROM ${table}`,
    `      WHERE <keep-this-row is false>`,
    `      LIMIT batch_size`,
    `      FOR UPDATE SKIP LOCKED`,
    `    );`,
    `    GET DIAGNOSTICS removed = ROW_COUNT;`,
    `    EXIT WHEN removed = 0;`,
    `    COMMIT;`,
    `    PERFORM pg_sleep(0.1);`,
    `  END LOOP;`,
    `END $$;`,
  ].join('\n');
}

/** The lock notes reused across choreographies, so they stay consistent. */
const LOCKS = {
  briefCatalog: {
    lock: 'ACCESS EXCLUSIVE',
    lockNote: 'Held for milliseconds — catalog only.',
    duration: 'instant' as StepDuration,
  },
  addColumn: {
    lock: 'ACCESS EXCLUSIVE',
    lockNote: 'Held for milliseconds — a nullable column with no default is catalog-only.',
    duration: 'instant' as StepDuration,
  },
  trigger: {
    lock: 'ACCESS EXCLUSIVE',
    lockNote: 'Held for milliseconds, but it waits for in-flight statements on the table to finish.',
    duration: 'instant' as StepDuration,
  },
  validate: {
    lock: 'SHARE UPDATE EXCLUSIVE',
    lockNote: 'Reads and writes continue; only other schema changes wait.',
    duration: 'minutes' as StepDuration,
  },
  backfill: {
    lock: 'ROW EXCLUSIVE',
    lockNote: 'Per-batch row locks, released at each COMMIT; readers are never blocked.',
    duration: 'hours' as StepDuration,
  },
  read: {
    lock: 'ACCESS SHARE',
    lockNote: 'A read — blocks nothing.',
    duration: 'seconds' as StepDuration,
  },
  dropColumn: {
    lock: 'ACCESS EXCLUSIVE',
    lockNote: 'Held for milliseconds — the data is reclaimed lazily by VACUUM.',
    duration: 'instant' as StepDuration,
  },
} as const;

/* ── choreographies ─────────────────────────────────────────────────────── */

/**
 * Make a column NOT NULL without the full-table scan.
 *
 * PostgreSQL 18 stores NOT NULL in `pg_constraint`, so the constraint can be
 * added NOT VALID and validated afterwards under a lock that allows reads and
 * writes. Before that, a CHECK constraint stands in as the proof PostgreSQL
 * needs, so the final SET NOT NULL is instant. On PG < 12 that shortcut does
 * not exist and the scan is unavoidable.
 */
export function addNotNullChoreography(opts: ChoreographyOpts): Choreography {
  const { table, column = 'target_column' } = opts;
  const pgVersion = opts.pgVersion ?? 17;
  const constraint = `${table}_${column}_not_null`;
  const name = `Add NOT NULL constraint to ${table}.${column}`;

  if (pgVersion >= 18) {
    return {
      pattern: 'pg18-not-null-not-valid',
      name,
      description: [
        `Safely adds a NOT NULL constraint to "${column}" on table "${table}".`,
        'On PostgreSQL 18+ the constraint itself can be added NOT VALID, so no CHECK workaround is needed.',
        'Phase 1 adds it instantly; phase 2 validates the existing rows under a lock that allows reads and writes.',
      ].join(' '),
      summary: 'PostgreSQL 18 adds the constraint instantly and validates it under a lock that allows reads and writes.',
      steps: [
        {
          title: 'Add the NOT NULL constraint NOT VALID',
          sql: `${GUARD}\nALTER TABLE ${table}\n  ADD CONSTRAINT ${constraint} NOT NULL ${column} NOT VALID;`,
          lock: 'ACCESS EXCLUSIVE',
          lockNote: 'Held for milliseconds — no rows are read, only the catalog is written.',
          duration: 'instant',
          transactional: true,
          phase: 'expand',
          deploy: 1,
        },
        {
          title: 'Validate the constraint',
          sql: `${GUARD}\nALTER TABLE ${table} VALIDATE CONSTRAINT ${constraint};`,
          ...LOCKS.validate,
          transactional: true,
          phase: 'migrate',
          deploy: 1,
        },
      ],
      boundaries: [],
      notes: [
        `Rows inserted from step 1 onward are already checked — the constraint is enforced immediately, it is only the existing rows that step 2 confirms.`,
        `If step 2 fails, some existing rows are NULL. Backfill them, then re-run VALIDATE CONSTRAINT.`,
        `Drop any CHECK (${column} IS NOT NULL) left over from the pre-18 pattern once this constraint is valid.`,
      ],
    };
  }

  if (pgVersion < 12) {
    return {
      pattern: 'not-null-scan-guarded',
      name,
      description: [
        `Adds a NOT NULL constraint to "${column}" on table "${table}".`,
        `PostgreSQL ${pgVersion} cannot skip the validating scan, so this plans a short guarded window instead.`,
      ].join(' '),
      summary: `PostgreSQL ${pgVersion} cannot skip the scan — SET NOT NULL always reads every row under ACCESS EXCLUSIVE. Plan for a short, guarded window instead.`,
      steps: [
        {
          title: 'Backfill the remaining NULLs in batches',
          sql: batchedUpdateSql(table, `${column} = <value>`, `${column} IS NULL`, pgVersion),
          ...LOCKS.backfill,
          lockNote: 'Per-batch row locks only; readers are never blocked.',
          transactional: false,
          phase: 'migrate',
          deploy: 1,
        },
        {
          title: 'Take the scan behind a short lock_timeout',
          sql: `${GUARD}\nALTER TABLE ${table} ALTER COLUMN ${column} SET NOT NULL;\nRESET lock_timeout;`,
          lock: 'ACCESS EXCLUSIVE',
          lockNote: 'Blocks all reads and writes for the length of a full table scan.',
          duration: 'minutes',
          transactional: true,
          phase: 'contract',
          deploy: 1,
        },
      ],
      boundaries: [],
      notes: [
        `Upgrading to PostgreSQL 12 or later turns the final step into an instant catalog update.`,
        `Retry the final step rather than raising lock_timeout — a long wait queues every query behind it.`,
      ],
    };
  }

  return {
    pattern: 'check-then-not-null',
    name,
    description: [
      `Safely adds a NOT NULL constraint to "${column}" on table "${table}".`,
      'Phase 1 adds a CHECK constraint with NOT VALID to avoid a full table scan lock.',
      'Phase 2 validates the constraint (requires SHARE UPDATE EXCLUSIVE, not ACCESS EXCLUSIVE).',
      'Phase 3 sets NOT NULL using the validated constraint (instant on PG 12+) and cleans up.',
    ].join(' '),
    summary: 'A validated CHECK constraint is proof enough for PostgreSQL 12+, so the final SET NOT NULL never scans the table.',
    steps: [
      {
        title: 'Add the CHECK constraint NOT VALID',
        sql: `${GUARD}\nALTER TABLE ${table}\n  ADD CONSTRAINT ${constraint}\n  CHECK (${column} IS NOT NULL)\n  NOT VALID;`,
        lock: 'ACCESS EXCLUSIVE',
        lockNote: 'Held for milliseconds — NOT VALID skips the scan of existing rows.',
        duration: 'instant',
        transactional: true,
        phase: 'expand',
        deploy: 1,
      },
      {
        title: 'Validate the constraint',
        sql: `${GUARD}\nALTER TABLE ${table}\n  VALIDATE CONSTRAINT ${constraint};`,
        ...LOCKS.validate,
        transactional: true,
        phase: 'migrate',
        deploy: 1,
      },
      {
        title: 'Set NOT NULL — instant, backed by the validated CHECK',
        sql: `${GUARD}\nALTER TABLE ${table}\n  ALTER COLUMN ${column} SET NOT NULL;`,
        lock: 'ACCESS EXCLUSIVE',
        lockNote: 'Held for milliseconds — PostgreSQL 12+ trusts the validated CHECK instead of rescanning.',
        duration: 'instant',
        transactional: true,
        phase: 'contract',
        deploy: 1,
      },
      {
        title: 'Drop the now-redundant CHECK constraint',
        sql: `${GUARD}\nALTER TABLE ${table}\n  DROP CONSTRAINT ${constraint};`,
        ...LOCKS.briefCatalog,
        transactional: true,
        phase: 'contract',
        deploy: 1,
      },
    ],
    boundaries: [],
    notes: [
      `All four steps are database-only — no application release sits between them.`,
      `If step 2 fails, existing rows are NULL. Backfill them, then re-run VALIDATE CONSTRAINT.`,
      `Steps 3 and 4 must not run before step 2 succeeds, or step 3 falls back to a full scan.`,
    ],
  };
}

/**
 * Change a column's type without rewriting the table under an exclusive lock.
 *
 * Two endings, both legitimate. `swap` renames the new column into the old
 * one's place, so application code never changes and there is no deploy
 * boundary — at the cost of a moment where the table has neither column under
 * the original name. `handover` moves the application across in its own
 * releases, which is slower but never leaves the schema mid-swap.
 */
export function changeTypeChoreography(opts: ChoreographyOpts): Choreography {
  const { table, column = 'target_column', newType = 'bigint' } = opts;
  const pgVersion = opts.pgVersion ?? 17;
  const strategy = opts.strategy ?? 'swap';
  const shadow = `${column}_new`;
  const trigger = `trg_sync_${column}_type`;
  const fn = `${table}_sync_${column}_type`;

  const steps: ChoreographyStep[] = [
    {
      title: `Add ${shadow} with the new type`,
      sql: `${GUARD}\nALTER TABLE ${table} ADD COLUMN ${shadow} ${newType};`,
      ...LOCKS.addColumn,
      transactional: true,
      phase: 'expand',
      deploy: 1,
    },
    {
      title: 'Keep both columns in sync while the backfill runs',
      sql: [
        `CREATE OR REPLACE FUNCTION ${fn}()`,
        `RETURNS TRIGGER AS $$`,
        `BEGIN`,
        `  NEW.${shadow} := NEW.${column}::${newType};`,
        `  RETURN NEW;`,
        `END;`,
        `$$ LANGUAGE plpgsql;`,
        ``,
        GUARD,
        `CREATE TRIGGER ${trigger}`,
        `  BEFORE INSERT OR UPDATE ON ${table}`,
        `  FOR EACH ROW`,
        `  EXECUTE FUNCTION ${fn}();`,
      ].join('\n'),
      ...LOCKS.trigger,
      transactional: true,
      phase: 'expand',
      deploy: 1,
    },
    {
      title: 'Backfill the existing rows in batches',
      sql: batchedUpdateSql(
        table,
        `${shadow} = ${column}::${newType}`,
        `${shadow} IS NULL AND ${column} IS NOT NULL`,
        pgVersion,
      ),
      ...LOCKS.backfill,
      lockNote: 'Per-batch row locks only; readers are never blocked.',
      transactional: false,
      phase: 'migrate',
      deploy: 1,
    },
    {
      title: 'Confirm the backfill is complete',
      sql: `-- Must return 0 before you go any further.\nSELECT count(*) FROM ${table}\nWHERE ${shadow} IS NULL AND ${column} IS NOT NULL;`,
      ...LOCKS.read,
      transactional: true,
      phase: 'migrate',
      deploy: 1,
    },
  ];

  if (strategy === 'swap') {
    steps.push(
      {
        title: 'Drop the sync trigger',
        sql: `${GUARD}\nDROP TRIGGER IF EXISTS ${trigger} ON ${table};\nDROP FUNCTION IF EXISTS ${fn}();`,
        ...LOCKS.briefCatalog,
        transactional: true,
        phase: 'contract',
        deploy: 2,
      },
      {
        title: `Swap ${shadow} into ${column}'s place`,
        sql: [
          `-- Run both statements in one transaction so no query ever sees`,
          `-- the table without its ${column} column.`,
          `BEGIN;`,
          GUARD,
          `ALTER TABLE ${table} DROP COLUMN ${column};`,
          `ALTER TABLE ${table} RENAME COLUMN ${shadow} TO ${column};`,
          `COMMIT;`,
        ].join('\n'),
        ...LOCKS.dropColumn,
        transactional: true,
        phase: 'contract',
        deploy: 2,
      },
    );

    return {
      pattern: 'expand-contract-column-type',
      name: `Change type of ${table}.${column} to ${newType}`,
      description: [
        `Safely changes the type of "${column}" from its current type to "${newType}" on table "${table}".`,
        'Phase 1 adds a new column with the target type and a sync trigger.',
        'Phase 2 backfills the new column by casting existing values in batches.',
        'Phase 3 swaps the columns and drops the old one.',
      ].join(' '),
      summary: `A second column carries the new type while a trigger and a batched backfill bring it level with the old one, then takes its name. Application code never changes.`,
      steps,
      boundaries: [],
      notes: [
        `The swap keeps the column name, so no application release sits between the steps.`,
        `Copy any index, default, or constraint from ${column} onto ${shadow} before the swap; they do not follow the data.`,
        `The swap step drops a column and renames another in one transaction. Both take ACCESS EXCLUSIVE, so it waits for in-flight statements — keep the lock_timeout short and retry.`,
        `If you would rather not hold both changes in one transaction, use the handover strategy instead: the application moves to ${shadow} across two releases and ${column} is dropped afterwards.`,
      ],
    };
  }

  steps.push(
    {
      title: 'Drop the sync trigger',
      sql: `${GUARD}\nDROP TRIGGER IF EXISTS ${trigger} ON ${table};\nDROP FUNCTION IF EXISTS ${fn}();`,
      ...LOCKS.briefCatalog,
      transactional: true,
      phase: 'contract',
      deploy: 2,
    },
    {
      title: `Drop the old ${column} column`,
      sql: `${GUARD}\nALTER TABLE ${table} DROP COLUMN ${column};`,
      ...LOCKS.dropColumn,
      transactional: true,
      phase: 'contract',
      deploy: 3,
    },
  );

  return {
    pattern: 'expand-contract-column-type',
    name: `Change type of ${table}.${column} to ${newType}`,
    description: [
      `Safely changes the type of "${column}" to "${newType}" on table "${table}" by handing over to a new column.`,
      'Phase 1 adds the new column and a sync trigger; phase 2 backfills in batches;',
      'phase 3 drops the trigger and then the old column, once the application has moved across.',
    ].join(' '),
    summary: `A second column carries the new type while a trigger and a batched backfill bring it level with the old one. The application hands over across two releases, and only then does the old column go.`,
    steps,
    // The trigger writes shadow from column, so it must outlive every release
    // that still writes column, and be gone before any release stops.
    boundaries: [
      {
        afterStep: 4,
        reason: `Ship the application release that reads ${shadow} and writes both ${column} and ${shadow}. The trigger keeps overwriting ${shadow} from ${column} until the next step, so both values have to agree.`,
      },
      {
        afterStep: 5,
        reason: `Ship the release that writes only ${shadow}, and wait for every instance to roll. Doing this before the trigger is dropped would let it overwrite ${shadow} with a stale ${column}.`,
      },
    ],
    notes: [
      `Steps up to the first boundary are additive — rolling back means dropping ${shadow}, and nothing that is live depends on it yet.`,
      `If you would rather not touch application code, use the swap strategy: rename ${shadow} into ${column}'s place instead of dropping. That trades both deploy boundaries for one transaction holding two ACCESS EXCLUSIVE changes.`,
      `Copy any index, default, or constraint from ${column} onto ${shadow} before the first boundary; they do not follow the data.`,
    ],
  };
}

/**
 * Rename a column without breaking the running application.
 *
 * Two boundaries, because there is no instant at which every instance can
 * switch names at once: one release starts writing both, the next stops
 * reading the old one. The mirroring trigger has to be dropped between them.
 */
export function renameColumnChoreography(opts: ChoreographyOpts): Choreography {
  const { table, column = 'old_column', newName = 'new_column' } = opts;
  const pgVersion = opts.pgVersion ?? 17;
  // The template CLI cannot know the source column's type; plan-fix passes it
  // through when the migration file states it. A placeholder is better than a
  // wrong guess — the old template always emitted TEXT.
  const type = opts.columnType ?? `<same type as ${column}>`;
  const trigger = `trg_sync_${column}_to_${newName}`;
  const fn = `${table}_sync_${column}_to_${newName}`;

  return {
    pattern: 'expand-contract-rename',
    name: `Rename column ${table}.${column} to ${newName}`,
    description: [
      `Safely renames "${column}" to "${newName}" on table "${table}" without downtime.`,
      'Phase 1 adds the new column and a trigger to keep both in sync.',
      'Phase 2 backfills existing rows in batches.',
      'Phase 3 drops the old column and trigger once all application code uses the new name.',
    ].join(' '),
    summary: `RENAME COLUMN is instant in the database and immediate for every query already written against ${column}. Adding ${newName} alongside lets the application move over one release at a time.`,
    steps: [
      {
        title: `Add ${newName} with the same type as ${column}`,
        sql: `-- The type below must match ${table}.${column} exactly; nothing checks it for you.\n${GUARD}\nALTER TABLE ${table} ADD COLUMN ${newName} ${type};`,
        ...LOCKS.addColumn,
        transactional: true,
        phase: 'expand',
        deploy: 1,
      },
      {
        title: 'Mirror writes from the old column to the new one',
        sql: [
          `CREATE OR REPLACE FUNCTION ${fn}()`,
          `RETURNS TRIGGER AS $$`,
          `BEGIN`,
          `  NEW.${newName} := NEW.${column};`,
          `  RETURN NEW;`,
          `END;`,
          `$$ LANGUAGE plpgsql;`,
          ``,
          GUARD,
          `CREATE TRIGGER ${trigger}`,
          `  BEFORE INSERT OR UPDATE ON ${table}`,
          `  FOR EACH ROW`,
          `  EXECUTE FUNCTION ${fn}();`,
        ].join('\n'),
        ...LOCKS.trigger,
        transactional: true,
        phase: 'expand',
        deploy: 1,
      },
      {
        title: 'Backfill the existing rows in batches',
        sql: batchedUpdateSql(
          table,
          `${newName} = ${column}`,
          `${newName} IS NULL AND ${column} IS NOT NULL`,
          pgVersion,
        ),
        ...LOCKS.backfill,
        lockNote: 'Per-batch row locks only; readers are never blocked.',
        transactional: false,
        phase: 'migrate',
        deploy: 1,
      },
      {
        title: 'Drop the mirroring trigger',
        sql: `${GUARD}\nDROP TRIGGER IF EXISTS ${trigger} ON ${table};\nDROP FUNCTION IF EXISTS ${fn}();`,
        ...LOCKS.briefCatalog,
        transactional: true,
        phase: 'contract',
        deploy: 2,
      },
      {
        title: `Drop ${column}`,
        sql: `${GUARD}\nALTER TABLE ${table} DROP COLUMN IF EXISTS ${column};`,
        ...LOCKS.dropColumn,
        transactional: true,
        phase: 'contract',
        deploy: 3,
      },
    ],
    boundaries: [
      {
        afterStep: 3,
        reason: `Ship the application release that reads ${newName} and writes both columns. The trigger keeps overwriting ${newName} from ${column} until the next step, so both values have to agree.`,
      },
      {
        afterStep: 4,
        reason: `Ship the release that stops touching ${column} entirely, and wait for every instance to roll. Doing this before the trigger is dropped would let it overwrite ${newName} with a NULL ${column}. Views, functions, and triggers elsewhere that name ${column} must move too.`,
      },
    ],
    notes: [
      `Nothing before the first boundary is visible to the application, so it can be rolled back by dropping ${newName}.`,
      `Check for other references first: SELECT * FROM pg_depend and \\d+ on any view over ${table}.`,
      `If ${column} is NOT NULL, add the same constraint to ${newName} after the backfill — see MP002 for how to do that without a scan.`,
    ],
  };
}

/** Turn a whole-table UPDATE into a loop that commits and pauses. */
export function batchedUpdateChoreography(
  opts: ChoreographyOpts & { assignment: string; predicate: string },
): Choreography {
  const { table, assignment, predicate } = opts;
  const pgVersion = opts.pgVersion ?? 17;

  return {
    pattern: 'batched-backfill',
    name: `Backfill ${table} in batches`,
    description: `Rewrites a whole-table UPDATE on "${table}" as a loop that commits each batch and pauses between them.`,
    summary: 'One UPDATE over the whole table holds its locks and its WAL until the last row. Batching commits as it goes, so replicas keep up and other queries get a turn.',
    steps: [
      {
        title: 'Run the backfill in committed batches',
        sql: batchedUpdateSql(table, assignment, predicate, pgVersion),
        ...LOCKS.backfill,
        transactional: false,
        phase: 'migrate',
        deploy: 1,
      },
      {
        title: 'Confirm no rows are left',
        sql: `-- Must return 0.\nSELECT count(*) FROM ${table} WHERE ${predicate};`,
        ...LOCKS.read,
        transactional: true,
        phase: 'migrate',
        deploy: 1,
      },
    ],
    boundaries: [],
    notes: [
      `Replace any placeholder in the predicate with one that is false once a row is done — the loop exits when a pass updates nothing.`,
      `The loop needs an index supporting the predicate, or every batch degrades into a sequential scan.`,
      `Watch replication lag while it runs and raise the sleep if replicas fall behind.`,
    ],
  };
}

/** Turn a whole-table DELETE into a loop, or point at TRUNCATE. */
export function batchedDeleteChoreography(opts: ChoreographyOpts): Choreography {
  const { table } = opts;
  const pgVersion = opts.pgVersion ?? 17;

  return {
    pattern: 'batched-backfill',
    name: `Delete from ${table} in batches`,
    description: `Rewrites a WHERE-less DELETE on "${table}" as a loop that commits each batch, or points at TRUNCATE when the whole table is going.`,
    summary: 'A WHERE-less DELETE writes a WAL record per row and holds its locks to the end. If the whole table really is going, TRUNCATE does it in one catalog operation; otherwise delete in committed batches.',
    steps: [
      {
        title: 'Delete in committed batches',
        sql: batchedDeleteSql(table, pgVersion),
        ...LOCKS.backfill,
        transactional: false,
        phase: 'migrate',
        deploy: 1,
      },
      {
        title: 'Reclaim the space',
        sql: `VACUUM (ANALYZE) ${table};`,
        lock: 'SHARE UPDATE EXCLUSIVE',
        lockNote: 'Reads and writes continue; only other schema changes wait.',
        duration: 'minutes',
        transactional: false,
        phase: 'contract',
        deploy: 1,
      },
    ],
    boundaries: [],
    notes: [
      `If every row is going and no other transaction needs to read the table meanwhile, TRUNCATE ${table}; is one statement and almost no WAL — but it takes ACCESS EXCLUSIVE and cannot be undone row by row.`,
      `Add a WHERE clause to the batch to keep the rows you meant to keep; the loop as written removes everything.`,
      `Batched deletes leave dead tuples behind, which is why the last step exists.`,
    ],
  };
}

/** Build a unique index concurrently, then adopt it as the constraint. */
export function uniqueConstraintChoreography(
  opts: ChoreographyOpts & { constraint: string; columns: string[] },
): Choreography {
  const { table, constraint, columns } = opts;
  const index = `${constraint}_idx`;
  const columnList = columns.length > 0 ? columns.join(', ') : '<columns>';

  return {
    pattern: 'index-then-constraint',
    name: `Add unique constraint ${constraint} to ${table}`,
    description: `Adds the "${constraint}" UNIQUE constraint to "${table}" by building its index concurrently first, so writes are never blocked by the scan.`,
    summary: 'ADD CONSTRAINT UNIQUE builds its index while holding ACCESS EXCLUSIVE. Building the index concurrently first and then adopting it leaves only a catalog update to lock.',
    steps: [
      {
        title: 'Build the unique index concurrently',
        sql: `${GUARD}\nCREATE UNIQUE INDEX CONCURRENTLY ${index}\n  ON ${table} (${columnList});`,
        lock: 'SHARE UPDATE EXCLUSIVE',
        lockNote: 'Reads and writes continue throughout the build.',
        duration: 'minutes',
        transactional: false,
        phase: 'expand',
        deploy: 1,
      },
      {
        title: 'Adopt the index as the constraint',
        sql: `${GUARD}\nALTER TABLE ${table}\n  ADD CONSTRAINT ${constraint} UNIQUE USING INDEX ${index};`,
        lock: 'ACCESS EXCLUSIVE',
        lockNote: 'Held for milliseconds — the index already exists, so nothing is scanned.',
        duration: 'instant',
        transactional: true,
        phase: 'contract',
        deploy: 1,
      },
    ],
    boundaries: [],
    notes: [
      `The first step cannot run inside a transaction block. If your migration tool wraps files in BEGIN/COMMIT, put it in its own file or disable the wrapper for it.`,
      `A failed CONCURRENTLY build leaves an invalid index behind. Check with \\d ${table}, DROP INDEX CONCURRENTLY ${index}, and start over.`,
      `Adopting the index renames it to ${constraint}. That is PostgreSQL's doing, not a mistake.`,
    ],
  };
}

/** Add a constraint NOT VALID, then validate the existing rows separately. */
export function validateConstraintChoreography(
  opts: ChoreographyOpts & { constraint: string; kind: 'foreign key' | 'check' },
): Choreography {
  const { table, constraint, kind } = opts;
  const label = kind === 'foreign key' ? 'FOREIGN KEY (...) REFERENCES ...' : 'CHECK (...)';

  return {
    pattern: 'not-valid-then-validate',
    name: `Add ${constraint} to ${table} without a blocking scan`,
    description: `Adds the "${constraint}" constraint to "${table}" in two steps so the existing rows are checked under a lock that allows reads and writes.`,
    summary: `NOT VALID splits the work in two: the constraint starts enforcing new rows immediately under a lock held for milliseconds, and the existing rows are checked afterwards under a lock that allows reads and writes.`,
    steps: [
      {
        title: 'Add the constraint NOT VALID',
        sql: `${GUARD}\nALTER TABLE ${table}\n  ADD CONSTRAINT ${constraint} ${label} NOT VALID;`,
        lock: 'ACCESS EXCLUSIVE',
        lockNote: 'Held for milliseconds — existing rows are not read.',
        duration: 'instant',
        transactional: true,
        phase: 'expand',
        deploy: 1,
      },
      {
        title: 'Validate the existing rows',
        sql: `${GUARD}\nALTER TABLE ${table} VALIDATE CONSTRAINT ${constraint};`,
        ...LOCKS.validate,
        transactional: true,
        phase: 'migrate',
        deploy: 1,
      },
    ],
    boundaries: [],
    notes: [
      `\`migrationpilot analyze --fix\` writes the first step for you. The second is the part it cannot add, because a constraint that fails validation needs the bad rows dealt with first.`,
      kind === 'foreign key'
        ? `A NOT VALID foreign key still locks the referenced table briefly, and the planner ignores it for join elimination until it is validated.`
        : `Until the second step runs, the constraint is enforced for new rows but the planner will not use it to prove anything about existing ones.`,
    ],
  };
}

/* ── rendering ──────────────────────────────────────────────────────────── */

/** Join the steps of one phase into the string `template` prints. */
export function renderPhase(choreography: Choreography, phase: TemplatePhase): string {
  const steps = choreography.steps.filter(s => s.phase === phase);
  if (steps.length === 0) return `-- Nothing to do in the ${phase} phase for this operation.`;

  const header = PHASE_HEADERS[phase];
  const blocks = steps.map(step => `-- ${step.title}\n-- Lock: ${step.lock} — ${step.lockNote}\n${step.sql}`);
  return [...header, '', blocks.join('\n\n')].join('\n');
}

const PHASE_HEADERS: Record<TemplatePhase, string[]> = {
  expand: [
    '-- Phase 1: Expand — add new structures alongside the old ones.',
    '-- Deploy this BEFORE updating application code.',
  ],
  migrate: [
    '-- Phase 2: Migrate — move the data across.',
    '-- Run this after deploying the expand phase.',
  ],
  contract: [
    '-- Phase 3: Contract — remove what is no longer needed.',
    '-- Deploy this AFTER application code has moved across.',
  ],
};
