export type LockLevel =
  | 'ACCESS EXCLUSIVE'
  | 'SHARE'
  | 'SHARE UPDATE EXCLUSIVE'
  | 'SHARE ROW EXCLUSIVE'
  | 'ROW EXCLUSIVE'
  | 'ACCESS SHARE';

export interface LockClassification {
  lockType: LockLevel;
  blocksReads: boolean;
  blocksWrites: boolean;
  longHeld: boolean;
}

// ALTER TABLE subtype strings from libpg-query AST
const AT_AddColumn = 'AT_AddColumn';
const AT_DropColumn = 'AT_DropColumn';
const AT_AlterColumnType = 'AT_AlterColumnType';
const AT_SetNotNull = 'AT_SetNotNull';
const AT_AddConstraint = 'AT_AddConstraint';
const AT_ValidateConstraint = 'AT_ValidateConstraint';
const AT_DropConstraint = 'AT_DropConstraint';

/**
 * Classifies the PostgreSQL lock type for a given DDL statement.
 * Returns the lock level, whether it blocks reads/writes, and
 * whether the lock is held for a long duration (table scan/rewrite).
 */
export function classifyLock(
  stmt: Record<string, unknown>,
  pgVersion: number = 17
): LockClassification {
  // CREATE INDEX
  if ('IndexStmt' in stmt) {
    const idx = stmt.IndexStmt as { concurrent?: boolean };
    if (idx.concurrent) {
      return { lockType: 'SHARE UPDATE EXCLUSIVE', blocksReads: false, blocksWrites: false, longHeld: false };
    }
    return { lockType: 'SHARE', blocksReads: false, blocksWrites: true, longHeld: true };
  }

  // ALTER TABLE
  if ('AlterTableStmt' in stmt) {
    const alter = stmt.AlterTableStmt as {
      cmds?: Array<{ AlterTableCmd: { subtype: string; def?: Record<string, unknown>; name?: string } }>;
    };

    if (!alter.cmds || alter.cmds.length === 0) {
      return defaultAccessExclusive();
    }

    // Find the most restrictive lock among all subcommands
    let worstLock: LockClassification = { lockType: 'ACCESS SHARE', blocksReads: false, blocksWrites: false, longHeld: false };

    for (const cmd of alter.cmds) {
      const sub = cmd.AlterTableCmd;
      const lock = classifyAlterSubcommand(sub.subtype, sub.def, pgVersion);
      if (lockSeverity(lock) > lockSeverity(worstLock)) {
        worstLock = lock;
      }
    }

    return worstLock;
  }

  // VACUUM
  if ('VacuumStmt' in stmt) {
    const vacuum = stmt.VacuumStmt as {
      options?: Array<{ DefElem: { defname: string } }>;
      is_vacuumcmd?: boolean;
    };
    // VACUUM FULL — options is an array of DefElem objects
    const isFull = vacuum.options?.some(opt => opt.DefElem?.defname === 'full');
    if (isFull) {
      return { lockType: 'ACCESS EXCLUSIVE', blocksReads: true, blocksWrites: true, longHeld: true };
    }
    return { lockType: 'SHARE UPDATE EXCLUSIVE', blocksReads: false, blocksWrites: false, longHeld: false };
  }

  // SET / RESET — no lock acquired
  if ('VariableSetStmt' in stmt || 'VariableShowStmt' in stmt) {
    return { lockType: 'ACCESS SHARE', blocksReads: false, blocksWrites: false, longHeld: false };
  }

  // Transaction control — no table lock
  if ('TransactionStmt' in stmt) {
    return { lockType: 'ACCESS SHARE', blocksReads: false, blocksWrites: false, longHeld: false };
  }

  // CREATE TABLE — ACCESS EXCLUSIVE on the new table, but it's new so no contention
  if ('CreateStmt' in stmt) {
    return { lockType: 'ACCESS EXCLUSIVE', blocksReads: false, blocksWrites: false, longHeld: false };
  }

  // DROP TABLE / DROP INDEX
  if ('DropStmt' in stmt) {
    const drop = stmt.DropStmt as { concurrent?: boolean };
    if (drop.concurrent) {
      return { lockType: 'SHARE UPDATE EXCLUSIVE', blocksReads: false, blocksWrites: false, longHeld: false };
    }
    return { lockType: 'ACCESS EXCLUSIVE', blocksReads: true, blocksWrites: true, longHeld: false };
  }

  // REINDEX
  if ('ReindexStmt' in stmt) {
    const reindex = stmt.ReindexStmt as { concurrent?: boolean };
    if (reindex.concurrent) {
      return { lockType: 'SHARE UPDATE EXCLUSIVE', blocksReads: false, blocksWrites: false, longHeld: false };
    }
    return { lockType: 'SHARE', blocksReads: false, blocksWrites: true, longHeld: true };
  }

  // CLUSTER
  if ('ClusterStmt' in stmt) {
    return { lockType: 'ACCESS EXCLUSIVE', blocksReads: true, blocksWrites: true, longHeld: true };
  }

  return defaultAccessExclusive();
}

function classifyAlterSubcommand(
  subtype: string,
  def: Record<string, unknown> | undefined,
  pgVersion: number
): LockClassification {
  switch (subtype) {
    case AT_AddColumn: {
      const hasDefault = def && hasColumnDefault(def);
      const isVolatile = hasDefault ? isVolatileDefault(def!) : false;
      const longHeld = hasDefault ? (pgVersion < 11 || isVolatile) : false;
      return {
        lockType: 'ACCESS EXCLUSIVE',
        blocksReads: true,
        blocksWrites: true,
        longHeld,
      };
    }

    case AT_DropColumn:
      return { lockType: 'ACCESS EXCLUSIVE', blocksReads: true, blocksWrites: true, longHeld: false };

    case AT_AlterColumnType:
      return { lockType: 'ACCESS EXCLUSIVE', blocksReads: true, blocksWrites: true, longHeld: true };

    case AT_SetNotNull:
      return { lockType: 'ACCESS EXCLUSIVE', blocksReads: true, blocksWrites: true, longHeld: true };

    case AT_AddConstraint: {
      const isNotValid = def && isConstraintNotValid(def);
      if (isNotValid) {
        return { lockType: 'ACCESS EXCLUSIVE', blocksReads: true, blocksWrites: true, longHeld: false };
      }
      return { lockType: 'ACCESS EXCLUSIVE', blocksReads: true, blocksWrites: true, longHeld: true };
    }

    case AT_ValidateConstraint:
      return { lockType: 'SHARE UPDATE EXCLUSIVE', blocksReads: false, blocksWrites: false, longHeld: false };

    case AT_DropConstraint:
      return { lockType: 'ACCESS EXCLUSIVE', blocksReads: true, blocksWrites: true, longHeld: false };

    default:
      return defaultAccessExclusive();
  }
}

function hasColumnDefault(def: Record<string, unknown>): boolean {
  const colDef = def.ColumnDef as { constraints?: Array<{ Constraint?: { contype: string } }> } | undefined;
  if (!colDef?.constraints) return false;
  return colDef.constraints.some(c => c.Constraint?.contype === 'CONSTR_DEFAULT');
}

function isVolatileDefault(def: Record<string, unknown>): boolean {
  // Heuristic: check if the default expression contains a function call
  // that is known to be volatile (now(), random(), nextval(), etc.)
  const json = JSON.stringify(def).toLowerCase();
  return /\b(now|random|nextval|clock_timestamp|statement_timestamp|timeofday|txid_current|gen_random_uuid|uuid_generate)\b/.test(json);
}

function isConstraintNotValid(def: Record<string, unknown>): boolean {
  const constraint = def.Constraint as { skip_validation?: boolean } | undefined;
  return constraint?.skip_validation === true;
}

function defaultAccessExclusive(): LockClassification {
  return { lockType: 'ACCESS EXCLUSIVE', blocksReads: true, blocksWrites: true, longHeld: false };
}

function lockSeverity(lock: LockClassification): number {
  const levels: Record<LockLevel, number> = {
    'ACCESS SHARE': 0,
    'ROW EXCLUSIVE': 1,
    'SHARE UPDATE EXCLUSIVE': 2,
    'SHARE': 3,
    'SHARE ROW EXCLUSIVE': 4,
    'ACCESS EXCLUSIVE': 5,
  };
  const base = levels[lock.lockType];
  return lock.longHeld ? base + 10 : base;
}
