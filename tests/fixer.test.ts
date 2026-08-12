import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { autoFix, isFixable } from '../src/fixer/fix.js';
import { FIX_CLASSIFICATIONS } from '../src/fixer/classification.js';
import { parseMigration } from '../src/parser/parse.js';
import { classifyLock } from '../src/locks/classify.js';
import { allRules, runRules } from '../src/rules/index.js';

async function analyzeAndFix(sql: string, pgVersion = 17) {
  const parsed = await parseMigration(sql);
  const statements = parsed.statements.map((s) => {
    const lock = classifyLock(s.stmt, pgVersion);
    return { ...s, lock };
  });
  const violations = runRules(allRules, statements, pgVersion);
  return autoFix(sql, violations);
}

describe('isFixable', () => {
  it('returns true for fixable rules', () => {
    expect(isFixable('MP001')).toBe(true);
    expect(isFixable('MP004')).toBe(true);
    expect(isFixable('MP009')).toBe(true);
    expect(isFixable('MP020')).toBe(true);
  });

  it('returns true for MP021 and MP023', () => {
    expect(isFixable('MP021')).toBe(true);
    expect(isFixable('MP023')).toBe(true);
  });

  it('returns true for MP037, MP040, MP041, MP046', () => {
    expect(isFixable('MP037')).toBe(true);
    expect(isFixable('MP040')).toBe(true);
    expect(isFixable('MP041')).toBe(true);
    expect(isFixable('MP046')).toBe(true);
  });

  it('returns true for the expanded mechanical rules', () => {
    expect(isFixable('MP005')).toBe(true);
    expect(isFixable('MP012')).toBe(true);
    expect(isFixable('MP025')).toBe(true);
    expect(isFixable('MP038')).toBe(true);
    expect(isFixable('MP039')).toBe(true);
    expect(isFixable('MP042')).toBe(true);
    expect(isFixable('MP074')).toBe(true);
    expect(isFixable('MP077')).toBe(true);
  });

  it('returns false for non-fixable rules', () => {
    expect(isFixable('MP002')).toBe(false);
    expect(isFixable('MP003')).toBe(false);
    expect(isFixable('MP007')).toBe(false);
    expect(isFixable('MP013')).toBe(false);
  });
});

describe('autoFix', () => {
  it('returns unchanged SQL when no violations', () => {
    const sql = "SET lock_timeout = '5s'; CREATE INDEX CONCURRENTLY idx ON users (email);";
    const result = autoFix(sql, []);
    expect(result.fixedSql).toBe(sql);
    expect(result.fixedCount).toBe(0);
  });

  it('returns unchanged SQL when only unfixable violations', () => {
    const result = autoFix('ALTER TABLE users ALTER COLUMN email TYPE varchar(255);', [
      { ruleId: 'MP007', ruleName: 'no-column-type-change', severity: 'critical', message: 'test', line: 1 },
    ]);
    expect(result.fixedCount).toBe(0);
    expect(result.unfixable).toHaveLength(1);
  });
});

describe('MP001 auto-fix: CREATE INDEX → CONCURRENTLY', () => {
  it('adds CONCURRENTLY to CREATE INDEX', async () => {
    const sql = 'CREATE INDEX idx_email ON users (email);';
    const result = await analyzeAndFix(sql);
    expect(result.fixedSql).toContain('CREATE INDEX CONCURRENTLY');
    expect(result.fixedCount).toBeGreaterThan(0);
  });

  it('adds CONCURRENTLY to CREATE UNIQUE INDEX', async () => {
    const sql = 'CREATE UNIQUE INDEX idx_email ON users (email);';
    const result = await analyzeAndFix(sql);
    expect(result.fixedSql).toContain('CREATE UNIQUE INDEX CONCURRENTLY');
  });

  it('does not double-add CONCURRENTLY', async () => {
    const sql = 'CREATE INDEX CONCURRENTLY idx_email ON users (email);';
    const result = await analyzeAndFix(sql);
    const matches = result.fixedSql.match(/CONCURRENTLY/g);
    expect(matches?.length).toBe(1);
  });
});

describe('MP004 auto-fix: prepend SET lock_timeout', () => {
  it('prepends lock_timeout for ALTER TABLE', async () => {
    const sql = 'ALTER TABLE users ADD COLUMN bio text;';
    const result = await analyzeAndFix(sql);
    expect(result.fixedSql).toContain("SET lock_timeout = '5s';");
    const lines = result.fixedSql.split('\n');
    const lockIdx = lines.findIndex(l => l.includes('lock_timeout'));
    const alterIdx = lines.findIndex(l => l.includes('ALTER TABLE'));
    expect(lockIdx).toBeLessThan(alterIdx);
  });

  it('does not add duplicate lock_timeout', async () => {
    const sql = `SET lock_timeout = '5s';
ALTER TABLE users ADD COLUMN bio text;`;
    const result = await analyzeAndFix(sql);
    const matches = result.fixedSql.match(/lock_timeout/g);
    expect(matches?.length).toBe(1);
  });
});

describe('MP009 auto-fix: DROP INDEX → CONCURRENTLY', () => {
  it('adds CONCURRENTLY to DROP INDEX', async () => {
    const sql = 'DROP INDEX idx_users_email;';
    const result = await analyzeAndFix(sql);
    expect(result.fixedSql).toContain('DROP INDEX CONCURRENTLY');
  });

  it('handles DROP INDEX IF EXISTS', async () => {
    const sql = 'DROP INDEX IF EXISTS idx_users_email;';
    const result = await analyzeAndFix(sql);
    expect(result.fixedSql).toContain('DROP INDEX CONCURRENTLY IF EXISTS');
  });
});

describe('MP020 auto-fix: prepend SET statement_timeout', () => {
  it('prepends statement_timeout for VACUUM FULL', async () => {
    const sql = 'VACUUM FULL users;';
    const result = await analyzeAndFix(sql);
    expect(result.fixedSql).toContain("SET statement_timeout = '30s';");
  });

  it('does not add duplicate statement_timeout', async () => {
    const sql = `SET statement_timeout = '30s';
VACUUM FULL users;`;
    const result = await analyzeAndFix(sql);
    const matches = result.fixedSql.match(/statement_timeout/g);
    expect(matches?.length).toBe(1);
  });
});

describe('MP021 auto-fix: REINDEX → CONCURRENTLY', () => {
  it('adds CONCURRENTLY to REINDEX INDEX', async () => {
    const sql = 'REINDEX INDEX idx_users_email;';
    const result = await analyzeAndFix(sql);
    expect(result.fixedSql).toContain('REINDEX INDEX CONCURRENTLY');
    expect(result.fixedCount).toBeGreaterThan(0);
  });

  it('adds CONCURRENTLY to REINDEX TABLE', async () => {
    const sql = 'REINDEX TABLE users;';
    const result = await analyzeAndFix(sql);
    expect(result.fixedSql).toContain('REINDEX TABLE CONCURRENTLY');
  });

  it('does not double-add CONCURRENTLY', async () => {
    const sql = 'REINDEX INDEX CONCURRENTLY idx_users_email;';
    const result = await analyzeAndFix(sql);
    const matches = result.fixedSql.match(/CONCURRENTLY/g);
    expect(matches?.length).toBe(1);
  });
});

describe('MP023 auto-fix: CREATE TABLE/INDEX → IF NOT EXISTS', () => {
  it('adds IF NOT EXISTS to CREATE TABLE', async () => {
    const sql = 'CREATE TABLE users (id bigint PRIMARY KEY);';
    const result = await analyzeAndFix(sql);
    expect(result.fixedSql).toContain('CREATE TABLE IF NOT EXISTS');
    expect(result.fixedCount).toBeGreaterThan(0);
  });

  // Driven off MP023 alone: with the full catalog, MP001 turns any plain
  // CREATE INDEX into a concurrent build first, and IF NOT EXISTS is then
  // withheld on purpose. This is the fix itself, for the case where MP001 is
  // switched off in config and the index really is being built non-concurrently.
  it('adds IF NOT EXISTS to CREATE INDEX', () => {
    const sql = 'CREATE INDEX idx_email ON users (email);';
    const result = autoFix(sql, [
      {
        ruleId: 'MP023',
        ruleName: 'require-if-not-exists',
        severity: 'warning',
        message: 'CREATE INDEX "idx_email" without IF NOT EXISTS',
        line: 1,
      },
    ]);
    expect(result.fixedSql).toContain('CREATE INDEX IF NOT EXISTS idx_email');
  });

  // On a concurrent build IF NOT EXISTS is the trap, not the fix: it matches an
  // index a failed build left INVALID and skips the rebuild (MPH-012).
  it('does not add IF NOT EXISTS to a concurrent build', async () => {
    const sql = 'CREATE INDEX CONCURRENTLY idx_email ON users (email);';
    const result = await analyzeAndFix(sql);
    expect(result.fixedSql).not.toContain('IF NOT EXISTS');
  });

  it('does not double-add IF NOT EXISTS', async () => {
    const sql = 'CREATE TABLE IF NOT EXISTS users (id bigint PRIMARY KEY);';
    const result = await analyzeAndFix(sql);
    const matches = result.fixedSql.match(/IF NOT EXISTS/gi);
    expect(matches?.length).toBe(1);
  });
});

describe('MP037 auto-fix: VARCHAR(n) → TEXT', () => {
  it('replaces VARCHAR(n) with TEXT', async () => {
    const sql = 'CREATE TABLE users (id bigint PRIMARY KEY, bio VARCHAR(500));';
    const result = await analyzeAndFix(sql);
    expect(result.fixedSql).toContain('TEXT');
    expect(result.fixedSql).not.toMatch(/VARCHAR\s*\(\s*500\s*\)/i);
    expect(result.fixedCount).toBeGreaterThan(0);
  });

  it('replaces multiple VARCHAR columns', async () => {
    const sql = 'CREATE TABLE t (a VARCHAR(100), b VARCHAR(255));';
    const result = await analyzeAndFix(sql);
    expect(result.fixedSql).not.toMatch(/VARCHAR/i);
  });

  it('does not touch TEXT columns', async () => {
    const sql = 'CREATE TABLE t (id bigint PRIMARY KEY, bio TEXT);';
    const result = await analyzeAndFix(sql);
    expect(result.fixedSql).toContain('TEXT');
  });
});

describe('MP040 auto-fix: TIMESTAMP → TIMESTAMPTZ', () => {
  it('replaces TIMESTAMP with TIMESTAMPTZ', async () => {
    const sql = 'CREATE TABLE events (id bigint PRIMARY KEY, created_at TIMESTAMP);';
    const result = await analyzeAndFix(sql);
    expect(result.fixedSql).toContain('TIMESTAMPTZ');
    expect(result.fixedCount).toBeGreaterThan(0);
  });

  it('does not double-fix TIMESTAMPTZ', async () => {
    const sql = 'CREATE TABLE events (id bigint PRIMARY KEY, created_at TIMESTAMPTZ);';
    const result = await analyzeAndFix(sql);
    const matches = result.fixedSql.match(/TIMESTAMPTZ/gi);
    expect(matches?.length).toBe(1);
  });
});

describe('MP041 auto-fix: CHAR(n) → TEXT', () => {
  it('replaces CHAR(n) with TEXT', async () => {
    const sql = 'CREATE TABLE users (id bigint PRIMARY KEY, country_code CHAR(2));';
    const result = await analyzeAndFix(sql);
    expect(result.fixedSql).not.toMatch(/CHAR\s*\(\s*2\s*\)/i);
    expect(result.fixedSql).toContain('TEXT');
    expect(result.fixedCount).toBeGreaterThan(0);
  });
});

describe('MP046 auto-fix: DETACH PARTITION → CONCURRENTLY', () => {
  // Regression: the keyword used to go in front of the partition name, which
  // PostgreSQL rejects with a syntax error. The grammar puts it last.
  it('adds CONCURRENTLY after the partition name', async () => {
    const sql = 'ALTER TABLE events DETACH PARTITION events_2024;';
    const result = await analyzeAndFix(sql);
    expect(result.fixedSql).toContain('DETACH PARTITION events_2024 CONCURRENTLY;');
    expect(result.fixedCount).toBeGreaterThan(0);
    expect((await parseMigration(result.fixedSql)).errors).toEqual([]);
  });

  it('keeps a schema-qualified partition name intact', async () => {
    const result = await analyzeAndFix('ALTER TABLE events DETACH PARTITION archive.events_2024;');
    expect(result.fixedSql).toContain('DETACH PARTITION archive.events_2024 CONCURRENTLY;');
    expect((await parseMigration(result.fixedSql)).errors).toEqual([]);
  });

  it('does not double-add CONCURRENTLY', async () => {
    const sql = 'ALTER TABLE events DETACH PARTITION events_2024 CONCURRENTLY;';
    const result = await analyzeAndFix(sql);
    const matches = result.fixedSql.match(/CONCURRENTLY/gi);
    expect(matches?.length).toBe(1);
  });

  it('leaves FINALIZE alone — it cannot be combined with CONCURRENTLY', () => {
    const sql = 'ALTER TABLE events DETACH PARTITION events_2024 FINALIZE;';
    const result = autoFix(sql, [
      { ruleId: 'MP046', ruleName: 'require-concurrent-detach-partition', severity: 'critical', message: '', line: 1 },
    ]);
    expect(result.fixedSql).toBe(sql);
  });
});

describe('mixed violations', () => {
  it('fixes fixable and reports unfixable', async () => {
    const sql = 'CREATE INDEX idx ON users (email);';
    const result = await analyzeAndFix(sql);
    // Should fix MP001 (CONCURRENTLY), MP004 (lock_timeout), MP020 (statement_timeout)
    expect(result.fixedCount).toBeGreaterThanOrEqual(2);
    expect(result.fixedSql).toContain('CONCURRENTLY');
  });

  it('handles multi-statement migrations', async () => {
    const sql = `CREATE INDEX idx_a ON users (email);
ALTER TABLE orders ADD COLUMN total numeric;`;
    const result = await analyzeAndFix(sql);
    expect(result.fixedSql).toContain('CONCURRENTLY');
    expect(result.fixedSql).toContain("lock_timeout");
  });
});

/**
 * `docs/auto-fix.md` restates the classification table by hand, so it is the
 * one copy that can quietly disagree with the fixer. Comparing it back to the
 * registry means a new rule, or a reworded reason, fails here instead of
 * leaving the published table wrong.
 */
describe('docs/auto-fix.md matches the fixer registry', () => {
  const rows = new Map<string, { fixClass: string; reason: string }>();
  for (const line of readFileSync(
    new URL('../docs/auto-fix.md', import.meta.url),
    'utf8',
  ).split(/\r?\n/)) {
    const m = line.match(/^\| (MP\d{3}) \| [a-z0-9-]+ \| (MECHANICAL|PLAN-ONLY|UNFIXABLE) \| (.+?) \|$/);
    if (m) rows.set(m[1], { fixClass: m[2]!, reason: m[3]! });
  }

  it('documents every rule exactly once', () => {
    expect(rows.size).toBe(FIX_CLASSIFICATIONS.length);
  });

  it.each(FIX_CLASSIFICATIONS.map(e => [e.ruleId, e] as const))(
    '%s is documented with the class and reason the code gives',
    (ruleId, entry) => {
      const row = rows.get(ruleId);
      expect(row, `${ruleId} is missing from docs/auto-fix.md`).toBeDefined();
      expect(row!.fixClass).toBe(entry.fixClass.toUpperCase());
      expect(row!.reason).toBe(entry.reason);
    },
  );
});
