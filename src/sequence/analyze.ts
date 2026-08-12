/**
 * Sequence-level analysis — the migration directory as one deploy.
 *
 * Per-file analysis answers "is this migration safe?". A release is rarely one
 * file, and the hazards that take production down live between them: four
 * migrations that each hold a short lock on the same hot table, an index built
 * in one file and thrown away by a rewrite two files later, a migration that
 * uses a table the next file creates.
 *
 * Findings get their own ID space, SQ001–SQ005, so they never collide with the
 * per-statement MP rules:
 *
 * - SQ001 cumulative-lock-budget — blocking lock time stacked up on one table
 * - SQ002 hot-table-multi-touch  — one table locked by N files in one deploy
 * - SQ003 create-then-rewrite    — an index/constraint built, then rewritten away
 * - SQ004 ordering-hazard        — a file uses an object a later file creates
 * - SQ005 blast-radius           — the summary (not a violation)
 *
 * Note: this is about the *sequence of migration files*. For PostgreSQL
 * SEQUENCE objects and overflow risk, see ./monitor.ts.
 */

import { basename } from 'node:path';
import { parseMigration } from '../parser/parse.js';
import { extractTargets } from '../parser/extract.js';
import { classifyLock, lockSeverity } from '../locks/classify.js';
import { estimateDuration } from '../output/plan.js';
import { buildMigrationFiles, findMissingDependencies } from '../analysis/ordering.js';
import type { LockClassification, LockLevel } from '../locks/classify.js';
import type { DurationClass } from '../output/plan.js';
import type { Severity } from '../rules/engine.js';

export type SequenceFindingId = 'SQ001' | 'SQ002' | 'SQ003' | 'SQ004';
export type SequenceCheckId = SequenceFindingId | 'SQ005';

export interface SequenceInput {
  /** Path of the migration file, used for display and ordering. */
  path: string;
  /** File contents. */
  sql: string;
}

export interface SequenceOptions {
  /** Target PostgreSQL version — some locks are version-dependent. Default 17. */
  pgVersion?: number;
  /** Blocking lock seconds allowed per table across the sequence. Default 60. */
  lockBudgetSeconds?: number;
  /** Distinct files touching one table before SQ002 fires. Default 3. */
  hotTableFileThreshold?: number;
  /** Row counts per table, when production context is available, to sharpen estimates. */
  rowCounts?: Map<string, number>;
}

export interface SequenceFinding {
  id: SequenceFindingId;
  /** Stable kebab-case name, mirroring how MP rules are named. */
  name: string;
  severity: Severity;
  message: string;
  /** Files involved, in sequence order. */
  files: string[];
  /** Table the finding is about, when it is about one table. */
  table?: string;
  /** Supporting numbers — the evidence behind the message. */
  detail?: string;
}

export interface TableBlastRadius {
  table: string;
  /** Files that touch this table, in sequence order. */
  files: string[];
  /** Statements across the sequence that touch it. */
  statements: number;
  /** Statements that block reads or writes. */
  blockingStatements: number;
  worstLock: LockLevel;
  /** Whether the worst lock is held for a scan or rewrite rather than momentarily. */
  worstLockLongHeld: boolean;
  /** File holding the worst lock. */
  worstLockFile: string;
  /** Summed blocking lock time across the sequence, in seconds. */
  estimatedLockSeconds: number;
  /** Distinct operations applied, e.g. "ALTER TABLE", "CREATE INDEX". */
  operations: string[];
}

/** SQ005 — what this deploy touches and what it costs. */
export interface SequenceBlastRadius {
  tables: TableBlastRadius[];
  totalEstimatedLockSeconds: number;
  /**
   * `measured` when row counts were supplied and the estimate is calibrated to
   * real table sizes, `heuristic` when it falls back to per-operation defaults.
   */
  estimateBasis: 'measured' | 'heuristic';
}

export interface SequenceAnalysis {
  /** File names in sequence order. */
  files: string[];
  fileCount: number;
  statementCount: number;
  findings: SequenceFinding[];
  blastRadius: SequenceBlastRadius;
  /** Files that could not be parsed, and were left out of the analysis. */
  parseErrors: Array<{ file: string; error: string }>;
  /** Thresholds the run used, echoed so a report explains its own numbers. */
  thresholds: { lockBudgetSeconds: number; hotTableFileThreshold: number };
}

export const DEFAULT_LOCK_BUDGET_SECONDS = 60;
export const DEFAULT_HOT_TABLE_FILE_THRESHOLD = 3;

/** Metadata for every check in the SQ space, for docs and JSON consumers. */
export const SEQUENCE_CHECKS: Record<SequenceCheckId, { name: string; kind: 'finding' | 'summary'; description: string }> = {
  SQ001: {
    name: 'cumulative-lock-budget',
    kind: 'finding',
    description: 'Blocking lock time on one table, summed across the whole sequence, exceeds the budget.',
  },
  SQ002: {
    name: 'hot-table-multi-touch',
    kind: 'finding',
    description: 'One table is locked by several files in the same deploy, so it takes the lock queue hit repeatedly.',
  },
  SQ003: {
    name: 'create-then-rewrite',
    kind: 'finding',
    description: 'An index or constraint is built on a table that a later file rewrites or drops, throwing the work away.',
  },
  SQ004: {
    name: 'ordering-hazard',
    kind: 'finding',
    description: 'A file uses an object that a later file creates — the sequence fails when applied in order.',
  },
  SQ005: {
    name: 'blast-radius',
    kind: 'summary',
    description: 'Tables touched by the sequence, the worst lock each one takes, and the total estimated lock time.',
  },
};

// ---------------------------------------------------------------------------
// Lock-time estimation
// ---------------------------------------------------------------------------

/** Representative seconds for each duration class from the execution planner. */
const CLASS_SECONDS: Record<Exclude<DurationClass, 'unknown'>, number> = {
  instant: 0.5,
  seconds: 5,
  minutes: 300,
  hours: 3600,
};

/** A blocking lock that is only held for a catalog update. */
const METADATA_LOCK_SECONDS = 0.5;

/**
 * What a scan or rewrite costs when no row counts are available. Deliberately
 * a full minute: the point of SQ001 is that these stack, and pretending an
 * unmeasured rewrite is free defeats it.
 */
const UNMEASURED_LONG_HELD_SECONDS = 60;

/**
 * Seconds this statement is expected to hold a lock that blocks other sessions.
 *
 * Non-blocking work costs nothing here however long it runs — an hour-long
 * CREATE INDEX CONCURRENTLY does not spend the lock budget.
 */
export function estimateLockSeconds(
  stmt: Record<string, unknown>,
  lock: LockClassification,
  rowCount?: number,
): number {
  if (!lock.blocksReads && !lock.blocksWrites) return 0;
  if (!lock.longHeld) return METADATA_LOCK_SECONDS;

  const durationClass = estimateDuration(stmt, lock, rowCount);
  // 'unknown' means no row counts; 'instant' contradicts longHeld (the planner
  // reports the common case, e.g. ADD COLUMN, which is only long-held here when
  // a volatile default forces a rewrite). Fall back either way.
  if (durationClass === 'unknown' || durationClass === 'instant') return UNMEASURED_LONG_HELD_SECONDS;
  return CLASS_SECONDS[durationClass];
}

/** Does this statement's lock count against the cumulative budget? */
function isBudgetedLock(lock: LockClassification): boolean {
  return lock.longHeld && (lock.blocksReads || lock.blocksWrites);
}

// ---------------------------------------------------------------------------
// Internal shapes
// ---------------------------------------------------------------------------

interface SequenceStatement {
  file: string;
  line: number;
  sql: string;
  stmt: Record<string, unknown>;
  lock: LockClassification;
  /** Tables this statement operates on. */
  tables: string[];
  /** Operation labels from the target extractor. */
  operations: string[];
  lockSeconds: number;
}

interface FileRecord {
  path: string;
  name: string;
  index: number;
  statements: SequenceStatement[];
  createdTables: string[];
  referencedTables: string[];
}

interface CreatedObject {
  kind: 'index' | 'constraint';
  name: string;
  table: string;
  file: string;
  fileIndex: number;
}

interface Rewrite {
  table: string;
  file: string;
  fileIndex: number;
  /** What makes it a rewrite, phrased for the report. */
  cause: string;
}

/**
 * Analyze an ordered set of migration files as one deploy.
 *
 * The order of `inputs` is the order the migrations will be applied — the
 * caller sorts, this does not re-sort.
 */
export async function analyzeSequence(
  inputs: SequenceInput[],
  options: SequenceOptions = {},
): Promise<SequenceAnalysis> {
  const pgVersion = options.pgVersion ?? 17;
  const lockBudgetSeconds = options.lockBudgetSeconds ?? DEFAULT_LOCK_BUDGET_SECONDS;
  const hotTableFileThreshold = options.hotTableFileThreshold ?? DEFAULT_HOT_TABLE_FILE_THRESHOLD;
  const rowCounts = options.rowCounts;

  const files: FileRecord[] = [];
  const parseErrors: Array<{ file: string; error: string }> = [];

  for (const input of inputs) {
    const name = basename(input.path);
    const parsed = await parseMigration(input.sql);

    if (parsed.errors.length > 0) {
      parseErrors.push({ file: name, error: parsed.errors.map(e => e.message).join('; ') });
      continue;
    }

    const statements: SequenceStatement[] = [];
    const createdTables = new Set<string>();
    const referencedTables = new Set<string>();

    for (const s of parsed.statements) {
      const lock = classifyLock(s.stmt, pgVersion);
      const targets = extractTargets(s.stmt);
      const created = createdTablesOf(s.stmt);
      const tables = [...new Set([
        ...targets.map(t => t.tableName),
        ...foreignKeyTables(s.stmt),
        ...dmlTables(s.stmt),
      ])];

      for (const t of created) createdTables.add(t);
      for (const t of tables) {
        if (!created.includes(t)) referencedTables.add(t);
      }

      statements.push({
        file: name,
        line: s.line,
        sql: s.originalSql,
        stmt: s.stmt,
        lock,
        tables,
        operations: [...new Set(targets.map(t => t.operation))],
        lockSeconds: estimateLockSeconds(s.stmt, lock, rowCounts?.get(tables[0] ?? '')),
      });
    }

    files.push({
      path: input.path,
      name,
      index: files.length,
      statements,
      createdTables: [...createdTables],
      referencedTables: [...referencedTables],
    });
  }

  const blastRadius = buildBlastRadius(files, rowCounts !== undefined);
  const findings: SequenceFinding[] = [
    ...findOrderingHazards(files),
    ...findLockBudgetBreaches(files, blastRadius, lockBudgetSeconds),
    ...findHotTables(files, hotTableFileThreshold),
    ...findWastedWork(files),
  ];

  findings.sort((a, b) => a.id.localeCompare(b.id) || (a.files[0] ?? '').localeCompare(b.files[0] ?? ''));

  return {
    files: files.map(f => f.name),
    fileCount: files.length,
    statementCount: files.reduce((sum, f) => sum + f.statements.length, 0),
    findings,
    blastRadius,
    parseErrors,
    thresholds: { lockBudgetSeconds, hotTableFileThreshold },
  };
}

// ---------------------------------------------------------------------------
// SQ005 — blast radius
// ---------------------------------------------------------------------------

function buildBlastRadius(files: FileRecord[], measured: boolean): SequenceBlastRadius {
  const byTable = new Map<string, TableBlastRadius>();
  const worstLocks = new Map<string, LockClassification>();

  for (const file of files) {
    for (const s of file.statements) {
      for (const table of s.tables) {
        let entry = byTable.get(table);
        if (!entry) {
          entry = {
            table,
            files: [],
            statements: 0,
            blockingStatements: 0,
            worstLock: s.lock.lockType,
            worstLockLongHeld: s.lock.longHeld,
            worstLockFile: file.name,
            estimatedLockSeconds: 0,
            operations: [],
          };
          byTable.set(table, entry);
          worstLocks.set(table, s.lock);
        }

        if (!entry.files.includes(file.name)) entry.files.push(file.name);
        entry.statements++;
        if (s.lock.blocksReads || s.lock.blocksWrites) entry.blockingStatements++;
        entry.estimatedLockSeconds += isBudgetedLock(s.lock) ? s.lockSeconds : 0;

        const worst = worstLocks.get(table);
        if (worst && lockSeverity(s.lock) > lockSeverity(worst)) {
          worstLocks.set(table, s.lock);
          entry.worstLock = s.lock.lockType;
          entry.worstLockLongHeld = s.lock.longHeld;
          entry.worstLockFile = file.name;
        }

        for (const op of s.operations) {
          if (!entry.operations.includes(op)) entry.operations.push(op);
        }
      }
    }
  }

  for (const entry of byTable.values()) {
    entry.estimatedLockSeconds = round(entry.estimatedLockSeconds);
  }

  const tables = [...byTable.values()].sort((a, b) =>
    b.estimatedLockSeconds - a.estimatedLockSeconds ||
    b.files.length - a.files.length ||
    a.table.localeCompare(b.table),
  );

  return {
    tables,
    totalEstimatedLockSeconds: round(tables.reduce((sum, t) => sum + t.estimatedLockSeconds, 0)),
    estimateBasis: measured ? 'measured' : 'heuristic',
  };
}

// ---------------------------------------------------------------------------
// SQ001 — cumulative lock budget
// ---------------------------------------------------------------------------

function findLockBudgetBreaches(
  files: FileRecord[],
  blastRadius: SequenceBlastRadius,
  budgetSeconds: number,
): SequenceFinding[] {
  const findings: SequenceFinding[] = [];

  for (const table of blastRadius.tables) {
    const contributors = files.flatMap(f =>
      f.statements
        .filter(s => s.tables.includes(table.table) && isBudgetedLock(s.lock))
        .map(s => ({ file: f.name, statement: s })),
    );

    // One long lock is a per-statement problem the MP rules already report.
    // SQ001 is about the total, so it needs at least two.
    if (contributors.length < 2) continue;

    const total = round(contributors.reduce((sum, c) => sum + c.statement.lockSeconds, 0));
    if (total < budgetSeconds) continue;

    const involvedFiles = [...new Set(contributors.map(c => c.file))];
    const severity: Severity = total >= budgetSeconds * 3 ? 'critical' : 'warning';

    findings.push({
      id: 'SQ001',
      name: SEQUENCE_CHECKS.SQ001.name,
      severity,
      table: table.table,
      files: involvedFiles,
      message: `"${table.table}" is locked for an estimated ${formatSeconds(total)} across ${contributors.length} statements in ${involvedFiles.length} file${involvedFiles.length !== 1 ? 's' : ''} — over the ${formatSeconds(budgetSeconds)} budget for one deploy.`,
      detail: contributors
        .map(c => `${c.file}:${c.statement.line} ${c.statement.lock.lockType} ~${formatSeconds(c.statement.lockSeconds)} — ${preview(c.statement.sql)}`)
        .join('\n'),
    });
  }

  return findings;
}

// ---------------------------------------------------------------------------
// SQ002 — hot table, touched by many files
// ---------------------------------------------------------------------------

function findHotTables(files: FileRecord[], threshold: number): SequenceFinding[] {
  const byTable = new Map<string, Array<{ file: string; lock: LockLevel; line: number }>>();

  for (const file of files) {
    for (const s of file.statements) {
      if (!s.lock.blocksReads && !s.lock.blocksWrites) continue;
      for (const table of s.tables) {
        const entry = byTable.get(table) ?? [];
        entry.push({ file: file.name, lock: s.lock.lockType, line: s.line });
        byTable.set(table, entry);
      }
    }
  }

  const findings: SequenceFinding[] = [];

  for (const [table, touches] of byTable) {
    const involvedFiles = [...new Set(touches.map(t => t.file))];
    if (involvedFiles.length < threshold) continue;

    findings.push({
      id: 'SQ002',
      name: SEQUENCE_CHECKS.SQ002.name,
      severity: 'warning',
      table,
      files: involvedFiles,
      message: `"${table}" is locked by ${involvedFiles.length} files in this sequence. Each one queues behind live traffic on its own — fold them into one migration so the table takes the hit once.`,
      detail: touches.map(t => `${t.file}:${t.line} ${t.lock}`).join('\n'),
    });
  }

  return findings;
}

// ---------------------------------------------------------------------------
// SQ003 — work created, then thrown away
// ---------------------------------------------------------------------------

function findWastedWork(files: FileRecord[]): SequenceFinding[] {
  const created: CreatedObject[] = [];
  const rewrites: Rewrite[] = [];

  for (const file of files) {
    for (const s of file.statements) {
      created.push(...createdObjectsOf(s.stmt, s.sql, file.name, file.index));
      rewrites.push(...rewritesOf(s.stmt, file.name, file.index));
    }
  }

  // Group by the file that does the rewriting, so one rewrite reports once.
  const grouped = new Map<string, { rewrite: Rewrite; wasted: CreatedObject[] }>();

  for (const rewrite of rewrites) {
    const wasted = created.filter(c => c.table === rewrite.table && c.fileIndex < rewrite.fileIndex);
    if (wasted.length === 0) continue;

    const key = `${rewrite.file}::${rewrite.table}::${rewrite.cause}`;
    const existing = grouped.get(key);
    if (existing) {
      for (const w of wasted) {
        if (!existing.wasted.some(e => e.name === w.name && e.file === w.file)) existing.wasted.push(w);
      }
    } else {
      grouped.set(key, { rewrite, wasted });
    }
  }

  return [...grouped.values()].map(({ rewrite, wasted }) => {
    const sourceFiles = [...new Set(wasted.map(w => w.file))];
    const names = wasted.map(w => `${w.kind} ${w.name}`).join(', ');

    return {
      id: 'SQ003',
      name: SEQUENCE_CHECKS.SQ003.name,
      severity: 'warning' as Severity,
      table: rewrite.table,
      files: [...sourceFiles, rewrite.file],
      message: `${names} — built on "${rewrite.table}" in ${sourceFiles.join(', ')}, then ${rewrite.cause} in "${rewrite.file}". The build is paid for twice; move it after the rewrite.`,
      detail: wasted.map(w => `${w.file}: ${w.kind} ${w.name} on ${w.table}`).join('\n'),
    };
  });
}

// ---------------------------------------------------------------------------
// SQ004 — ordering hazards
// ---------------------------------------------------------------------------

function findOrderingHazards(files: FileRecord[]): SequenceFinding[] {
  const migrationFiles = buildMigrationFiles(files.map(f => ({
    path: f.path,
    createdTables: f.createdTables,
    referencedTables: f.referencedTables,
  })));

  return findMissingDependencies(migrationFiles).map(issue => ({
    id: 'SQ004' as const,
    name: SEQUENCE_CHECKS.SQ004.name,
    severity: 'critical' as Severity,
    files: issue.files,
    message: `${issue.message} — applied in order, this migration fails.`,
  }));
}

// ---------------------------------------------------------------------------
// AST helpers
// ---------------------------------------------------------------------------

/** Tables this statement brings into existence. */
function createdTablesOf(stmt: Record<string, unknown>): string[] {
  if ('CreateStmt' in stmt) {
    const create = stmt.CreateStmt as { relation?: { relname?: string } };
    return create.relation?.relname ? [create.relation.relname] : [];
  }

  if ('CreateTableAsStmt' in stmt) {
    const into = (stmt.CreateTableAsStmt as { into?: { rel?: { relname?: string } } }).into;
    return into?.rel?.relname ? [into.rel.relname] : [];
  }

  return [];
}

/** Tables referenced by a foreign key, which `extractTargets` does not follow. */
function foreignKeyTables(stmt: Record<string, unknown>): string[] {
  const tables: string[] = [];

  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }

    const record = node as Record<string, unknown>;
    const constraint = record.Constraint as { contype?: string; pktable?: { relname?: string } } | undefined;
    if (constraint?.contype === 'CONSTR_FOREIGN' && constraint.pktable?.relname) {
      tables.push(constraint.pktable.relname);
    }

    for (const value of Object.values(record)) walk(value);
  };

  walk(stmt);
  return [...new Set(tables)];
}

/** Tables touched by data statements — `extractTargets` only covers DDL. */
function dmlTables(stmt: Record<string, unknown>): string[] {
  for (const key of ['InsertStmt', 'UpdateStmt', 'DeleteStmt'] as const) {
    if (key in stmt) {
      const relation = (stmt[key] as { relation?: { relname?: string } }).relation;
      if (relation?.relname) return [relation.relname];
    }
  }
  return [];
}

/** Indexes and constraints this statement builds. */
function createdObjectsOf(
  stmt: Record<string, unknown>,
  sql: string,
  file: string,
  fileIndex: number,
): CreatedObject[] {
  if ('IndexStmt' in stmt) {
    const idx = stmt.IndexStmt as { idxname?: string; relation?: { relname?: string } };
    const table = idx.relation?.relname;
    if (!table) return [];
    return [{ kind: 'index', name: idx.idxname ?? '(unnamed)', table, file, fileIndex }];
  }

  if ('AlterTableStmt' in stmt) {
    const alter = stmt.AlterTableStmt as {
      relation?: { relname?: string };
      cmds?: Array<{ AlterTableCmd: { subtype: string; def?: { Constraint?: { conname?: string } } } }>;
    };
    const table = alter.relation?.relname;
    if (!table || !alter.cmds) return [];

    return alter.cmds
      .filter(c => c.AlterTableCmd.subtype === 'AT_AddConstraint')
      .map(c => ({
        kind: 'constraint' as const,
        name: c.AlterTableCmd.def?.Constraint?.conname
          ?? sql.match(/ADD\s+CONSTRAINT\s+(\w+)/i)?.[1]
          ?? '(unnamed)',
        table,
        file,
        fileIndex,
      }));
  }

  return [];
}

/** Statements that rewrite or destroy a whole table. */
function rewritesOf(stmt: Record<string, unknown>, file: string, fileIndex: number): Rewrite[] {
  const make = (table: string, cause: string): Rewrite => ({ table, file, fileIndex, cause });

  if ('AlterTableStmt' in stmt) {
    const alter = stmt.AlterTableStmt as {
      relation?: { relname?: string };
      cmds?: Array<{ AlterTableCmd: { subtype: string } }>;
    };
    const table = alter.relation?.relname;
    if (!table || !alter.cmds) return [];

    for (const cmd of alter.cmds) {
      const subtype = cmd.AlterTableCmd.subtype;
      if (subtype === 'AT_AlterColumnType') return [make(table, 'rewritten by an ALTER COLUMN TYPE')];
      if (subtype === 'AT_SetLogged' || subtype === 'AT_SetUnLogged') return [make(table, 'rewritten by a persistence change')];
    }
    return [];
  }

  if ('VacuumStmt' in stmt) {
    const vacuum = stmt.VacuumStmt as { options?: Array<{ DefElem?: { defname?: string } }> };
    if (!vacuum.options?.some(o => o.DefElem?.defname === 'full')) return [];
    return extractTargets(stmt).map(t => make(t.tableName, 'rewritten by a VACUUM FULL'));
  }

  if ('ClusterStmt' in stmt) {
    const table = (stmt.ClusterStmt as { relation?: { relname?: string } }).relation?.relname;
    return table ? [make(table, 'rewritten by a CLUSTER')] : [];
  }

  if ('DropStmt' in stmt) {
    const drop = stmt.DropStmt as { removeType?: string };
    if (drop.removeType !== 'OBJECT_TABLE') return [];
    return extractTargets(stmt).map(t => make(t.tableName, 'dropped'));
  }

  return [];
}

// ---------------------------------------------------------------------------
// Formatting helpers shared with the report writer
// ---------------------------------------------------------------------------

/** Seconds as a short human string: "45s", "2m 30s", "1h 5m". */
export function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${round(seconds)}s`;
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const rest = Math.round(seconds % 60);
    return rest > 0 ? `${minutes}m ${rest}s` : `${minutes}m`;
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * One-line preview of a statement. The parser hands back everything since the
 * previous semicolon, so a statement introduced by a comment block would
 * otherwise show the comment instead of the SQL.
 */
function preview(sql: string, max = 60): string {
  const flat = sql.replace(/^(?:[ \t]*--[^\n]*\n)+/, '').replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 3)}...` : flat;
}
