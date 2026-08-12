/**
 * One safe way to build an index, agreed on by every part of the tool.
 *
 * MP001, MP020, MP023, MP070 and the fixer each had an opinion about
 * `CREATE INDEX`, and together they did not add up:
 *
 *  - MP001 suggested `CREATE INDEX CONCURRENTLY`, which then tripped MP023 and
 *    MP070. The tool's own advice failed the tool.
 *  - Taking MP023's advice and adding `IF NOT EXISTS` silenced MP070 — but
 *    `IF NOT EXISTS` does not fix the invalid-index retry, it hides it. The
 *    statement skips creation and reports success over an index that is still
 *    invalid. That is handbook MPH-012, and `bench/corpus/unsafe/u13` is the
 *    case the benchmark recorded MigrationPilot missing for this reason.
 *  - `--fix` prepended `SET statement_timeout = '30s'` to the CONCURRENTLY
 *    build it had just created. On a table big enough to need CONCURRENTLY,
 *    that timeout kills the build partway and manufactures exactly the invalid
 *    index MP070 exists to warn about — and the result was graded GREEN.
 *
 * The recipe below is the handbook's (MPH-012 "Safe SQL"): lock_timeout yes,
 * drop-first instead of IF NOT EXISTS, and no statement_timeout anywhere near a
 * concurrent build. These tests hold every piece of the tool to it.
 */

import { describe, it, expect } from 'vitest';
import { analyzeSQL } from '../src/analysis/analyze.js';
import { allRules } from '../src/rules/index.js';
import { autoFix } from '../src/fixer/fix.js';

const BARE_CREATE_INDEX = 'CREATE INDEX idx_users_email ON users (email);';

/** The recipe every part of the tool is supposed to converge on. */
const CANONICAL = `SET lock_timeout = '5s';
DROP INDEX CONCURRENTLY IF EXISTS idx_users_email;
CREATE INDEX CONCURRENTLY idx_users_email ON users (email);`;

async function analyze(sql: string, file = 'm.sql') {
  return analyzeSQL(sql, file, 17, allRules);
}

function ids(violations: { ruleId: string }[]): string[] {
  return [...new Set(violations.map(v => v.ruleId))].sort();
}

describe('the canonical safe-index recipe', () => {
  it('analyzes GREEN with nothing outstanding', async () => {
    const result = await analyze(CANONICAL);
    expect(ids(result.violations)).toEqual([]);
    expect(result.overallRisk.level).toBe('GREEN');
  });
});

describe("MP001's suggestion passes the tool", () => {
  it('produces a safe alternative that analyzes clean', async () => {
    const first = await analyze(BARE_CREATE_INDEX);
    const mp001 = first.violations.find(v => v.ruleId === 'MP001');
    expect(mp001?.safeAlternative).toBeDefined();

    // The whole contract in one line: paste what the tool told you to write,
    // run the tool on it, get nothing back.
    const second = await analyze(mp001!.safeAlternative!);
    expect(ids(second.violations)).toEqual([]);
  });

  it('does not tell you to use IF NOT EXISTS on a concurrent build', async () => {
    const result = await analyze(BARE_CREATE_INDEX);
    const mp001 = result.violations.find(v => v.ruleId === 'MP001');
    expect(mp001!.safeAlternative).toMatch(/DROP INDEX CONCURRENTLY IF EXISTS/i);

    // Only the SQL: the suggestion deliberately carries a comment saying not to
    // reach for IF NOT EXISTS here, and that comment must not fail this.
    const sqlOnly = mp001!.safeAlternative!.replace(/^[ \t]*--[^\n]*$/gm, '');
    expect(sqlOnly).not.toMatch(/IF NOT EXISTS/i);
  });

  it('states the lock CREATE INDEX actually takes', async () => {
    const result = await analyze(BARE_CREATE_INDEX);
    const rule = allRules.find(r => r.id === 'MP001')!;

    // The statement table in the same report says SHARE. The explanation used
    // to say ACCESS EXCLUSIVE and "blocking all reads and writes", which is the
    // lock DROP INDEX takes, not this one.
    expect(result.statements[0]!.lock.lockType).toBe('SHARE');
    expect(result.statements[0]!.lock.blocksReads).toBe(false);
    expect(rule.whyItMatters).toContain('SHARE');
    expect(rule.whyItMatters).not.toContain('ACCESS EXCLUSIVE');
    expect(rule.whyItMatters).not.toMatch(/blocking all reads/i);
  });
});

describe('MP023 stays out of the way of concurrent builds', () => {
  it('does not fire on CREATE INDEX CONCURRENTLY', async () => {
    const result = await analyze('CREATE INDEX CONCURRENTLY idx_users_email ON users (email);');
    expect(ids(result.violations)).not.toContain('MP023');
  });

  it('still fires on a non-concurrent CREATE INDEX', async () => {
    const result = await analyze(BARE_CREATE_INDEX);
    expect(ids(result.violations)).toContain('MP023');
  });

  it('still fires on CREATE TABLE', async () => {
    const result = await analyze('CREATE TABLE users (id bigint PRIMARY KEY);');
    expect(ids(result.violations)).toContain('MP023');
  });
});

describe('MP070 is not silenced by IF NOT EXISTS', () => {
  // bench/corpus/unsafe/u13 — the benchmark's recorded miss.
  it('fires on CONCURRENTLY IF NOT EXISTS with no preceding drop', async () => {
    const result = await analyze(
      "SET lock_timeout = '5s';\nCREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email ON users (email);",
    );
    const v = result.violations.find(x => x.ruleId === 'MP070');
    expect(v).toBeDefined();
    expect(v!.message).toMatch(/IF NOT EXISTS/i);
  });

  it('is satisfied by a preceding drop, with or without IF NOT EXISTS', async () => {
    const withoutIne = await analyze(CANONICAL);
    expect(ids(withoutIne.violations)).not.toContain('MP070');

    const withIne = await analyze(
      'DROP INDEX CONCURRENTLY IF EXISTS idx_users_email;\nCREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email ON users (email);',
    );
    expect(ids(withIne.violations)).not.toContain('MP070');
  });

  it('still stands down when a constraint adopts the index', async () => {
    const result = await analyze(
      'CREATE UNIQUE INDEX CONCURRENTLY users_email_key ON users (email);\n' +
        'ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE USING INDEX users_email_key;',
    );
    expect(ids(result.violations)).not.toContain('MP070');
  });
});

describe('--fix never manufactures the invalid index', () => {
  it('does not put a statement_timeout in front of a concurrent build', async () => {
    const result = await analyze(BARE_CREATE_INDEX);
    const fixed = autoFix(BARE_CREATE_INDEX, result.violations).fixedSql;

    expect(fixed).toMatch(/CONCURRENTLY/i);
    expect(fixed).not.toMatch(/statement_timeout/i);
  });

  it('does not add IF NOT EXISTS to the build it just made concurrent', async () => {
    const result = await analyze(BARE_CREATE_INDEX);
    const fixed = autoFix(BARE_CREATE_INDEX, result.violations).fixedSql;

    expect(fixed).not.toMatch(/IF NOT EXISTS/i);
  });

  it('does not leave MP023 behind as a manual step pointing at the trap', async () => {
    const result = await analyze(BARE_CREATE_INDEX);
    const fix = autoFix(BARE_CREATE_INDEX, result.violations);

    // "Use IF NOT EXISTS for idempotent migrations", printed against the
    // concurrent build the fixer just produced, is advice straight into
    // MPH-012. The conversion is what resolved MP023; nothing is outstanding.
    expect(fix.unfixable.map(v => v.ruleId)).not.toContain('MP023');
  });

  it('leaves nothing critical behind, and no false GREEN', async () => {
    const result = await analyze(BARE_CREATE_INDEX);
    const fixed = autoFix(BARE_CREATE_INDEX, result.violations).fixedSql;
    const after = await analyze(fixed);

    expect(after.violations.filter(v => v.severity === 'critical')).toEqual([]);
    // MP070's remaining warning is honest: whether the drop is safe depends on
    // whether a constraint owns the index, which is a judgement `--fix` does
    // not get to make. What must never happen is grading this GREEN while it
    // carries the timeout-plus-IF-NOT-EXISTS trap.
    expect(fixed).not.toMatch(/statement_timeout/i);
  });

  it('still adds statement_timeout to long DDL that is not a concurrent build', async () => {
    const sql = 'ALTER TABLE users VALIDATE CONSTRAINT users_email_check;';
    const result = await analyze(sql);
    const fixed = autoFix(sql, result.violations).fixedSql;

    expect(fixed).toMatch(/statement_timeout/i);
  });
});
