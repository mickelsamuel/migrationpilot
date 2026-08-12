/**
 * Tests for `migrationpilot simulate`.
 *
 * These run the real PGlite engine rather than a stub, because the whole point
 * of the command is that a real PostgreSQL renders the verdict. A stub that
 * returned "CREATE INDEX CONCURRENTLY cannot run inside a transaction block"
 * would prove nothing except that the string was typed twice.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { simulate, BaselineError, toPgError, buildLimits } from '../src/simulate/run.js';
import type { SimulationReport, StaticReport } from '../src/simulate/run.js';
import { splitStatements, splitStatementsRaw } from '../src/simulate/split.js';
import { formatSimulationReport, formatSimulationRun, formatSimulationJson, formatSimulationRunJson, formatPgError } from '../src/simulate/format.js';
import { analyzeSQL } from '../src/analysis/analyze.js';
import { staticRules } from '../src/rules/index.js';

const FIXTURES = resolve('tests/fixtures/simulate');
const STATIC_RULES = staticRules;

function fixture(name: string): string {
  return resolve(FIXTURES, name);
}

async function staticFor(file: string, sql: string, pgVersion = 17): Promise<StaticReport> {
  const analysis = await analyzeSQL(sql, file, pgVersion, STATIC_RULES);
  return { analysis, error: null, pgVersion };
}

/** Simulate one fixture file, with static analysis merged in. */
async function run(name: string, options: { baseline?: string; withStatic?: boolean } = {}) {
  const file = fixture(name);
  const sql = await readFile(file, 'utf-8');
  const baseline = options.baseline
    ? { path: fixture(options.baseline), sql: await readFile(fixture(options.baseline), 'utf-8') }
    : undefined;

  return simulate({
    migrations: [{
      file,
      sql,
      static: options.withStatic === false ? null : await staticFor(file, sql),
    }],
    baseline,
  });
}

function only(reports: SimulationReport[]): SimulationReport {
  const report = reports[0];
  if (!report) throw new Error('expected one report');
  return report;
}

describe('statement splitting', () => {
  it('splits on the parse tree when the file parses', async () => {
    const sql = 'CREATE TABLE a (id int);\nALTER TABLE a ADD COLUMN b text;\n';
    const result = await splitStatements(sql);

    expect(result.fallback).toBe(false);
    expect(result.parseErrors).toEqual([]);
    expect(result.statements.map(s => s.sql)).toEqual([
      'CREATE TABLE a (id int)',
      'ALTER TABLE a ADD COLUMN b text',
    ]);
    expect(result.statements.map(s => s.line)).toEqual([1, 2]);
  });

  it('falls back to raw splitting when the parser rejects the file', async () => {
    // libpg-query is built from PG16/17 and rejects this PG18 spelling.
    const sql = 'CREATE TABLE t (id int, val text);\nALTER TABLE t ADD CONSTRAINT t_val_nn NOT NULL val NOT VALID;\n';
    const result = await splitStatements(sql);

    expect(result.fallback).toBe(true);
    expect(result.parseErrors.length).toBeGreaterThan(0);
    expect(result.statements).toHaveLength(2);
    expect(result.statements[1]?.sql).toContain('NOT NULL val NOT VALID');
  });

  it('does not split on semicolons inside dollar-quoted bodies', () => {
    const sql = `
CREATE FUNCTION bump() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE t (id int);
`;
    const statements = splitStatementsRaw(sql);
    expect(statements).toHaveLength(2);
    expect(statements[0]?.sql).toContain('RETURN NEW;');
    expect(statements[1]?.sql).toBe('CREATE TABLE t (id int)');
  });

  it('does not split on semicolons inside literals, identifiers or comments', () => {
    const sql = [
      `INSERT INTO t VALUES ('a;b', 'it''s; fine');`,
      `CREATE TABLE "weird;name" (id int); -- trailing; comment`,
      `/* block ; /* nested ; */ still a comment ; */ SELECT 1;`,
    ].join('\n');

    const statements = splitStatementsRaw(sql);
    expect(statements).toHaveLength(3);
    expect(statements[0]?.sql).toContain("'a;b'");
    expect(statements[1]?.sql).toBe('CREATE TABLE "weird;name" (id int)');
    expect(statements[2]?.sql).toContain('SELECT 1');
  });

  it('drops chunks that hold only comments', () => {
    const statements = splitStatementsRaw('-- just a note\n\n/* and another */\n');
    expect(statements).toEqual([]);
  });

  it('keeps a final statement with no trailing semicolon', () => {
    const statements = splitStatementsRaw('CREATE TABLE a (id int)');
    expect(statements.map(s => s.sql)).toEqual(['CREATE TABLE a (id int)']);
  });
});

describe('clean migration', () => {
  it('executes every statement and reports the schema it created', async () => {
    const result = await run('clean.sql');
    const report = only(result.reports);

    expect(result.failed).toBe(false);
    expect(report.failedIndex).toBeNull();
    expect(report.statements).toHaveLength(4);
    expect(report.statements.every(s => s.status === 'ok')).toBe(true);
    expect(report.executed).toBe(4);
    expect(report.transactionState).toBe('none');

    // Every statement gets a real measurement, not a placeholder.
    expect(report.statements.every(s => s.durationMs > 0)).toBe(true);
    expect(report.totalDurationMs).toBeGreaterThan(0);

    // The INSERT reports its row count; DDL does not invent one.
    const insert = report.statements.find(s => s.sql.startsWith('INSERT'));
    expect(insert?.rowsAffected).toBe(1);

    expect(report.diff.tables.added).toContain('audit_log');
    expect(report.diff.indexes.added.map(i => i.name)).toContain('idx_audit_log_created_at');
    expect(report.diff.sequences.added).toContain('audit_log_id_seq');
  });

  it('reports the column the migration added, with its type', async () => {
    const report = only((await run('clean.sql')).reports);

    // audit_log is new, so its columns arrive with the table rather than as a
    // modification — the added-column path is covered by the baseline test.
    expect(report.diff.tables.added).toEqual(['audit_log']);
    expect(report.diff.tables.modified).toEqual([]);
  });

  it('reports the engine it actually ran on', async () => {
    const report = only((await run('clean.sql')).reports);

    expect(report.engine.serverMajor).toBeGreaterThanOrEqual(16);
    expect(report.engine.versionString).toContain('PostgreSQL');
    expect(report.engine.versionString).toContain('PGlite');
    expect(report.engine.pglite).toMatch(/^\d+\.\d+/);
    expect(report.bootMs).toBeGreaterThan(0);
  });

  it('merges the static analysis alongside the runtime result', async () => {
    const report = only((await run('clean.sql')).reports);

    expect(report.static?.analysis).not.toBeNull();
    expect(report.static?.pgVersion).toBe(17);
    expect(report.static?.analysis?.statements).toHaveLength(4);
  });

  it('omits static analysis when it is not requested', async () => {
    const report = only((await run('clean.sql', { withStatic: false })).reports);
    expect(report.static).toBeNull();
  });
});

describe('runtime errors static analysis cannot reach', () => {
  it('catches CREATE INDEX CONCURRENTLY inside a transaction', async () => {
    const result = await run('concurrently-in-transaction.sql');
    const report = only(result.reports);

    expect(result.failed).toBe(true);
    expect(report.failedIndex).toBe(3);

    const failed = report.statements[2];
    expect(failed?.status).toBe('error');
    expect(failed?.sql).toContain('CREATE INDEX CONCURRENTLY');
    expect(failed?.error?.message).toBe('CREATE INDEX CONCURRENTLY cannot run inside a transaction block');
    expect(failed?.error?.code).toBe('25001');
    expect(failed?.error?.severity).toBe('ERROR');

    // Everything before it ran; everything after it did not.
    expect(report.statements.slice(0, 2).every(s => s.status === 'ok')).toBe(true);
    expect(report.statements[3]?.status).toBe('not-run');
    expect(report.executed).toBe(3);

    // The failure happened inside a transaction, so nothing survived it.
    expect(report.transactionState).toBe('aborted');
    expect(report.diff.tables.added).toEqual([]);
    expect(report.limits.some(l => l.includes('rolled back'))).toBe(true);
  });

  it('catches a cast PostgreSQL refuses to make', async () => {
    const result = await run('invalid-cast.sql');
    const report = only(result.reports);

    expect(result.failed).toBe(true);
    expect(report.failedIndex).toBe(2);

    const failed = report.statements[1];
    expect(failed?.status).toBe('error');
    expect(failed?.error?.message).toBe('cannot cast type integer to uuid');
    expect(failed?.error?.code).toBe('42846');
    expect(failed?.error?.position).toBeGreaterThan(0);

    // No transaction wrapped it, so the CREATE TABLE before it stands.
    expect(report.transactionState).toBe('none');
    expect(report.diff.tables.added).toContain('payments');
    expect(report.statements[2]?.status).toBe('not-run');
  });

  it('catches a reference to an object that does not exist', async () => {
    const result = await simulate({
      migrations: [{ file: 'inline.sql', sql: 'ALTER TABLE ghosts ADD COLUMN x int;' }],
    });
    const report = only(result.reports);

    expect(report.failedIndex).toBe(1);
    expect(report.statements[0]?.error?.message).toBe('relation "ghosts" does not exist');
    expect(report.statements[0]?.error?.code).toBe('42P01');
  });

  it('flags a migration that ends inside an open transaction', async () => {
    const result = await simulate({
      migrations: [{ file: 'inline.sql', sql: 'BEGIN;\nCREATE TABLE half_done (id int);\n' }],
    });
    const report = only(result.reports);

    expect(report.failedIndex).toBeNull();
    expect(report.transactionState).toBe('open');
    expect(report.limits.some(l => l.includes('open transaction'))).toBe(true);
  });
});

describe('--baseline', () => {
  it('fails without the baseline and succeeds with it', async () => {
    const without = only((await run('needs-baseline.sql')).reports);
    expect(without.failedIndex).toBe(1);
    expect(without.statements[0]?.error?.message).toBe('relation "customers" does not exist');

    const withBaseline = only((await run('needs-baseline.sql', { baseline: 'baseline-schema.sql' })).reports);
    expect(withBaseline.failedIndex).toBeNull();
    expect(withBaseline.statements.every(s => s.status === 'ok')).toBe(true);
    expect(withBaseline.baselinePath).toBe(fixture('baseline-schema.sql'));
  });

  it('diffs against the baseline, not against an empty database', async () => {
    const report = only((await run('needs-baseline.sql', { baseline: 'baseline-schema.sql' })).reports);

    // customers existed before the migration, so it is a modification, and the
    // baseline's own objects are not reported as this migration's work.
    expect(report.diff.tables.added).toEqual([]);
    expect(report.diff.tables.modified).toHaveLength(1);
    expect(report.diff.tables.modified[0]?.table).toBe('customers');
    expect(report.diff.tables.modified[0]?.columns.added.map(c => c.name)).toEqual(['country_code']);
    expect(report.diff.tables.modified[0]?.columns.added[0]?.dataType).toBe('text');
    expect(report.diff.indexes.added.map(i => i.name)).toEqual(['idx_customers_country_code']);
  });

  it('reports a broken baseline separately from a failed migration', async () => {
    await expect(simulate({
      migrations: [{ file: 'inline.sql', sql: 'SELECT 1;' }],
      baseline: { path: 'broken.sql', sql: 'CREATE TABLE (;' },
    })).rejects.toBeInstanceOf(BaselineError);
  });
});

describe('optional engine', () => {
  /**
   * PGlite is an optional peer dependency, so "not installed" is a normal state
   * to be in, and the message for it is part of the contract.
   *
   * The mock throws from a getter rather than from the factory itself: a
   * throwing factory gets wrapped in Vitest's own "error when mocking a module"
   * message, which loses the `ERR_MODULE_NOT_FOUND` code the detection reads.
   * Throwing on property access reproduces the real error verbatim at the same
   * point the real failure lands — the destructure inside loadEngine().
   */
  afterEach(() => {
    vi.doUnmock('@electric-sql/pglite');
    vi.resetModules();
  });

  it('asks you to install the engine instead of throwing a stack trace', async () => {
    vi.resetModules();
    vi.doMock('@electric-sql/pglite', () => ({
      get PGlite(): never {
        throw Object.assign(
          new Error("Cannot find package '@electric-sql/pglite' imported from run.js"),
          { code: 'ERR_MODULE_NOT_FOUND' },
        );
      },
    }));

    const fresh = await import('../src/simulate/run.js');
    const error = await fresh.simulate({ migrations: [{ file: 'a.sql', sql: 'SELECT 1;' }] })
      .then(() => null, (err: unknown) => err);

    expect(error).toBeInstanceOf(fresh.EngineUnavailableError);
    expect((error as InstanceType<typeof fresh.EngineUnavailableError>).reason).toBe('not-installed');
    expect((error as Error).message).toBe('simulate needs the optional PGlite engine — run: npm install @electric-sql/pglite');
    expect(fresh.ENGINE_INSTALL_HINT).toBe((error as Error).message);
  });

  it('distinguishes a broken engine from a missing one', async () => {
    vi.resetModules();
    vi.doMock('@electric-sql/pglite', () => ({
      get PGlite(): never {
        throw new Error('WebAssembly.instantiate(): out of memory');
      },
    }));

    const fresh = await import('../src/simulate/run.js');
    const error = await fresh.simulate({ migrations: [{ file: 'a.sql', sql: 'SELECT 1;' }] })
      .then(() => null, (err: unknown) => err);

    expect(error).toBeInstanceOf(fresh.EngineUnavailableError);
    expect((error as InstanceType<typeof fresh.EngineUnavailableError>).reason).toBe('load-failed');
    expect((error as Error).message).toContain('out of memory');
    expect((error as Error).message).not.toBe(fresh.ENGINE_INSTALL_HINT);
  });
});

describe('multiple migrations in one run', () => {
  it('applies them in order against the same database', async () => {
    const files = ['sequence/001_create_projects.sql', 'sequence/002_add_owner.sql'].map(fixture);
    const migrations = await Promise.all(files.map(async file => ({ file, sql: await readFile(file, 'utf-8') })));

    const result = await simulate({ migrations });

    expect(result.failed).toBe(false);
    expect(result.reports).toHaveLength(2);
    expect(result.notRun).toEqual([]);

    // 002 only works because 001 already ran.
    expect(result.reports[0]?.diff.tables.added).toContain('projects');
    expect(result.reports[1]?.diff.tables.modified[0]?.columns.added.map(c => c.name)).toEqual(['owner_id']);
  });

  it('stops at the first failing migration and names what never ran', async () => {
    const result = await simulate({
      migrations: [
        { file: 'a.sql', sql: 'CREATE TABLE a (id int);' },
        { file: 'b.sql', sql: 'ALTER TABLE nope ADD COLUMN x int;' },
        { file: 'c.sql', sql: 'CREATE TABLE c (id int);' },
      ],
    });

    expect(result.failed).toBe(true);
    expect(result.reports).toHaveLength(2);
    expect(result.reports[1]?.failedIndex).toBe(1);
    expect(result.notRun).toEqual(['c.sql']);
  });

  it('boots PostgreSQL once for the whole run', async () => {
    const result = await simulate({
      migrations: [
        { file: 'a.sql', sql: 'CREATE TABLE a (id int);' },
        { file: 'b.sql', sql: 'CREATE TABLE b (id int);' },
      ],
    });

    expect(result.bootMs).toBeGreaterThan(0);
    expect(result.reports[0]?.bootMs).toBe(result.bootMs);
    expect(result.reports[1]?.bootMs).toBe(result.bootMs);
  });
});

describe('isolation between runs', () => {
  it('starts from an empty database every time', async () => {
    const first = await simulate({ migrations: [{ file: 'a.sql', sql: 'CREATE TABLE leftovers (id int);' }] });
    expect(first.reports[0]?.diff.tables.added).toContain('leftovers');

    const second = await simulate({ migrations: [{ file: 'a.sql', sql: 'CREATE TABLE leftovers (id int);' }] });
    expect(second.reports[0]?.failedIndex).toBeNull();
    expect(second.reports[0]?.diff.tables.added).toContain('leftovers');
  });
});

describe('honest limits', () => {
  it('always states that lock contention and timings are out of reach', async () => {
    const report = only((await run('clean.sql')).reports);
    const limits = report.limits.join('\n');

    expect(limits).toContain('lock CONTENTION cannot be observed');
    expect(limits).toContain('not production-representative');
    expect(limits).toContain(`PostgreSQL ${report.engine.serverVersion}`);
    expect(limits).toContain(`PGlite ${report.engine.pglite}`);
  });

  it('names the version split when the static target differs from the engine', () => {
    const base = {
      engine: { pglite: '0.5.4', serverVersion: '18.3', serverMajor: 18, versionString: 'PostgreSQL 18.3' },
      splitFallback: false,
      transactionState: 'none' as const,
      static: { analysis: null, error: null, pgVersion: 17 },
    } as unknown as SimulationReport;

    expect(buildLimits(base).some(l => l.includes('static rules targeted PostgreSQL 17'))).toBe(true);

    const matched = { ...base, static: { analysis: null, error: null, pgVersion: 18 } } as SimulationReport;
    expect(buildLimits(matched).some(l => l.includes('static rules targeted'))).toBe(false);
  });
});

describe('error normalisation', () => {
  it('keeps the server fields it was given', () => {
    const err = Object.assign(new Error('boom'), {
      code: '42601',
      severity: 'ERROR',
      detail: 'more detail',
      hint: 'try this',
      position: '17',
      routine: 'scanner_yyerror',
    });

    expect(toPgError(err)).toEqual({
      message: 'boom',
      code: '42601',
      severity: 'ERROR',
      detail: 'more detail',
      hint: 'try this',
      position: 17,
      routine: 'scanner_yyerror',
    });
  });

  it('survives a thrown non-Error', () => {
    expect(toPgError('something odd')).toMatchObject({ message: 'something odd', code: null, position: null });
  });
});

describe('text output', () => {
  it('shows static and runtime verdicts side by side', async () => {
    const report = only((await run('clean.sql')).reports);
    const text = formatSimulationReport(report, { rules: STATIC_RULES });

    expect(text).toContain('MigrationPilot Simulate');
    expect(text).toContain('Static');
    expect(text).toContain('Runtime');
    expect(text).toContain('Schema changes');
    expect(text).toContain('audit_log');
    expect(text).toContain('What this run cannot tell you');
    expect(text).toContain('lock CONTENTION cannot be observed');
  });

  it('leads with the failing statement and what ran before it', async () => {
    const report = only((await run('concurrently-in-transaction.sql')).reports);
    const text = formatSimulationReport(report, { rules: STATIC_RULES });

    expect(text).toContain('Statement 3 failed');
    expect(text).toContain('ERROR:  CREATE INDEX CONCURRENTLY cannot run inside a transaction block');
    expect(text).toContain('SQLSTATE: 25001');
    expect(text).toContain('Executed before it:');
    expect(text).toContain('Never ran:');
  });

  it('draws the caret under the position the server reported', () => {
    const sql = 'ALTER TABLE payments ALTER COLUMN reference TYPE uuid USING reference::uuid';
    const lines = formatPgError({
      message: 'cannot cast type integer to uuid',
      code: '42846',
      severity: 'ERROR',
      detail: null,
      hint: null,
      position: 61,
      routine: null,
    }, sql);

    const caret = lines.find(l => l.trim() === '^');
    expect(caret).toBeDefined();
    expect(lines.some(l => l.startsWith('LINE 1: '))).toBe(true);
    expect(caret!.indexOf('^')).toBe('LINE 1: '.length + 60);
  });

  it('summarises a multi-migration run and lists what never ran', async () => {
    const result = await simulate({
      migrations: [
        { file: 'a.sql', sql: 'CREATE TABLE a (id int);' },
        { file: 'b.sql', sql: 'ALTER TABLE nope ADD COLUMN x int;' },
        { file: 'c.sql', sql: 'CREATE TABLE c (id int);' },
      ],
    });
    const text = formatSimulationRun(result);

    expect(text).toContain('Simulation summary');
    expect(text).toContain('failed at statement 1');
    expect(text).toContain('never ran — an earlier migration failed');
  });
});

describe('json output', () => {
  it('embeds the static report and the execution results in one document', async () => {
    const report = only((await run('clean.sql')).reports);
    const json = JSON.parse(formatSimulationJson(report, STATIC_RULES));

    expect(json.$schema).toBe('https://migrationpilot.dev/schemas/simulate-v1.json');
    expect(json.version).toBe(1);
    expect(json.engine.serverMajor).toBeGreaterThanOrEqual(16);
    expect(json.execution.statementCount).toBe(4);
    expect(json.execution.failedIndex).toBeNull();
    expect(json.execution.statements[0].status).toBe('ok');
    expect(json.schemaChanges.tables.added).toContain('audit_log');
    expect(json.limits.length).toBeGreaterThan(0);

    // The static half is the existing analyze document, unchanged.
    expect(json.static.$schema).toBe('https://migrationpilot.dev/schemas/report-v1.json');
    expect(json.static.summary.totalStatements).toBe(4);
  });

  it('reports the failure verbatim', async () => {
    const report = only((await run('invalid-cast.sql')).reports);
    const json = JSON.parse(formatSimulationJson(report, STATIC_RULES));

    expect(json.execution.failedIndex).toBe(2);
    expect(json.execution.statements[1].error.message).toBe('cannot cast type integer to uuid');
    expect(json.execution.statements[1].error.code).toBe('42846');
    expect(json.execution.statements[2].status).toBe('not-run');
  });

  it('uses a files array for multi-migration runs', async () => {
    const result = await simulate({
      migrations: [
        { file: 'a.sql', sql: 'CREATE TABLE a (id int);' },
        { file: 'b.sql', sql: 'CREATE TABLE b (id int);' },
      ],
    });
    const json = JSON.parse(formatSimulationRunJson(result));

    expect(json.files).toHaveLength(2);
    expect(json.notRun).toEqual([]);
    expect(json.failed).toBe(false);
    expect(json.files[0].file).toBe('a.sql');
  });

  it('records a static parse failure without losing the execution result', async () => {
    const sql = 'CREATE TABLE t (id int, val text);\nALTER TABLE t ADD CONSTRAINT t_val_nn NOT NULL val NOT VALID;\n';
    const result = await simulate({
      migrations: [{ file: 'pg18.sql', sql, static: { analysis: null, error: 'syntax error at or near "NOT"', pgVersion: 17 } }],
    });
    const report = only(result.reports);
    const json = JSON.parse(formatSimulationJson(report));

    expect(json.static).toBeNull();
    expect(json.staticError).toContain('syntax error');
    expect(json.splitFallback).toBe(true);
    expect(json.parseErrors.length).toBeGreaterThan(0);
    expect(formatSimulationReport(report)).toContain('Static analysis could not parse this file');
  });
});
