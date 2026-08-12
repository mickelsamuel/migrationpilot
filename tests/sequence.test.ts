import { describe, it, expect, beforeAll } from 'vitest';
import chalk from 'chalk';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  analyzeSequence,
  estimateLockSeconds,
  SEQUENCE_CHECKS,
  DEFAULT_LOCK_BUDGET_SECONDS,
} from '../src/sequence/analyze.js';
import { formatSequenceReport, buildSequenceJson } from '../src/sequence/format.js';
import { findMissingDependencies } from '../src/analysis/ordering.js';
import { classifyLock } from '../src/locks/classify.js';
import { parseMigration } from '../src/parser/parse.js';
import type { SequenceAnalysis, SequenceOptions } from '../src/sequence/analyze.js';
import type { MigrationFile } from '../src/analysis/ordering.js';

const FIXTURES = resolve('tests/fixtures/sequence');

beforeAll(() => {
  chalk.level = 0;
});

/** Build a sequence from [filename, sql] pairs, in the order given. */
function run(files: Array<[string, string]>, options?: SequenceOptions): Promise<SequenceAnalysis> {
  return analyzeSequence(files.map(([path, sql]) => ({ path, sql })), options);
}

function ids(analysis: SequenceAnalysis): string[] {
  return analysis.findings.map(f => f.id);
}

function find(analysis: SequenceAnalysis, id: string) {
  return analysis.findings.find(f => f.id === id);
}

describe('SQ001 — cumulative lock budget', () => {
  it('fires when blocking lock time on one table stacks past the budget', async () => {
    const analysis = await run([
      ['001_index.sql', 'CREATE INDEX idx_users_email ON users (email);'],
      ['002_type.sql', 'ALTER TABLE users ALTER COLUMN age TYPE bigint;'],
    ]);

    const finding = find(analysis, 'SQ001');
    expect(finding).toBeDefined();
    expect(finding!.table).toBe('users');
    expect(finding!.files).toEqual(['001_index.sql', '002_type.sql']);
    expect(finding!.message).toContain('locked for an estimated');
  });

  it('stays quiet for a single long-held statement — that is a per-statement rule', async () => {
    const analysis = await run([
      ['001_index.sql', 'CREATE INDEX idx_users_email ON users (email);'],
      ['002_other.sql', 'CREATE TABLE orders (id bigint);'],
    ]);

    expect(ids(analysis)).not.toContain('SQ001');
  });

  it('does not charge the budget for non-blocking work', async () => {
    const analysis = await run([
      ['001_index.sql', 'CREATE INDEX CONCURRENTLY idx_a ON users (email);'],
      ['002_index.sql', 'CREATE INDEX CONCURRENTLY idx_b ON users (age);'],
      ['003_index.sql', 'CREATE INDEX CONCURRENTLY idx_c ON users (id);'],
    ]);

    expect(ids(analysis)).not.toContain('SQ001');
    expect(analysis.blastRadius.totalEstimatedLockSeconds).toBe(0);
  });

  it('escalates to critical at three times the budget', async () => {
    const analysis = await run([
      ['001.sql', 'CREATE INDEX idx_a ON users (email);'],
      ['002.sql', 'ALTER TABLE users ALTER COLUMN age TYPE bigint;'],
      ['003.sql', 'ALTER TABLE users ADD CONSTRAINT chk CHECK (age >= 0);'],
    ]);

    expect(find(analysis, 'SQ001')!.severity).toBe('critical');
  });

  it('honours a custom lock budget', async () => {
    const files: Array<[string, string]> = [
      ['001.sql', 'CREATE INDEX idx_a ON users (email);'],
      ['002.sql', 'ALTER TABLE users ALTER COLUMN age TYPE bigint;'],
    ];

    expect(ids(await run(files, { lockBudgetSeconds: 600 }))).not.toContain('SQ001');
    expect(ids(await run(files, { lockBudgetSeconds: 10 }))).toContain('SQ001');
  });

  it('reports the thresholds it used', async () => {
    const analysis = await run([['001.sql', 'SELECT 1;']], { lockBudgetSeconds: 42, hotTableFileThreshold: 7 });
    expect(analysis.thresholds).toEqual({ lockBudgetSeconds: 42, hotTableFileThreshold: 7 });
  });
});

describe('SQ002 — hot table, touched by many files', () => {
  it('fires when three files take a blocking lock on one table', async () => {
    const analysis = await run([
      ['001.sql', 'ALTER TABLE users ADD COLUMN a text;'],
      ['002.sql', 'ALTER TABLE users ADD COLUMN b text;'],
      ['003.sql', 'ALTER TABLE users ADD COLUMN c text;'],
    ]);

    const finding = find(analysis, 'SQ002');
    expect(finding).toBeDefined();
    expect(finding!.table).toBe('users');
    expect(finding!.files).toHaveLength(3);
    expect(finding!.severity).toBe('warning');
  });

  it('stays quiet below the threshold', async () => {
    const analysis = await run([
      ['001.sql', 'ALTER TABLE users ADD COLUMN a text;'],
      ['002.sql', 'ALTER TABLE users ADD COLUMN b text;'],
    ]);

    expect(ids(analysis)).not.toContain('SQ002');
  });

  it('does not count creating a table as contending for it', async () => {
    const analysis = await run([
      ['001.sql', 'CREATE TABLE users (id bigint);'],
      ['002.sql', 'CREATE TABLE users_archive (id bigint);'],
      ['003.sql', 'ALTER TABLE users ADD COLUMN a text;'],
    ]);

    expect(ids(analysis)).not.toContain('SQ002');
  });

  it('honours a custom file threshold', async () => {
    const analysis = await run([
      ['001.sql', 'ALTER TABLE users ADD COLUMN a text;'],
      ['002.sql', 'ALTER TABLE users ADD COLUMN b text;'],
    ], { hotTableFileThreshold: 2 });

    expect(ids(analysis)).toContain('SQ002');
  });
});

describe('SQ003 — work created, then rewritten away', () => {
  it('flags an index built before a later rewrite of the same table', async () => {
    const analysis = await run([
      ['001_index.sql', 'CREATE INDEX CONCURRENTLY idx_users_email ON users (email);'],
      ['002_type.sql', 'ALTER TABLE users ALTER COLUMN age TYPE bigint;'],
    ]);

    const finding = find(analysis, 'SQ003');
    expect(finding).toBeDefined();
    expect(finding!.message).toContain('idx_users_email');
    expect(finding!.message).toContain('ALTER COLUMN TYPE');
    expect(finding!.files).toEqual(['001_index.sql', '002_type.sql']);
  });

  it('flags a constraint built before the table is dropped', async () => {
    const analysis = await run([
      ['001.sql', 'ALTER TABLE sessions ADD CONSTRAINT chk_expiry CHECK (expires_at IS NOT NULL);'],
      ['002.sql', 'DROP TABLE sessions;'],
    ]);

    const finding = find(analysis, 'SQ003');
    expect(finding).toBeDefined();
    expect(finding!.message).toContain('chk_expiry');
    expect(finding!.message).toContain('dropped');
  });

  it('flags work thrown away by a VACUUM FULL', async () => {
    const analysis = await run([
      ['001.sql', 'CREATE INDEX CONCURRENTLY idx_a ON users (email);'],
      ['002.sql', 'VACUUM FULL users;'],
    ]);

    expect(find(analysis, 'SQ003')!.message).toContain('VACUUM FULL');
  });

  it('stays quiet when the index is built after the rewrite', async () => {
    const analysis = await run([
      ['001_type.sql', 'ALTER TABLE users ALTER COLUMN age TYPE bigint;'],
      ['002_index.sql', 'CREATE INDEX CONCURRENTLY idx_users_email ON users (email);'],
    ]);

    expect(ids(analysis)).not.toContain('SQ003');
  });

  it('stays quiet when the rewrite hits a different table', async () => {
    const analysis = await run([
      ['001.sql', 'CREATE INDEX CONCURRENTLY idx_users_email ON users (email);'],
      ['002.sql', 'ALTER TABLE orders ALTER COLUMN total TYPE numeric(12,2);'],
    ]);

    expect(ids(analysis)).not.toContain('SQ003');
  });
});

describe('SQ004 — ordering hazards', () => {
  it('flags a file that uses a table a later file creates', async () => {
    const analysis = await run([
      ['001_alter.sql', 'ALTER TABLE audit_log ADD COLUMN request_id text;'],
      ['002_create.sql', 'CREATE TABLE audit_log (id bigint);'],
    ]);

    const finding = find(analysis, 'SQ004');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('critical');
    expect(finding!.message).toContain('audit_log');
    expect(finding!.message).toContain('applied in order, this migration fails');
  });

  it('follows foreign key references, not just the altered table', async () => {
    const analysis = await run([
      ['001_fk.sql', 'ALTER TABLE orders ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id);'],
      ['002_users.sql', 'CREATE TABLE users (id bigint PRIMARY KEY);'],
    ]);

    expect(find(analysis, 'SQ004')!.message).toContain('"users"');
  });

  it('follows data statements', async () => {
    const analysis = await run([
      ['001_seed.sql', "INSERT INTO settings (key, value) VALUES ('a', 'b');"],
      ['002_create.sql', 'CREATE TABLE settings (key text, value text);'],
    ]);

    expect(find(analysis, 'SQ004')!.message).toContain('settings');
  });

  it('stays quiet when the sequence is in the right order', async () => {
    const analysis = await run([
      ['001_create.sql', 'CREATE TABLE audit_log (id bigint);'],
      ['002_alter.sql', 'ALTER TABLE audit_log ADD COLUMN request_id text;'],
    ]);

    expect(ids(analysis)).not.toContain('SQ004');
  });

  it('stays quiet when a table is created and used in the same file', async () => {
    const analysis = await run([
      ['001.sql', 'CREATE TABLE audit_log (id bigint);\nCREATE INDEX CONCURRENTLY idx_audit ON audit_log (id);'],
      ['002.sql', 'CREATE TABLE other (id bigint);'],
    ]);

    expect(ids(analysis)).not.toContain('SQ004');
  });
});

describe('SQ005 — blast radius', () => {
  it('summarises every table the sequence touches', async () => {
    const analysis = await run([
      ['001.sql', 'CREATE TABLE users (id bigint);'],
      ['002.sql', 'ALTER TABLE users ALTER COLUMN id TYPE bigint;'],
      ['003.sql', 'CREATE INDEX CONCURRENTLY idx_orders ON orders (user_id);'],
    ]);

    const tables = analysis.blastRadius.tables.map(t => t.table);
    expect(tables).toContain('users');
    expect(tables).toContain('orders');

    const users = analysis.blastRadius.tables.find(t => t.table === 'users')!;
    expect(users.files).toEqual(['001.sql', '002.sql']);
    expect(users.worstLock).toBe('ACCESS EXCLUSIVE');
    expect(users.worstLockLongHeld).toBe(true);
    expect(users.estimatedLockSeconds).toBeGreaterThan(0);
    expect(users.operations).toContain('CREATE TABLE');
  });

  it('sorts the worst offender first and totals the lock time', async () => {
    const analysis = await run([
      ['001.sql', 'ALTER TABLE quiet ADD COLUMN a text;'],
      ['002.sql', 'ALTER TABLE loud ALTER COLUMN b TYPE bigint;'],
    ]);

    expect(analysis.blastRadius.tables[0]?.table).toBe('loud');
    expect(analysis.blastRadius.totalEstimatedLockSeconds).toBe(
      analysis.blastRadius.tables.reduce((sum, t) => sum + t.estimatedLockSeconds, 0),
    );
  });

  it('reports whether estimates are calibrated to real row counts', async () => {
    const files: Array<[string, string]> = [['001.sql', 'ALTER TABLE users ALTER COLUMN age TYPE bigint;']];

    expect((await run(files)).blastRadius.estimateBasis).toBe('heuristic');

    const measured = await run(files, { rowCounts: new Map([['users', 500]]) });
    expect(measured.blastRadius.estimateBasis).toBe('measured');
    // 500 rows rewrites in seconds, not the unmeasured one-minute default.
    expect(measured.blastRadius.totalEstimatedLockSeconds).toBeLessThan(DEFAULT_LOCK_BUDGET_SECONDS);
  });
});

describe('estimateLockSeconds', () => {
  async function lockSecondsFor(sql: string, rowCount?: number): Promise<number> {
    const { statements } = await parseMigration(sql);
    const stmt = statements[0]!.stmt;
    return estimateLockSeconds(stmt, classifyLock(stmt, 17), rowCount);
  }

  it('charges nothing for work that blocks nobody', async () => {
    expect(await lockSecondsFor('CREATE INDEX CONCURRENTLY idx ON users (email);')).toBe(0);
    expect(await lockSecondsFor("SET lock_timeout = '5s';")).toBe(0);
  });

  it('charges a fraction of a second for a catalog-only lock', async () => {
    expect(await lockSecondsFor('ALTER TABLE users ADD COLUMN a text;')).toBeLessThan(1);
  });

  it('charges a full minute for an unmeasured scan or rewrite', async () => {
    expect(await lockSecondsFor('ALTER TABLE users ALTER COLUMN age TYPE bigint;')).toBe(60);
    expect(await lockSecondsFor('CREATE INDEX idx ON users (email);')).toBe(60);
  });

  it('scales with row counts when they are known', async () => {
    const small = await lockSecondsFor('ALTER TABLE users ALTER COLUMN age TYPE bigint;', 1_000);
    const huge = await lockSecondsFor('ALTER TABLE users ALTER COLUMN age TYPE bigint;', 50_000_000);
    expect(small).toBeLessThan(huge);
  });
});

describe('findMissingDependencies', () => {
  it('reads the order it is given rather than re-sorting', () => {
    const files: MigrationFile[] = [
      { path: 'b.sql', name: 'b.sql', version: '', createdTables: [], referencedTables: ['users'] },
      { path: 'a.sql', name: 'a.sql', version: '', createdTables: ['users'], referencedTables: [] },
    ];

    const issues = findMissingDependencies(files);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.files).toEqual(['b.sql', 'a.sql']);
  });

  it('reports one issue per table, not one per reference', () => {
    const files: MigrationFile[] = [
      { path: 'b.sql', name: 'b.sql', version: '', createdTables: [], referencedTables: ['users', 'users'] },
      { path: 'a.sql', name: 'a.sql', version: '', createdTables: ['users'], referencedTables: [] },
    ];

    expect(findMissingDependencies(files)).toHaveLength(1);
  });
});

describe('sequence analysis plumbing', () => {
  it('skips files it cannot parse and says so', async () => {
    const analysis = await run([
      ['001_broken.sql', 'ALTER TABLE ;;; nonsense'],
      ['002_ok.sql', 'CREATE TABLE users (id bigint);'],
    ]);

    expect(analysis.parseErrors).toHaveLength(1);
    expect(analysis.parseErrors[0]?.file).toBe('001_broken.sql');
    expect(analysis.fileCount).toBe(1);
    expect(analysis.files).toEqual(['002_ok.sql']);
  });

  it('counts files and statements', async () => {
    const analysis = await run([
      ['001.sql', 'CREATE TABLE a (id int);\nCREATE TABLE b (id int);'],
      ['002.sql', 'CREATE TABLE c (id int);'],
    ]);

    expect(analysis.fileCount).toBe(2);
    expect(analysis.statementCount).toBe(3);
  });

  it('finds nothing in a single clean file', async () => {
    const analysis = await run([['001.sql', 'CREATE TABLE users (id bigint);']]);
    expect(analysis.findings).toHaveLength(0);
  });

  it('documents every ID in the SQ space', () => {
    expect(Object.keys(SEQUENCE_CHECKS)).toEqual(['SQ001', 'SQ002', 'SQ003', 'SQ004', 'SQ005']);
    expect(SEQUENCE_CHECKS.SQ005.kind).toBe('summary');
    expect(SEQUENCE_CHECKS.SQ001.kind).toBe('finding');
  });
});

describe('sequence report output', () => {
  it('says nothing about a single file', async () => {
    const analysis = await run([['001.sql', 'CREATE TABLE users (id bigint);']]);
    expect(formatSequenceReport(analysis)).toBe('');
  });

  it('agrees with itself about singular and plural', async () => {
    const analysis = await run([
      ['001.sql', 'CREATE INDEX idx_users_email ON users (email);'],
      ['002.sql', 'ALTER TABLE users ALTER COLUMN age TYPE bigint;'],
    ]);

    expect(analysis.blastRadius.tables).toHaveLength(1);
    const report = formatSequenceReport(analysis);
    expect(report).toContain('1 table touched');
    expect(report).not.toContain('1 tables touched');
    expect(report).toContain('2 statements');
  });

  it('says "1 statement" when there is only one', async () => {
    const analysis = await run([
      ['001.sql', 'CREATE TABLE users (id bigint);'],
      ['002.sql', ''],
    ]);

    expect(analysis.statementCount).toBe(1);
    expect(formatSequenceReport(analysis)).not.toContain('1 statements');
  });

  it('renders findings and the blast-radius table', async () => {
    const analysis = await run([
      ['001_index.sql', 'CREATE INDEX idx_users_email ON users (email);'],
      ['002_type.sql', 'ALTER TABLE users ALTER COLUMN age TYPE bigint;'],
    ]);

    const report = formatSequenceReport(analysis);
    expect(report).toContain('Sequence Analysis');
    expect(report).toContain('[SQ001]');
    expect(report).toContain('[SQ005] blast-radius');
    expect(report).toContain('users');
    expect(report).toContain('Total blocking lock time');
  });

  it('shapes JSON with findings, blast radius and a summary', async () => {
    const analysis = await run([
      ['001_alter.sql', 'ALTER TABLE audit_log ADD COLUMN request_id text;'],
      ['002_create.sql', 'CREATE TABLE audit_log (id bigint);'],
    ]);

    const json = buildSequenceJson(analysis);
    expect(json.fileCount).toBe(2);
    expect(json.findings.map(f => f.id)).toContain('SQ004');
    expect(json.summary.criticalCount).toBe(1);
    expect(json.summary.tablesTouched).toBe(1);
    expect(json.blastRadius.estimateBasis).toBe('heuristic');
    expect(json.thresholds.lockBudgetSeconds).toBe(DEFAULT_LOCK_BUDGET_SECONDS);
  });
});

describe('the fixture sequence', () => {
  let analysis: SequenceAnalysis;

  beforeAll(async () => {
    const names = (await readdir(FIXTURES)).filter(f => f.endsWith('.sql')).sort();
    const inputs = await Promise.all(names.map(async name => ({
      path: resolve(FIXTURES, name),
      sql: await readFile(resolve(FIXTURES, name), 'utf-8'),
    })));
    analysis = await analyzeSequence(inputs);
  });

  it('exhibits every finding in the SQ space', () => {
    expect(ids(analysis).sort()).toEqual(['SQ001', 'SQ002', 'SQ003', 'SQ004']);
  });

  it('pins the cumulative lock budget on users', () => {
    const sq001 = find(analysis, 'SQ001')!;
    expect(sq001.table).toBe('users');
    expect(sq001.severity).toBe('critical');
    expect(sq001.detail).toContain('CREATE INDEX idx_users_email');
  });

  it('names the forward reference to audit_log', () => {
    expect(find(analysis, 'SQ004')!.files).toEqual([
      '003_backfill_audit_log.sql',
      '004_create_audit_log.sql',
    ]);
  });

  it('puts users at the top of the blast radius', () => {
    const [worst] = analysis.blastRadius.tables;
    expect(worst?.table).toBe('users');
    expect(worst?.files).toHaveLength(4);
    expect(worst?.estimatedLockSeconds).toBe(180);
  });
});
