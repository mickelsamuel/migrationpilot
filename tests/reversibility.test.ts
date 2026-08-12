import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { parseMigration } from '../src/parser/parse.js';
import { generateRollback } from '../src/generator/rollback.js';
import { gradeReversibility, rollUp } from '../src/generator/grade.js';
import {
  hasInlineDownSection,
  downFileCandidates,
  findCompanionDownFile,
  resolveCompanionDown,
} from '../src/generator/down-file.js';
import { analyzeSQL } from '../src/analysis/analyze.js';
import { staticRules } from '../src/rules/index.js';
import { formatJson } from '../src/output/json.js';
import type { ReversibilityGrade } from '../src/generator/grade.js';

const FIXTURES = resolve('tests/fixtures/reversibility');

async function grade(sql: string) {
  const { statements, errors } = await parseMigration(sql);
  expect(errors).toHaveLength(0);
  return gradeReversibility(statements);
}

async function gradeOf(sql: string): Promise<ReversibilityGrade> {
  return (await grade(sql)).grade;
}

describe('GREEN — cleanly reversible', () => {
  const cases: Array<[string, string]> = [
    ['CREATE TABLE', 'CREATE TABLE users (id bigserial PRIMARY KEY);'],
    ['CREATE INDEX', 'CREATE INDEX CONCURRENTLY idx_users_email ON users (email);'],
    ['CREATE VIEW', 'CREATE VIEW active_users AS SELECT * FROM users WHERE active;'],
    ['CREATE SEQUENCE', 'CREATE SEQUENCE order_number_seq;'],
    ['CREATE SCHEMA', 'CREATE SCHEMA analytics;'],
    ['CREATE EXTENSION', 'CREATE EXTENSION IF NOT EXISTS pgcrypto;'],
    ['CREATE TRIGGER', 'CREATE TRIGGER t AFTER INSERT ON users FOR EACH ROW EXECUTE FUNCTION f();'],
    ['ADD COLUMN', 'ALTER TABLE users ADD COLUMN nickname text;'],
    ['SET NOT NULL', 'ALTER TABLE users ALTER COLUMN email SET NOT NULL;'],
    ['SET DEFAULT', "ALTER TABLE users ALTER COLUMN role SET DEFAULT 'user';"],
    ['ADD CONSTRAINT', 'ALTER TABLE orders ADD CONSTRAINT fk_u FOREIGN KEY (user_id) REFERENCES users(id) NOT VALID;'],
    ['RENAME COLUMN', 'ALTER TABLE users RENAME COLUMN name TO full_name;'],
    ['RENAME TABLE', 'ALTER TABLE users RENAME TO people;'],
    ['ENABLE RLS', 'ALTER TABLE users ENABLE ROW LEVEL SECURITY;'],
    ['ALTER TYPE RENAME VALUE', "ALTER TYPE status RENAME VALUE 'active' TO 'enabled';"],
    ['SET lock_timeout', "SET lock_timeout = '5s';"],
    ['transaction control', 'BEGIN;\nCREATE TABLE a (id int);\nCOMMIT;'],
  ];

  for (const [name, sql] of cases) {
    it(`grades ${name} GREEN`, async () => {
      expect(await gradeOf(sql)).toBe('GREEN');
    });
  }

  it('reports no reasons when everything is clean', async () => {
    const assessment = await grade('ALTER TABLE users ADD COLUMN nickname text;');
    expect(assessment.reasons).toHaveLength(0);
    expect(assessment.counts).toEqual({ clean: 1, care: 0, irreversible: 0 });
  });
});

describe('YELLOW — reversible with care', () => {
  const cases: Array<[string, string]> = [
    ['DROP INDEX', 'DROP INDEX CONCURRENTLY idx_users_email;'],
    ['DROP VIEW', 'DROP VIEW active_users;'],
    ['DROP SEQUENCE', 'DROP SEQUENCE order_number_seq;'],
    ['DROP TRIGGER', 'DROP TRIGGER t ON users;'],
    ['DROP CONSTRAINT', 'ALTER TABLE orders DROP CONSTRAINT fk_u;'],
    ['DROP DEFAULT', 'ALTER TABLE users ALTER COLUMN role DROP DEFAULT;'],
    ['DROP NOT NULL', 'ALTER TABLE users ALTER COLUMN email DROP NOT NULL;'],
    ['widening type change', 'ALTER TABLE users ALTER COLUMN age TYPE bigint;'],
    ['ALTER TYPE ADD VALUE', "ALTER TYPE status ADD VALUE 'archived';"],
    ['UPDATE', 'UPDATE users SET role = 1 WHERE role IS NULL;'],
    ['INSERT', "INSERT INTO settings (key, value) VALUES ('a', 'b');"],
    ['DROP VIEW CASCADE', 'DROP VIEW active_users CASCADE;'],
  ];

  for (const [name, sql] of cases) {
    it(`grades ${name} YELLOW`, async () => {
      expect(await gradeOf(sql)).toBe('YELLOW');
    });
  }

  it('explains what the reverse cannot restore', async () => {
    const assessment = await grade('DROP INDEX idx_users_email;');
    expect(assessment.grade).toBe('YELLOW');
    expect(assessment.reasons[0]?.grade).toBe('YELLOW');
    expect(assessment.reasons[0]?.reason).toContain('source control');
  });

  it('tells a backfill apart from an overwrite in the reason text', async () => {
    const assessment = await grade('UPDATE users SET nickname = name;');
    expect(assessment.reasons[0]?.reason).toContain('Backfilling a new column');
  });
});

describe('RED — irreversible data loss', () => {
  const cases: Array<[string, string]> = [
    ['DROP TABLE', 'DROP TABLE sessions;'],
    ['DROP TABLE IF EXISTS', 'DROP TABLE IF EXISTS sessions;'],
    ['DROP MATERIALIZED VIEW', 'DROP MATERIALIZED VIEW daily_totals;'],
    ['DROP SCHEMA', 'DROP SCHEMA analytics;'],
    ['DROP DATABASE', 'DROP DATABASE reporting;'],
    ['DROP COLUMN', 'ALTER TABLE users DROP COLUMN legacy_notes;'],
    ['TRUNCATE', 'TRUNCATE TABLE staging_events;'],
    ['DELETE', 'DELETE FROM users WHERE created_at < now() - interval \'1 year\';'],
    ['DELETE without WHERE', 'DELETE FROM users;'],
    ['narrowing to integer', 'ALTER TABLE users ALTER COLUMN big_id TYPE integer;'],
    ['narrowing to smallint', 'ALTER TABLE users ALTER COLUMN age TYPE smallint;'],
    ['narrowing to varchar(n)', 'ALTER TABLE users ALTER COLUMN bio TYPE varchar(50);'],
    ['DROP TYPE CASCADE', 'DROP TYPE status CASCADE;'],
  ];

  for (const [name, sql] of cases) {
    it(`grades ${name} RED`, async () => {
      expect(await gradeOf(sql)).toBe('RED');
    });
  }

  it('names the column whose data is destroyed', async () => {
    const assessment = await grade('ALTER TABLE users DROP COLUMN legacy_notes;');
    expect(assessment.reasons[0]?.reason).toContain('users.legacy_notes');
    expect(assessment.reasons[0]?.reason).toContain('NULLs, not the data');
  });

  it('points a narrowing type change at MP044', async () => {
    const assessment = await grade('ALTER TABLE users ALTER COLUMN big_id TYPE integer;');
    expect(assessment.reasons[0]?.reason).toContain('MP044');
  });

  it('says a WHERE-less DELETE empties the table', async () => {
    const assessment = await grade('DELETE FROM users;');
    expect(assessment.reasons[0]?.reason).toContain('without a WHERE clause');
  });
});

describe('grade roll-up', () => {
  it('takes the worst statement in the file', async () => {
    const assessment = await grade(`
      ALTER TABLE users ADD COLUMN nickname text;
      DROP INDEX idx_users_email;
      ALTER TABLE users DROP COLUMN legacy_notes;
    `);

    expect(assessment.grade).toBe('RED');
    expect(assessment.counts).toEqual({ clean: 1, care: 1, irreversible: 1 });
    expect(assessment.reasons).toHaveLength(2);
    expect(assessment.reasons.map(r => r.grade)).toEqual(['YELLOW', 'RED']);
  });

  it('records the line of each problem statement', async () => {
    const sql = [
      'ALTER TABLE users ADD COLUMN a text;',
      'DROP INDEX idx_a;',
      '',
      'ALTER TABLE users DROP COLUMN b;',
    ].join('\n');
    const { statements } = await parseMigration(sql);
    // Same line convention the rest of the pipeline uses (see analysis/analyze.ts).
    const withLines = statements.map(s => ({ ...s, line: sql.slice(0, s.stmtLocation).split('\n').length }));
    const assessment = gradeReversibility(withLines);

    expect(assessment.reasons).toHaveLength(2);
    expect(assessment.reasons[0]?.line).toBeGreaterThanOrEqual(1);
    expect(assessment.reasons[1]?.line).toBeGreaterThan(assessment.reasons[0]?.line ?? 0);
  });

  it('maps counts to grades directly', () => {
    expect(rollUp({ clean: 3, care: 0, irreversible: 0 })).toBe('GREEN');
    expect(rollUp({ clean: 0, care: 1, irreversible: 0 })).toBe('YELLOW');
    expect(rollUp({ clean: 9, care: 9, irreversible: 1 })).toBe('RED');
    expect(rollUp({ clean: 0, care: 0, irreversible: 0 })).toBe('GREEN');
  });

  it('agrees with the rollback generator it reuses', async () => {
    const sql = 'ALTER TABLE users DROP COLUMN legacy_notes;';
    const { statements } = await parseMigration(sql);

    expect(generateRollback(statements).statements[0]?.reversibility).toBe('irreversible');
    expect(gradeReversibility(statements).grade).toBe('RED');
  });

  it('flags a statement it has no reversal for as needing care', async () => {
    const assessment = await grade('ALTER TABLE users SET (fillfactor = 70);');
    expect(assessment.grade).toBe('YELLOW');
    expect(assessment.reasons[0]?.reason).toContain('by hand');
  });
});

describe('companion down migrations', () => {
  it('recognises the down sections tools embed in the file', () => {
    expect(hasInlineDownSection('-- +goose Up\nSELECT 1;\n-- +goose Down\nSELECT 2;')).toBe(true);
    expect(hasInlineDownSection('-- migrate:up\nSELECT 1;\n-- migrate:down\nSELECT 2;')).toBe(true);
    expect(hasInlineDownSection('--rollback DROP TABLE users;')).toBe(true);
    expect(hasInlineDownSection('--//@UNDO\nDROP TABLE users;')).toBe(true);
  });

  it('does not mistake prose for a down section', () => {
    expect(hasInlineDownSection('-- rolling back this one is painful\nDROP TABLE users;')).toBe(false);
    expect(hasInlineDownSection('DROP TABLE users;')).toBe(false);
  });

  it('offers the conventional companion paths', () => {
    const candidates = downFileCandidates('/repo/migrations/001_add_users.sql').map(p => p.replace(/\\/g, '/'));

    expect(candidates).toContain('/repo/migrations/001_add_users.down.sql');
    expect(candidates).toContain('/repo/migrations/001_add_users.rollback.sql');
    expect(candidates).toContain('/repo/migrations/down/001_add_users.sql');
    expect(candidates).toContain('/repo/down/001_add_users.sql');
  });

  it('pairs golang-migrate up and down files', () => {
    const candidates = downFileCandidates('/repo/migrations/001_add_users.up.sql').map(p => p.replace(/\\/g, '/'));
    expect(candidates).toContain('/repo/migrations/001_add_users.down.sql');
  });

  it('pairs a Flyway migration with its undo script', () => {
    const candidates = downFileCandidates('/repo/db/V2__add_users.sql').map(p => p.replace(/\\/g, '/'));
    expect(candidates).toContain('/repo/db/U2__add_users.sql');
  });

  it('finds a real companion file on disk', async () => {
    const found = await findCompanionDownFile(resolve(FIXTURES, 'red_drop_table.sql'));
    expect(found).toBeDefined();
    expect(found!.replace(/\\/g, '/')).toContain('red_drop_table.down.sql');
  });

  it('reports nothing when there is no down migration', async () => {
    const down = await resolveCompanionDown(
      resolve(FIXTURES, 'red_drop_column.sql'),
      await readFile(resolve(FIXTURES, 'red_drop_column.sql'), 'utf-8'),
    );
    expect(down).toEqual({ present: false });
  });

  it('prefers an inline down section over a filesystem lookup', async () => {
    const path = resolve(FIXTURES, 'red_inline_down.sql');
    const down = await resolveCompanionDown(path, await readFile(path, 'utf-8'));
    expect(down).toEqual({ present: true, kind: 'inline' });
  });
});

describe('the reversibility fixtures', () => {
  const expected: Array<[string, ReversibilityGrade]> = [
    ['green_add_column.sql', 'GREEN'],
    ['yellow_drop_index.sql', 'YELLOW'],
    ['red_drop_column.sql', 'RED'],
    ['red_drop_table.sql', 'RED'],
    ['red_inline_down.sql', 'RED'],
  ];

  for (const [file, want] of expected) {
    it(`grades ${file} ${want}`, async () => {
      expect(await gradeOf(await readFile(resolve(FIXTURES, file), 'utf-8'))).toBe(want);
    });
  }
});

describe('grade in the analysis pipeline', () => {
  it('rides along with analyzeSQL', async () => {
    const analysis = await analyzeSQL('ALTER TABLE users DROP COLUMN legacy_notes;', 'm.sql', 17, staticRules);
    expect(analysis.reversibility?.grade).toBe('RED');
    expect(analysis.reversibility?.reasons).toHaveLength(1);
  });

  it('lands in the JSON report as an additive field', async () => {
    const analysis = await analyzeSQL('DROP TABLE sessions;', 'm.sql', 17, staticRules);
    const report = JSON.parse(formatJson(analysis, staticRules));

    expect(report.reversibility.grade).toBe('RED');
    expect(report.reversibility.counts.irreversible).toBe(1);
    // Existing consumers keep everything they had.
    expect(report.riskLevel).toBeDefined();
    expect(report.summary.totalStatements).toBe(1);
  });

  it('omits the field entirely when a report is built without one', () => {
    const report = JSON.parse(formatJson({
      file: 'm.sql',
      statements: [],
      overallRisk: { level: 'GREEN', score: 0, factors: [] },
      violations: [],
    }));

    expect('reversibility' in report).toBe(false);
  });
});
