/**
 * Mutation operators for the Guardrail Mutation Tester (experimental).
 *
 * Each operator takes ONE statement from a known-good migration and rewrites it
 * into a dangerous near-neighbour — the version a tired engineer might actually
 * write. The runner then feeds every mutant back through the normal analysis
 * pipeline using the caller's resolved config, so the question answered is not
 * "is this SQL safe?" but "would MY guardrail have stopped this?".
 *
 * Applicability is always AST-guided: an operator only fires when the parsed
 * node proves the pattern is there. The rewrite itself is either:
 *
 * - 'ast'    — the replacement statement is rebuilt from node fields
 * - 'string' — a narrow, anchored text edit on the statement (used where an AST
 *              round-trip would mean re-printing arbitrary expressions, e.g.
 *              stripping the CONCURRENTLY keyword or a trailing NOT VALID).
 *              Every string edit is anchored and verified: if the pattern does
 *              not match exactly once, the operator declines to mutate.
 *
 * `targetRules` lists the rules expected to catch the mutant. An empty list is
 * deliberate: it marks a dangerous change no built-in rule covers, which the
 * runner reports separately from config holes because no config can close it.
 */

import { classifyLock } from '../locks/classify.js';

/** A single statement of the input migration, plus the context an operator needs. */
export interface MutationTarget {
  /** Parsed statement node (libpg-query AST). */
  stmt: Record<string, unknown>;
  /** Statement SQL, leading comments and the trailing semicolon removed. */
  sql: string;
  /** Index of this statement within the migration. */
  index: number;
  /** Every statement in the migration, in order. */
  all: Array<{ stmt: Record<string, unknown>; sql: string }>;
  /** Target PostgreSQL version. */
  pgVersion: number;
}

/** The edit an operator wants applied to the migration. */
export interface MutationEdit {
  /** Replacement text for the target statement. An empty string deletes it. */
  sql: string;
  /**
   * Extra statement indices to delete, for operators that collapse a
   * multi-statement safe pattern (e.g. CHECK + VALIDATE + SET NOT NULL).
   */
  removes?: number[];
}

export interface MutationOperator {
  id: string;
  name: string;
  description: string;
  /** Rules expected to catch this mutant. Empty = no built-in rule covers it. */
  targetRules: string[];
  /** One-line production consequence if the mutant shipped. */
  consequence: string;
  /** How the rewrite is produced. See module docs. */
  transform: 'ast' | 'string';
  isApplicable(target: MutationTarget): boolean;
  /** Returns the edit, or null when the statement cannot be mutated cleanly. */
  mutate(target: MutationTarget): MutationEdit | null;
}

// --- AST helpers ---

interface AlterCmd {
  subtype?: string;
  name?: string;
  def?: Record<string, unknown>;
}

interface ColumnDefNode {
  colname?: string;
  typeName?: { names?: Array<{ String?: { sval?: string } }> };
  constraints?: Array<{ Constraint?: { contype?: string } }>;
}

interface ConstraintNode {
  contype?: string;
  conname?: string;
  skip_validation?: boolean;
  indexname?: string;
  raw_expr?: Record<string, unknown>;
}

function nodeOf<T>(stmt: Record<string, unknown>, key: string): T | undefined {
  const value = stmt[key];
  return value == null ? undefined : (value as T);
}

function alterCmds(stmt: Record<string, unknown>): AlterCmd[] {
  const alter = nodeOf<{ cmds?: Array<{ AlterTableCmd?: AlterCmd }> }>(stmt, 'AlterTableStmt');
  if (!alter?.cmds) return [];
  return alter.cmds.map(c => c.AlterTableCmd).filter((c): c is AlterCmd => c != null);
}

function alterTable(stmt: Record<string, unknown>): string | undefined {
  return nodeOf<{ relation?: { relname?: string } }>(stmt, 'AlterTableStmt')?.relation?.relname;
}

/** The single ALTER TABLE subcommand of `subtype`, or undefined when there isn't exactly one command. */
function onlyCmd(stmt: Record<string, unknown>, subtype: string): AlterCmd | undefined {
  const cmds = alterCmds(stmt);
  if (cmds.length !== 1) return undefined;
  const cmd = cmds[0];
  return cmd && cmd.subtype === subtype ? cmd : undefined;
}

function constraintOf(cmd: AlterCmd | undefined): ConstraintNode | undefined {
  return cmd?.def?.Constraint as ConstraintNode | undefined;
}

function columnDefOf(cmd: AlterCmd | undefined): ColumnDefNode | undefined {
  return cmd?.def?.ColumnDef as ColumnDefNode | undefined;
}

function typeNames(col: ColumnDefNode | undefined): string[] {
  return col?.typeName?.names
    ?.map(n => n.String?.sval)
    .filter((n): n is string => !!n)
    .map(n => n.toLowerCase()) ?? [];
}

function hasConstraint(col: ColumnDefNode | undefined, contype: string): boolean {
  return col?.constraints?.some(c => c.Constraint?.contype === contype) ?? false;
}

function isConcurrentStatement(stmt: Record<string, unknown>): boolean {
  const idx = nodeOf<{ concurrent?: boolean }>(stmt, 'IndexStmt');
  if (idx) return idx.concurrent === true;

  const drop = nodeOf<{ concurrent?: boolean }>(stmt, 'DropStmt');
  if (drop) return drop.concurrent === true;

  const reindex = nodeOf<{ params?: Array<{ DefElem?: { defname?: string } }> }>(stmt, 'ReindexStmt');
  if (reindex) return reindex.params?.some(p => p.DefElem?.defname === 'concurrently') ?? false;

  return false;
}

/** Escape a value for safe use inside a RegExp. */
function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Replace the first match of `pattern`, or return null when it does not match.
 * Keeps every string transform verifiable: no silent no-op mutants.
 */
function replaceOnce(sql: string, pattern: RegExp, replacement: string): string | null {
  if (!pattern.test(sql)) return null;
  return sql.replace(pattern, replacement);
}

function edit(sql: string | null): MutationEdit | null {
  return sql == null ? null : { sql };
}

const CONCURRENTLY_RE = /\s+CONCURRENTLY\b/i;
const NOT_VALID_RE = /\s+NOT\s+VALID\s*$/i;

// --- Operators ---

const stripConcurrentCreateIndex: MutationOperator = {
  id: 'strip-concurrently-create-index',
  name: 'Strip CONCURRENTLY from CREATE INDEX',
  description: 'Turns CREATE INDEX CONCURRENTLY into a plain CREATE INDEX.',
  targetRules: ['MP001'],
  consequence: 'the index build holds ACCESS EXCLUSIVE on the table, blocking every read and write until it finishes',
  transform: 'string',
  isApplicable: t => nodeOf<{ concurrent?: boolean }>(t.stmt, 'IndexStmt')?.concurrent === true,
  mutate: t => edit(replaceOnce(t.sql, CONCURRENTLY_RE, '')),
};

const stripConcurrentDropIndex: MutationOperator = {
  id: 'strip-concurrently-drop-index',
  name: 'Strip CONCURRENTLY from DROP INDEX',
  description: 'Turns DROP INDEX CONCURRENTLY into a plain DROP INDEX.',
  targetRules: ['MP009'],
  consequence: 'the drop takes ACCESS EXCLUSIVE on the table and every query on it queues behind the lock',
  transform: 'string',
  isApplicable: t => {
    const drop = nodeOf<{ removeType?: string; concurrent?: boolean }>(t.stmt, 'DropStmt');
    return drop?.removeType === 'OBJECT_INDEX' && drop.concurrent === true;
  },
  mutate: t => edit(replaceOnce(t.sql, CONCURRENTLY_RE, '')),
};

const stripConcurrentReindex: MutationOperator = {
  id: 'strip-concurrently-reindex',
  name: 'Strip CONCURRENTLY from REINDEX',
  description: 'Turns REINDEX ... CONCURRENTLY into a blocking REINDEX.',
  targetRules: ['MP021'],
  consequence: 'the rebuild blocks writes (and reads, for a table reindex) for its full duration',
  transform: 'string',
  isApplicable: t => {
    const reindex = nodeOf<{ params?: Array<{ DefElem?: { defname?: string } }> }>(t.stmt, 'ReindexStmt');
    if (!reindex) return false;
    return reindex.params?.some(p => p.DefElem?.defname === 'concurrently') ?? false;
  },
  mutate: t => edit(replaceOnce(t.sql, CONCURRENTLY_RE, '')),
};

const stripConcurrentDetachPartition: MutationOperator = {
  id: 'strip-concurrently-detach-partition',
  name: 'Strip CONCURRENTLY from DETACH PARTITION',
  description: 'Turns DETACH PARTITION CONCURRENTLY into a blocking detach.',
  targetRules: ['MP046'],
  consequence: 'detaching takes ACCESS EXCLUSIVE on the parent table, freezing every query against the whole partitioned set',
  transform: 'string',
  isApplicable: t => {
    const cmd = onlyCmd(t.stmt, 'AT_DetachPartition');
    const part = cmd?.def?.PartitionCmd as { concurrent?: boolean } | undefined;
    return part?.concurrent === true;
  },
  mutate: t => edit(replaceOnce(t.sql, CONCURRENTLY_RE, '')),
};

const stripNotValidCheck: MutationOperator = {
  id: 'strip-not-valid-check',
  name: 'Strip NOT VALID from a CHECK constraint',
  description: 'Turns ADD CONSTRAINT ... CHECK (...) NOT VALID into an immediately validated CHECK.',
  targetRules: ['MP030'],
  consequence: 'adding the constraint scans every existing row under ACCESS EXCLUSIVE instead of returning instantly',
  transform: 'string',
  isApplicable: t => {
    const constraint = constraintOf(onlyCmd(t.stmt, 'AT_AddConstraint'));
    return constraint?.contype === 'CONSTR_CHECK' && constraint.skip_validation === true;
  },
  mutate: t => edit(replaceOnce(t.sql, NOT_VALID_RE, '')),
};

const stripNotValidFk: MutationOperator = {
  id: 'strip-not-valid-fk',
  name: 'Strip NOT VALID from a foreign key',
  description: 'Turns ADD CONSTRAINT ... FOREIGN KEY ... NOT VALID into an immediately validated FK.',
  targetRules: ['MP005'],
  consequence: 'the FK validates the whole table under ACCESS EXCLUSIVE and takes a lock on the referenced table too',
  transform: 'string',
  isApplicable: t => {
    const constraint = constraintOf(onlyCmd(t.stmt, 'AT_AddConstraint'));
    return constraint?.contype === 'CONSTR_FOREIGN' && constraint.skip_validation === true;
  },
  mutate: t => edit(replaceOnce(t.sql, NOT_VALID_RE, '')),
};

/**
 * True when a later statement takes a lock worth guarding — the same gate MP004
 * applies. Without one of these, removing lock_timeout isn't the dangerous change
 * this operator claims, so the operator declines rather than manufacture a mutant
 * nobody should care about.
 */
function hasLaterLockHeavyDdl(t: MutationTarget): boolean {
  return t.all.slice(t.index + 1).some(entry => {
    if ('VariableSetStmt' in entry.stmt || 'TransactionStmt' in entry.stmt || 'CreateStmt' in entry.stmt) return false;
    const lock = classifyLock(entry.stmt, t.pgVersion);
    return lock.lockType === 'ACCESS EXCLUSIVE' || lock.lockType === 'SHARE';
  });
}

/**
 * True when a later statement can actually run long — mirrors MP020's own list.
 * Same reasoning as above: dropping statement_timeout ahead of a metadata-only
 * ALTER is not a production hazard, so don't call it one.
 */
function hasLaterLongRunningDdl(t: MutationTarget): boolean {
  return t.all.slice(t.index + 1).some(entry => {
    const stmt = entry.stmt;

    if ('ClusterStmt' in stmt || 'ReindexStmt' in stmt) return true;

    const vacuum = nodeOf<{ options?: Array<{ DefElem?: { defname?: string } }> }>(stmt, 'VacuumStmt');
    if (vacuum?.options?.some(o => o.DefElem?.defname === 'full')) return true;

    const idx = nodeOf<{ concurrent?: boolean }>(stmt, 'IndexStmt');
    if (idx && !idx.concurrent) return true;

    return alterCmds(stmt).some(c => c.subtype === 'AT_ValidateConstraint' || c.subtype === 'AT_SetNotNull' || c.subtype === 'AT_AlterColumnType');
  });
}

function isTimeoutSet(stmt: Record<string, unknown>, name: string): boolean {
  const set = nodeOf<{ kind?: string; name?: string }>(stmt, 'VariableSetStmt');
  return set?.name === name && set.kind === 'VAR_SET_VALUE';
}

const removeLockTimeout: MutationOperator = {
  id: 'remove-lock-timeout',
  name: 'Remove SET lock_timeout',
  description: 'Deletes the SET lock_timeout guard that precedes the DDL.',
  targetRules: ['MP004'],
  consequence: 'DDL that cannot get its lock waits forever, and every query behind it in the lock queue stalls with it',
  transform: 'ast',
  isApplicable: t => isTimeoutSet(t.stmt, 'lock_timeout') && hasLaterLockHeavyDdl(t),
  mutate: () => ({ sql: '' }),
};

const removeStatementTimeout: MutationOperator = {
  id: 'remove-statement-timeout',
  name: 'Remove SET statement_timeout',
  description: 'Deletes the SET statement_timeout guard that precedes the DDL.',
  targetRules: ['MP020'],
  consequence: 'a migration that runs long has nothing to stop it, so it can hold its locks for hours',
  transform: 'ast',
  isApplicable: t => isTimeoutSet(t.stmt, 'statement_timeout') && hasLaterLongRunningDdl(t),
  mutate: () => ({ sql: '' }),
};

const TEMPORAL_TYPES = ['timestamptz', 'timestamp', 'date', 'time', 'timetz'];

const addVolatileDefault: MutationOperator = {
  id: 'add-volatile-default',
  name: 'Add a volatile DEFAULT now() to ADD COLUMN',
  description: 'Gives a newly added timestamp/date column a DEFAULT now().',
  targetRules: ['MP003'],
  consequence: 'existing rows get their value computed at read time rather than a fixed backfilled one, and on PG 10 and older the whole table is rewritten under ACCESS EXCLUSIVE',
  transform: 'string',
  isApplicable: t => {
    const col = columnDefOf(onlyCmd(t.stmt, 'AT_AddColumn'));
    if (!col) return false;
    if (hasConstraint(col, 'CONSTR_DEFAULT')) return false;
    return typeNames(col).some(n => TEMPORAL_TYPES.includes(n));
  },
  mutate: t => ({ sql: `${t.sql} DEFAULT now()` }),
};

const addColumnNotNull: MutationOperator = {
  id: 'add-column-not-null',
  name: 'Make a nullable ADD COLUMN NOT NULL',
  description: 'Adds NOT NULL to a newly added column that has no default.',
  targetRules: ['MP084'],
  consequence: 'ADD COLUMN NOT NULL without a default aborts with "column contains null values" on any non-empty table, failing the deploy mid-migration',
  transform: 'string',
  isApplicable: t => {
    const col = columnDefOf(onlyCmd(t.stmt, 'AT_AddColumn'));
    if (!col) return false;
    if (hasConstraint(col, 'CONSTR_NOTNULL')) return false;
    if (hasConstraint(col, 'CONSTR_DEFAULT')) return false;
    if (hasConstraint(col, 'CONSTR_PRIMARY')) return false;
    return true;
  },
  mutate: t => ({ sql: `${t.sql} NOT NULL` }),
};

const addDropCascade: MutationOperator = {
  id: 'add-drop-cascade',
  name: 'Add CASCADE to DROP',
  description: 'Turns a restricted DROP into DROP ... CASCADE.',
  targetRules: ['MP022'],
  consequence: 'every dependent view, foreign key, policy and trigger is dropped silently along with the target',
  transform: 'string',
  isApplicable: t => {
    const drop = nodeOf<{ behavior?: string; concurrent?: boolean }>(t.stmt, 'DropStmt');
    if (!drop) return false;
    // DROP INDEX CONCURRENTLY cannot take CASCADE.
    if (drop.concurrent) return false;
    return drop.behavior !== 'DROP_CASCADE';
  },
  mutate: t => ({ sql: `${t.sql} CASCADE` }),
};

const addTruncateCascade: MutationOperator = {
  id: 'add-truncate-cascade',
  name: 'Add CASCADE to TRUNCATE',
  description: 'Turns TRUNCATE into TRUNCATE ... CASCADE.',
  targetRules: ['MP036'],
  consequence: 'every table with a foreign key to the target is truncated too, recursively — data loss well beyond the named table',
  transform: 'string',
  isApplicable: t => {
    const truncate = nodeOf<{ behavior?: string }>(t.stmt, 'TruncateStmt');
    return truncate != null && truncate.behavior !== 'DROP_CASCADE';
  },
  mutate: t => ({ sql: `${t.sql} CASCADE` }),
};

const uniqueConstraintDropUsingIndex: MutationOperator = {
  id: 'unique-constraint-drop-using-index',
  name: 'Drop the USING INDEX form of a UNIQUE constraint',
  description: 'Rewrites ADD CONSTRAINT ... UNIQUE USING INDEX into a direct UNIQUE (columns) constraint, using the columns of the referenced index.',
  targetRules: ['MP027'],
  consequence: 'PostgreSQL builds the unique index from scratch under ACCESS EXCLUSIVE instead of adopting the one built concurrently',
  transform: 'ast',
  isApplicable: t => {
    const constraint = constraintOf(onlyCmd(t.stmt, 'AT_AddConstraint'));
    if (constraint?.contype !== 'CONSTR_UNIQUE' || !constraint.indexname) return false;
    return findIndexColumns(t, constraint.indexname) !== null;
  },
  mutate: t => {
    const constraint = constraintOf(onlyCmd(t.stmt, 'AT_AddConstraint'));
    const indexName = constraint?.indexname;
    if (!indexName) return null;
    const columns = findIndexColumns(t, indexName);
    if (!columns) return null;
    const pattern = new RegExp(`\\s+USING\\s+INDEX\\s+"?${escapeRe(indexName)}"?`, 'i');
    return edit(replaceOnce(t.sql, pattern, ` (${columns.join(', ')})`));
  },
};

/** Columns of a unique index created earlier in the same migration, or null when it can't be resolved. */
function findIndexColumns(t: MutationTarget, indexName: string): string[] | null {
  for (const entry of t.all) {
    const idx = nodeOf<{
      idxname?: string;
      unique?: boolean;
      indexParams?: Array<{ IndexElem?: { name?: string } }>;
    }>(entry.stmt, 'IndexStmt');
    if (!idx || idx.idxname !== indexName || !idx.unique) continue;

    const columns = idx.indexParams?.map(p => p.IndexElem?.name) ?? [];
    // Expression indexes have no column name — the constraint form can't be rebuilt.
    if (columns.length === 0 || columns.some(c => !c)) return null;
    return columns as string[];
  }
  return null;
}

const wrapConcurrentInTransaction: MutationOperator = {
  id: 'wrap-concurrently-in-transaction',
  name: 'Wrap a CONCURRENTLY operation in BEGIN/COMMIT',
  description: 'Puts an explicit transaction block around a CONCURRENTLY statement.',
  targetRules: ['MP025'],
  consequence: 'PostgreSQL refuses outright — "CREATE INDEX CONCURRENTLY cannot run inside a transaction block" — and the deploy dies at that statement',
  transform: 'ast',
  isApplicable: t => isConcurrentStatement(t.stmt) && !isInsideTransactionBlock(t),
  mutate: t => ({ sql: `BEGIN;\n${t.sql};\nCOMMIT` }),
};

/** Walk backwards for an unclosed BEGIN. */
function isInsideTransactionBlock(t: MutationTarget): boolean {
  for (let i = t.index - 1; i >= 0; i--) {
    const entry = t.all[i];
    if (!entry) continue;
    const kind = nodeOf<{ kind?: string }>(entry.stmt, 'TransactionStmt')?.kind;
    if (kind === 'TRANS_STMT_BEGIN' || kind === 'TRANS_STMT_START') return true;
    if (kind === 'TRANS_STMT_COMMIT' || kind === 'TRANS_STMT_ROLLBACK') return false;
  }
  return false;
}

const stripIfNotExists: MutationOperator = {
  id: 'strip-if-not-exists',
  name: 'Strip IF NOT EXISTS',
  description: 'Removes IF NOT EXISTS from CREATE TABLE / CREATE INDEX.',
  targetRules: ['MP023'],
  consequence: 'a retried or partially applied migration aborts with "relation already exists" instead of being a no-op',
  transform: 'string',
  isApplicable: t => {
    const create = nodeOf<{ if_not_exists?: boolean }>(t.stmt, 'CreateStmt');
    if (create?.if_not_exists === true) return true;
    return nodeOf<{ if_not_exists?: boolean }>(t.stmt, 'IndexStmt')?.if_not_exists === true;
  },
  mutate: t => edit(replaceOnce(t.sql, /\s+IF\s+NOT\s+EXISTS\b/i, '')),
};

const BIGINT_TYPES = ['int8', 'bigint'];

const narrowBigintToInt: MutationOperator = {
  id: 'narrow-bigint-to-int',
  name: 'Narrow a BIGINT key column to INTEGER',
  description: 'Changes a BIGINT primary or foreign key column in CREATE TABLE to INTEGER.',
  targetRules: ['MP038'],
  consequence: 'the key space caps out at 2.1 billion, and widening it later means a full table rewrite under ACCESS EXCLUSIVE',
  transform: 'string',
  isApplicable: t => findBigintKeyColumn(t.stmt) !== null,
  mutate: t => {
    const colname = findBigintKeyColumn(t.stmt);
    if (!colname) return null;
    const pattern = new RegExp(`("?${escapeRe(colname)}"?\\s+)(bigint|int8)\\b`, 'i');
    return edit(replaceOnce(t.sql, pattern, '$1INTEGER'));
  },
};

/** First BIGINT column carrying a PRIMARY KEY or REFERENCES constraint. */
function findBigintKeyColumn(stmt: Record<string, unknown>): string | null {
  const create = nodeOf<{ tableElts?: Array<{ ColumnDef?: ColumnDefNode }> }>(stmt, 'CreateStmt');
  if (!create?.tableElts) return null;

  for (const elt of create.tableElts) {
    const col = elt.ColumnDef;
    if (!col?.colname) continue;
    const isKey = hasConstraint(col, 'CONSTR_PRIMARY') || hasConstraint(col, 'CONSTR_FOREIGN');
    if (!isKey) continue;
    if (!typeNames(col).some(n => BIGINT_TYPES.includes(n))) continue;
    return col.colname;
  }
  return null;
}

const narrowTextToVarchar: MutationOperator = {
  id: 'narrow-text-to-varchar',
  name: 'Narrow TEXT to VARCHAR(255)',
  description: 'Changes a TEXT column in CREATE TABLE or ADD COLUMN to VARCHAR(255).',
  targetRules: ['MP037'],
  consequence: 'any write longer than 255 characters starts failing at runtime, and raising the limit later needs a table rewrite on PG 16 and older',
  transform: 'string',
  isApplicable: t => findTextColumn(t.stmt) !== null,
  mutate: t => {
    const colname = findTextColumn(t.stmt);
    if (!colname) return null;
    const pattern = new RegExp(`("?${escapeRe(colname)}"?\\s+)text\\b`, 'i');
    return edit(replaceOnce(t.sql, pattern, '$1VARCHAR(255)'));
  },
};

/** First plain TEXT column of a CREATE TABLE, or the column of a single ADD COLUMN. */
function findTextColumn(stmt: Record<string, unknown>): string | null {
  const create = nodeOf<{ tableElts?: Array<{ ColumnDef?: ColumnDefNode }> }>(stmt, 'CreateStmt');
  if (create?.tableElts) {
    for (const elt of create.tableElts) {
      const col = elt.ColumnDef;
      if (!col?.colname) continue;
      if (typeNames(col).includes('text')) return col.colname;
    }
    return null;
  }

  const added = columnDefOf(onlyCmd(stmt, 'AT_AddColumn'));
  if (added?.colname && typeNames(added).includes('text')) return added.colname;
  return null;
}

/** A WHERE clause can only be chopped off the end when there is exactly one, and nothing follows it. */
function hasSingleTrailingWhere(sql: string): boolean {
  const matches = sql.match(/\bWHERE\b/gi);
  if (!matches || matches.length !== 1) return false;
  return !/\bRETURNING\b/i.test(sql);
}

const stripWhereUpdate: MutationOperator = {
  id: 'strip-where-update',
  name: 'Strip the WHERE clause from an UPDATE',
  description: 'Turns a filtered UPDATE into a full-table UPDATE.',
  targetRules: ['MP011'],
  consequence: 'every row in the table is rewritten in one transaction — WAL floods, the table bloats, and replicas fall behind',
  transform: 'string',
  isApplicable: t => {
    const update = nodeOf<{ whereClause?: unknown }>(t.stmt, 'UpdateStmt');
    if (!update?.whereClause) return false;
    return hasSingleTrailingWhere(t.sql);
  },
  mutate: t => edit(replaceOnce(t.sql, /\s+WHERE\b[\s\S]*$/i, '')),
};

const stripWhereDelete: MutationOperator = {
  id: 'strip-where-delete',
  name: 'Strip the WHERE clause from a DELETE',
  description: 'Turns a filtered DELETE into a full-table DELETE.',
  targetRules: ['MP067'],
  consequence: 'the entire table is deleted row by row in one transaction, leaving dead tuples and a lock held for the whole run',
  transform: 'string',
  isApplicable: t => {
    const del = nodeOf<{ whereClause?: unknown }>(t.stmt, 'DeleteStmt');
    if (!del?.whereClause) return false;
    return hasSingleTrailingWhere(t.sql);
  },
  mutate: t => edit(replaceOnce(t.sql, /\s+WHERE\b[\s\S]*$/i, '')),
};

const renameInsteadOfAddColumn: MutationOperator = {
  id: 'rename-instead-of-add-column',
  name: 'Rename a column instead of adding one',
  description: 'Replaces an expand-style ADD COLUMN with the RENAME COLUMN shortcut.',
  targetRules: ['MP010'],
  consequence: 'every query, view and function still using the old column name breaks the instant the rename commits',
  transform: 'ast',
  isApplicable: t => {
    const cmd = onlyCmd(t.stmt, 'AT_AddColumn');
    return columnDefOf(cmd)?.colname != null && alterTable(t.stmt) != null;
  },
  mutate: t => {
    const colname = columnDefOf(onlyCmd(t.stmt, 'AT_AddColumn'))?.colname;
    const table = alterTable(t.stmt);
    if (!colname || !table) return null;
    return { sql: `ALTER TABLE ${table} RENAME COLUMN ${colname} TO ${colname}_v2` };
  },
};

const collapseCheckToSetNotNull: MutationOperator = {
  id: 'collapse-check-to-set-not-null',
  name: 'Drop the CHECK pattern before SET NOT NULL',
  description: 'Deletes the CHECK (col IS NOT NULL) NOT VALID and VALIDATE CONSTRAINT steps, leaving a bare SET NOT NULL.',
  targetRules: ['MP002', 'MP018'],
  consequence: 'SET NOT NULL scans the whole table under ACCESS EXCLUSIVE instead of finishing instantly off the validated constraint',
  transform: 'ast',
  isApplicable: t => findCheckPattern(t) !== null,
  mutate: t => {
    const removes = findCheckPattern(t);
    if (!removes) return null;
    return { sql: t.sql, removes };
  },
};

/**
 * For a SET NOT NULL statement, find the preceding CHECK (col IS NOT NULL) NOT VALID
 * statement and its VALIDATE CONSTRAINT. Returns the indices to delete, or null.
 */
function findCheckPattern(t: MutationTarget): number[] | null {
  const setNotNull = onlyCmd(t.stmt, 'AT_SetNotNull');
  const column = setNotNull?.name;
  const table = alterTable(t.stmt);
  if (!column || !table) return null;

  for (let i = 0; i < t.index; i++) {
    const entry = t.all[i];
    if (!entry) continue;
    if (alterTable(entry.stmt) !== table) continue;

    const constraint = constraintOf(onlyCmd(entry.stmt, 'AT_AddConstraint'));
    if (constraint?.contype !== 'CONSTR_CHECK' || !constraint.skip_validation) continue;

    // The CHECK must be about this column being non-null.
    const expr = JSON.stringify(constraint.raw_expr ?? {});
    if (!expr.includes('IS_NOT_NULL') || !expr.includes(`"sval":"${column}"`)) continue;

    const removes = [i];
    const conname = constraint.conname;
    if (conname) {
      for (let j = i + 1; j < t.index; j++) {
        const later = t.all[j];
        if (!later) continue;
        const validate = onlyCmd(later.stmt, 'AT_ValidateConstraint');
        if (validate?.name === conname) removes.push(j);
      }
    }
    return removes;
  }
  return null;
}

const vacuumToVacuumFull: MutationOperator = {
  id: 'vacuum-to-vacuum-full',
  name: 'Turn VACUUM into VACUUM FULL',
  description: 'Adds the FULL option to a plain VACUUM.',
  targetRules: ['MP006'],
  consequence: 'the table is rewritten into a new file under ACCESS EXCLUSIVE — on a large table that is hours of total downtime',
  transform: 'string',
  isApplicable: t => {
    const vacuum = nodeOf<{ is_vacuumcmd?: boolean; options?: Array<{ DefElem?: { defname?: string } }> }>(t.stmt, 'VacuumStmt');
    if (!vacuum?.is_vacuumcmd) return false;
    return !(vacuum.options?.some(o => o.DefElem?.defname === 'full') ?? false);
  },
  mutate: t => {
    // Parenthesised option list: VACUUM (VERBOSE) t → VACUUM (FULL, VERBOSE) t
    if (/^VACUUM\s*\(/i.test(t.sql)) {
      return edit(replaceOnce(t.sql, /^(VACUUM\s*\()/i, '$1FULL, '));
    }
    return edit(replaceOnce(t.sql, /^VACUUM\b/i, 'VACUUM FULL'));
  },
};

const grantSelectToGrantAll: MutationOperator = {
  id: 'grant-select-to-grant-all',
  name: 'Widen GRANT SELECT to GRANT ALL',
  description: 'Replaces a specific privilege list with ALL PRIVILEGES.',
  targetRules: ['MP085'],
  consequence: 'the grantee silently gains INSERT, UPDATE, DELETE, TRUNCATE and REFERENCES on the object — a privilege escalation nobody reviews',
  transform: 'string',
  isApplicable: t => {
    const grant = nodeOf<{
      is_grant?: boolean;
      targtype?: string;
      privileges?: Array<{ AccessPriv?: { priv_name?: string; cols?: unknown[] } }>;
    }>(t.stmt, 'GrantStmt');
    if (!grant?.is_grant || grant.targtype !== 'ACL_TARGET_OBJECT') return false;
    // An empty privilege list already means ALL.
    if (!grant.privileges || grant.privileges.length === 0) return false;
    // Column-level grants can't be widened with this text edit.
    if (grant.privileges.some(p => p.AccessPriv?.cols != null)) return false;
    return /^GRANT\s+[^(]+?\s+ON\b/i.test(t.sql);
  },
  mutate: t => edit(replaceOnce(t.sql, /^GRANT\s+[^(]+?\s+ON\b/i, 'GRANT ALL ON')),
};

/** Every mutation operator, in a stable order. */
export const allOperators: MutationOperator[] = [
  stripConcurrentCreateIndex,
  stripConcurrentDropIndex,
  stripConcurrentReindex,
  stripConcurrentDetachPartition,
  stripNotValidCheck,
  stripNotValidFk,
  removeLockTimeout,
  removeStatementTimeout,
  addVolatileDefault,
  addColumnNotNull,
  addDropCascade,
  addTruncateCascade,
  uniqueConstraintDropUsingIndex,
  wrapConcurrentInTransaction,
  stripIfNotExists,
  narrowBigintToInt,
  narrowTextToVarchar,
  stripWhereUpdate,
  stripWhereDelete,
  renameInsteadOfAddColumn,
  collapseCheckToSetNotNull,
  vacuumToVacuumFull,
  grantSelectToGrantAll,
];

/** Look up an operator by id. */
export function getOperator(id: string): MutationOperator | undefined {
  return allOperators.find(op => op.id === id);
}
