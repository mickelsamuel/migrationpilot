/**
 * Migration simulation against an ephemeral in-process PostgreSQL.
 *
 * Static analysis reads a migration. This runs it. Every run gets a brand new
 * PGlite instance — a full PostgreSQL compiled to WASM, living in memory for
 * the length of the command and discarded afterwards. Nothing touches disk,
 * nothing touches a network, and no two runs can contaminate each other.
 *
 * What that buys, which no amount of AST inspection can: the server's own
 * verdict. `CREATE INDEX CONCURRENTLY` inside a transaction fails here for the
 * same reason it fails in production, with the same error text and the same
 * SQLSTATE. A cast PostgreSQL refuses to make is refused here. A statement that
 * references a column an earlier migration forgot to add errors out, in order,
 * at the exact statement that depends on it.
 *
 * What it emphatically does not buy is production behaviour. PGlite is a single
 * connection, so nothing can ever be blocked by anything; and the tables are
 * empty, so every rewrite is instant. Those two facts are why `simulate` merges
 * the static report rather than replacing it, and why `limits` is a field of
 * the report rather than a footnote someone can drop on the way to a dashboard.
 */

import { splitStatements } from './split.js';
import type { SplitStatement } from './split.js';
import { snapshotSchema, detectEngineVersion } from './introspect.js';
import type { QueryableDb, EngineVersion } from './introspect.js';
import { diffSchemas } from '../drift/compare.js';
import type { SchemaDiff } from '../drift/compare.js';
import { analyzeTransactions } from '../analysis/transaction.js';
import type { AnalysisOutput } from '../output/cli.js';

/** A PostgreSQL error, field by field, as the server reported it. */
export interface PgErrorInfo {
  /** The server's message, verbatim. Never reworded. */
  message: string;
  /** SQLSTATE, e.g. '25001'. */
  code: string | null;
  severity: string | null;
  detail: string | null;
  hint: string | null;
  /** 1-based character position within the statement, when the server gave one. */
  position: number | null;
  /** Server routine that raised it — useful when reporting a PGlite bug upstream. */
  routine: string | null;
}

export type StatementStatus = 'ok' | 'error' | 'not-run';

export interface SimulatedStatement {
  /** 1-based position within its migration file. */
  index: number;
  /** 1-based line in the source file. */
  line: number;
  sql: string;
  status: StatementStatus;
  /** Wall-clock milliseconds. 0 for statements that never ran. */
  durationMs: number;
  /** Rows the server reported as affected, when it reported any. */
  rowsAffected: number | null;
  /** Rows returned, for statements that return a result set. */
  rowsReturned: number | null;
  error: PgErrorInfo | null;
}

/** State the session was left in once a migration finished or gave up. */
export type TransactionState = 'none' | 'open' | 'aborted';

export interface StaticReport {
  /** Full static analysis, or null when the file could not be parsed. */
  analysis: AnalysisOutput | null;
  /** Parse failure from the static pipeline, verbatim. */
  error: string | null;
  /** PostgreSQL version the static rules were evaluated against. */
  pgVersion: number;
}

export interface SimulationReport {
  file: string;
  engine: EngineVersion;
  /** Path of the `--baseline` schema loaded before anything ran, if any. */
  baselinePath: string | null;
  /** Schema introspected for the diff. */
  schema: string;
  statements: SimulatedStatement[];
  /** How many statements actually ran, successfully or not. */
  executed: number;
  /** 1-based index of the statement that failed, or null. */
  failedIndex: number | null;
  /** Sum of statement durations for this file. */
  totalDurationMs: number;
  /** Milliseconds spent booting PostgreSQL. Excluded from statement timings. */
  bootMs: number;
  /** Catalog changes this file made, on top of whatever ran before it. */
  diff: SchemaDiff;
  transactionState: TransactionState;
  /** True when libpg-query rejected the file and the raw splitter ran. */
  splitFallback: boolean;
  parseErrors: string[];
  static: StaticReport | null;
  /** What this run cannot tell you. Part of the report, not a footnote. */
  limits: string[];
}

export interface SimulationRun {
  engine: EngineVersion;
  baselinePath: string | null;
  schema: string;
  /** Milliseconds spent booting PostgreSQL, once for the whole run. */
  bootMs: number;
  /** One report per migration that ran, in order. */
  reports: SimulationReport[];
  /** Migrations that never ran because an earlier one failed. */
  notRun: string[];
  /** True when any migration hit a statement error. */
  failed: boolean;
}

export interface MigrationInput {
  /** Display path. */
  file: string;
  sql: string;
  /** Static analysis for this file, merged into its report. */
  static?: StaticReport | null;
}

export interface SimulateOptions {
  migrations: MigrationInput[];
  /** Baseline schema loaded before any migration runs. */
  baseline?: { path: string; sql: string };
  /** Schema to introspect for diffs. Defaults to 'public'. */
  schema?: string;
}

/** Thrown when the `--baseline` schema itself fails to load. */
export class BaselineError extends Error {
  path: string;
  pgError: PgErrorInfo;

  constructor(path: string, pgError: PgErrorInfo) {
    super(`Baseline schema ${path} failed to load: ${pgError.message}`);
    this.name = 'BaselineError';
    this.path = path;
    this.pgError = pgError;
  }
}

/** The npm name of the optional engine, in one place. */
export const ENGINE_PACKAGE = '@electric-sql/pglite';

/** What to tell someone who does not have the engine installed. */
export const ENGINE_INSTALL_HINT = `simulate needs the optional PGlite engine — run: npm install ${ENGINE_PACKAGE}`;

/**
 * Thrown when the PostgreSQL engine cannot be loaded.
 *
 * PGlite is an optional peer dependency: it is 25 MB unpacked, and most people
 * reach MigrationPilot through a one-shot `npx` run of `analyze` or `check`
 * that never needs it. Simulating is opt-in, so the engine is too — which means
 * "you haven't installed it yet" is an ordinary outcome that deserves a
 * sentence, not a stack trace.
 */
export class EngineUnavailableError extends Error {
  /** `not-installed` when the package is absent; `load-failed` when it is present but broke. */
  reason: 'not-installed' | 'load-failed';
  /** The underlying failure, for the load-failed case. */
  override cause: unknown;

  constructor(reason: 'not-installed' | 'load-failed', cause: unknown) {
    super(reason === 'not-installed'
      ? ENGINE_INSTALL_HINT
      : `Failed to load ${ENGINE_PACKAGE}: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'EngineUnavailableError';
    this.reason = reason;
    this.cause = cause;
  }
}

/**
 * Tell "the package isn't installed" apart from "the package is installed and
 * threw on load".
 *
 * Node reports the first as `ERR_MODULE_NOT_FOUND` from an ESM import and
 * `MODULE_NOT_FOUND` from a CJS require; esbuild emits the CJS form in the
 * bundled CLI and the ESM form under tsx, so both have to be recognised. The
 * message check is a backstop for bundlers that drop the code.
 */
function isMissingModule(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  if (code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND') return true;
  const message = err instanceof Error ? err.message : '';
  return /cannot find (?:module|package)/i.test(message) && message.includes(ENGINE_PACKAGE);
}

/**
 * Load the engine, or explain why it could not be loaded.
 *
 * The import is dynamic so that no other command pays for a 16 MB WASM read,
 * and so that a missing optional dependency surfaces here rather than at
 * startup for people who never run `simulate`.
 */
async function loadEngine(): Promise<{ new (): unknown }> {
  try {
    const { PGlite } = await import('@electric-sql/pglite');
    return PGlite as unknown as { new (): unknown };
  } catch (err) {
    throw new EngineUnavailableError(isMissingModule(err) ? 'not-installed' : 'load-failed', err);
  }
}

/** The subset of PGlite the simulator drives. */
interface SimulationDb extends QueryableDb {
  exec(sql: string): Promise<Array<{ rows: unknown[]; affectedRows?: number }>>;
  close(): Promise<void>;
}

/**
 * `diffSchemas` takes the drift module's own snapshot interface, which it does
 * not export. The shapes are identical by construction — see `introspect.ts` —
 * so this alias documents the structural match instead of duplicating the diff.
 */
type SchemaSnapshotArg = Parameters<typeof diffSchemas>[0];

/**
 * Run migrations against one fresh ephemeral PostgreSQL and report what happened.
 *
 * Migrations run in the order given, against the same database, because that is
 * how they will run in production: migration 7 gets to see what migration 3
 * did, including the column migration 3 forgot to add.
 *
 * Execution stops at the first error. Everything after it would either not run
 * at all, or run against a database in a state the author never intended, so
 * reporting the rest as "not run" is the only honest answer available.
 */
export async function simulate(options: SimulateOptions): Promise<SimulationRun> {
  const schema = options.schema ?? 'public';

  const PGlite = await loadEngine();

  const bootStart = performance.now();
  const db = new PGlite() as SimulationDb;
  await (db as unknown as { waitReady: Promise<void> }).waitReady;
  const bootMs = performance.now() - bootStart;

  try {
    const engine = await detectEngineVersion(db);

    if (options.baseline) {
      try {
        await db.exec(options.baseline.sql);
      } catch (err) {
        throw new BaselineError(options.baseline.path, toPgError(err));
      }
    }

    const reports: SimulationReport[] = [];
    const notRun: string[] = [];
    let failed = false;

    for (const migration of options.migrations) {
      if (failed) {
        notRun.push(migration.file);
        continue;
      }

      const report = await simulateOne(db, migration, {
        engine,
        schema,
        bootMs,
        baselinePath: options.baseline?.path ?? null,
      });
      reports.push(report);
      if (report.failedIndex !== null) failed = true;
    }

    return {
      engine,
      baselinePath: options.baseline?.path ?? null,
      schema,
      bootMs,
      reports,
      notRun,
      failed,
    };
  } finally {
    await db.close();
  }
}

interface RunContext {
  engine: EngineVersion;
  schema: string;
  bootMs: number;
  baselinePath: string | null;
}

async function simulateOne(
  db: SimulationDb,
  migration: MigrationInput,
  context: RunContext,
): Promise<SimulationReport> {
  const split = await splitStatements(migration.sql);
  const before = await snapshotSchema(db, context.schema);
  const statements = await execute(db, split.statements);
  const executed = statements.filter(s => s.status !== 'not-run').length;
  const failed = statements.find(s => s.status === 'error') ?? null;

  const transactionState = await resolveTransactionState(db, split.statements.slice(0, executed));
  const after = await snapshotSchema(db, context.schema);

  const report: SimulationReport = {
    file: migration.file,
    engine: context.engine,
    baselinePath: context.baselinePath,
    schema: context.schema,
    statements,
    executed,
    failedIndex: failed?.index ?? null,
    totalDurationMs: statements.reduce((sum, s) => sum + s.durationMs, 0),
    bootMs: context.bootMs,
    diff: diffSchemas(before as SchemaSnapshotArg, after as SchemaSnapshotArg),
    transactionState,
    splitFallback: split.fallback,
    parseErrors: split.parseErrors,
    static: migration.static ?? null,
    limits: [],
  };
  report.limits = buildLimits(report);
  return report;
}

/**
 * Execute statements one at a time, stopping at the first error.
 *
 * `exec` rather than `query` is deliberate: it speaks the simple query
 * protocol, the same one psql uses. The extended protocol wraps each statement
 * in an implicit transaction, which would make every `CREATE INDEX
 * CONCURRENTLY` fail regardless of how the migration was written — turning the
 * single most valuable runtime check into a guaranteed false positive.
 */
async function execute(db: SimulationDb, statements: SplitStatement[]): Promise<SimulatedStatement[]> {
  const results: SimulatedStatement[] = [];
  let stopped = false;

  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i];
    if (!statement) continue;

    if (stopped) {
      results.push({
        index: i + 1,
        line: statement.line,
        sql: statement.sql,
        status: 'not-run',
        durationMs: 0,
        rowsAffected: null,
        rowsReturned: null,
        error: null,
      });
      continue;
    }

    const start = performance.now();
    try {
      const execResults = await db.exec(statement.sql);
      const durationMs = performance.now() - start;
      const last = execResults[execResults.length - 1];
      results.push({
        index: i + 1,
        line: statement.line,
        sql: statement.sql,
        status: 'ok',
        durationMs,
        rowsAffected: last?.affectedRows ?? null,
        rowsReturned: last?.rows.length ?? null,
        error: null,
      });
    } catch (err) {
      results.push({
        index: i + 1,
        line: statement.line,
        sql: statement.sql,
        status: 'error',
        durationMs: performance.now() - start,
        rowsAffected: null,
        rowsReturned: null,
        error: toPgError(err),
      });
      stopped = true;
    }
  }

  return results;
}

/**
 * Work out what state the session was left in, and clear it so the closing
 * snapshot can be taken.
 *
 * An aborted transaction is detected by asking the server — every subsequent
 * command in one fails with 25P02, the introspection queries included. An open
 * but healthy transaction is detected from the statements themselves, reusing
 * the BEGIN/COMMIT tracking the static pipeline already does.
 *
 * The `ROLLBACK` is not tidiness. If the migration died inside a transaction,
 * production would roll every one of those statements back, so the schema diff
 * has to be taken after the rollback or it would report changes that never
 * survived.
 */
async function resolveTransactionState(db: SimulationDb, executed: SplitStatement[]): Promise<TransactionState> {
  let aborted = false;
  try {
    await db.exec('SELECT 1');
  } catch {
    aborted = true;
  }

  if (aborted) {
    await db.exec('ROLLBACK').catch(() => { /* nothing to roll back is fine */ });
    return 'aborted';
  }

  const tx = analyzeTransactions(
    executed.map(s => ({ stmt: s.stmt, originalSql: s.sql, line: s.line })),
  );
  return tx.blocks.some(b => b.endIndex === -1) ? 'open' : 'none';
}

/**
 * Normalise a thrown value into PostgreSQL's own error fields.
 *
 * PGlite rethrows the server's ErrorResponse with its fields intact, so the
 * message here is the server's message — not a paraphrase, and not something
 * MigrationPilot composed.
 */
export function toPgError(err: unknown): PgErrorInfo {
  if (err instanceof Error) {
    const fields = err as Error & Record<string, unknown>;
    return {
      message: err.message,
      code: str(fields.code),
      severity: str(fields.severity),
      detail: str(fields.detail),
      hint: str(fields.hint),
      position: num(fields.position),
      routine: str(fields.routine),
    };
  }
  return {
    message: String(err),
    code: null,
    severity: null,
    detail: null,
    hint: null,
    position: null,
    routine: null,
  };
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function num(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * The standing caveats, plus whatever this particular run has to admit to.
 *
 * Generated from the report rather than written only into the docs, so they
 * travel with `--format json` into whatever consumes it.
 */
export function buildLimits(report: SimulationReport): string[] {
  const limits = [
    'Single connection: lock CONTENTION cannot be observed here. Nothing queued behind anything, because there was no second session to queue. Lock conflicts are what the static lock analysis is for.',
    'Timings are not production-representative. Tables here hold only what this run put in them, so size-dependent work — table rewrites, index builds, constraint validation — finishes in milliseconds no matter how long it would take on real data.',
    `PostgreSQL ${report.engine.serverVersion} (PGlite ${report.engine.pglite}): which syntax executes follows the version PGlite bundles, not the --pg-version the static rules used. Syntax newer than this engine fails here even if your production server would accept it.`,
    'WASM build: planner costs, I/O behaviour and available extensions differ from a native server. A missing extension here says nothing about production.',
  ];

  const staticPgVersion = report.static?.pgVersion;
  if (staticPgVersion && report.engine.serverMajor > 0 && staticPgVersion !== report.engine.serverMajor) {
    limits.push(
      `Version split in this run: static rules targeted PostgreSQL ${staticPgVersion}, execution ran on ${report.engine.serverVersion}. Version-specific behaviour is reported by whichever half saw it.`,
    );
  }

  if (report.splitFallback) {
    limits.push(
      'The static parser rejected this file, so statements were split from the raw text rather than from a parse tree. Execution is unaffected — PostgreSQL did its own parsing — but the statement boundaries shown came from MigrationPilot.',
    );
  }

  if (report.transactionState === 'open') {
    limits.push(
      'The migration ended inside an open transaction (BEGIN with no COMMIT). The schema changes reported are what the transaction would have committed; as written, the session ending discards them.',
    );
  }

  if (report.transactionState === 'aborted') {
    limits.push(
      'The migration failed inside a transaction, so every statement in that transaction was rolled back. The schema changes reported are only those committed before the transaction opened.',
    );
  }

  return limits;
}
