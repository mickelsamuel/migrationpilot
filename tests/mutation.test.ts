import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { glob } from 'node:fs/promises';
import { allOperators, getOperator } from '../src/mutate/operators.js';
import type { MutationEdit, MutationTarget } from '../src/mutate/operators.js';
import { mutateFile, runMutationTest, statementSpan, applyEdit, newViolations, meetsFailOn } from '../src/mutate/runner.js';
import type { MutationRunOptions } from '../src/mutate/runner.js';
import { formatMutationReport, formatMutationJson } from '../src/mutate/format.js';
import { parseMigration } from '../src/parser/parse.js';
import { allRules } from '../src/rules/index.js';
import { loadConfig, resolveRuleConfig } from '../src/config/load.js';
import type { MigrationPilotConfig } from '../src/config/load.js';

const FIXTURES = resolve('tests/fixtures/mutation');
const MIGRATIONS = resolve(FIXTURES, 'migrations');

/** Build the MutationTarget for one statement of `sql`, the way the runner does. */
async function buildTarget(sql: string, index = 0, pgVersion = 17): Promise<MutationTarget> {
  const parsed = await parseMigration(sql);
  expect(parsed.errors).toEqual([]);

  const statements = parsed.statements.map(s => {
    const { start, end } = statementSpan(sql, s.stmtLocation, s.stmtLen ?? sql.length - s.stmtLocation);
    return { stmt: s.stmt, sql: sql.slice(start, end) };
  });

  const target = statements[index];
  if (!target) throw new Error(`no statement at index ${index}`);
  return { stmt: target.stmt, sql: target.sql, index, all: statements, pgVersion };
}

/** Apply one operator to one statement and return the edit it produces. */
async function mutate(operatorId: string, sql: string, index = 0, pgVersion = 17): Promise<MutationEdit | null> {
  const operator = getOperator(operatorId);
  if (!operator) throw new Error(`unknown operator ${operatorId}`);
  const target = await buildTarget(sql, index, pgVersion);
  if (!operator.isApplicable(target)) return null;
  return operator.mutate(target);
}

/** Resolve the rule set exactly as the CLI does for a given config. */
function resolveRules(config: MigrationPilotConfig) {
  const base = allRules;
  return {
    baseRules: base,
    rules: base.filter(r => resolveRuleConfig(r.id, r.severity, config).enabled),
  };
}

async function optionsFor(configDir: string): Promise<MutationRunOptions> {
  const { config } = await loadConfig(resolve(FIXTURES, configDir));
  const { rules, baseRules } = resolveRules(config);
  return {
    config,
    rules,
    baseRules,
    pgVersion: config.pgVersion ?? 17,
    failOn: config.failOn ?? 'critical',
  };
}

async function fixtureInputs(): Promise<Array<{ file: string; sql: string }>> {
  const files: string[] = [];
  for await (const entry of glob(resolve(MIGRATIONS, '*.sql'))) files.push(entry);
  files.sort();
  return Promise.all(files.map(async file => ({ file, sql: await readFile(file, 'utf-8') })));
}

describe('operator catalogue', () => {
  it('has unique ids and complete metadata', () => {
    const ids = new Set<string>();
    for (const op of allOperators) {
      expect(op.id, 'operator id').toMatch(/^[a-z0-9-]+$/);
      expect(ids.has(op.id), `duplicate operator id ${op.id}`).toBe(false);
      ids.add(op.id);
      expect(op.name.length, `${op.id} name`).toBeGreaterThan(0);
      expect(op.description.length, `${op.id} description`).toBeGreaterThan(0);
      expect(op.consequence.length, `${op.id} consequence`).toBeGreaterThan(0);
      expect(['ast', 'string']).toContain(op.transform);
    }
  });

  it('only targets rules that exist', () => {
    const known = new Set(allRules.map(r => r.id));
    for (const op of allOperators) {
      for (const ruleId of op.targetRules) {
        expect(known.has(ruleId), `${op.id} targets unknown rule ${ruleId}`).toBe(true);
      }
    }
  });

  it('documents exactly the operators with no rule coverage', () => {
    const uncovered = allOperators.filter(op => op.targetRules.length === 0).map(op => op.id);
    // MP084 and MP085 were written against the two operators that used to sit here.
    expect(uncovered.sort()).toEqual([]);
  });
});

describe('concurrency operators', () => {
  it('strips CONCURRENTLY from CREATE INDEX', async () => {
    const result = await mutate('strip-concurrently-create-index', 'CREATE INDEX CONCURRENTLY idx_users_email ON users (email);');
    expect(result?.sql).toBe('CREATE INDEX idx_users_email ON users (email)');
  });

  it('strips CONCURRENTLY from CREATE UNIQUE INDEX IF NOT EXISTS', async () => {
    const result = await mutate('strip-concurrently-create-index', 'CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_users_email ON users (email);');
    expect(result?.sql).toBe('CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email ON users (email)');
  });

  it('does not apply to an index that is already blocking', async () => {
    expect(await mutate('strip-concurrently-create-index', 'CREATE INDEX idx_users_email ON users (email);')).toBeNull();
  });

  it('strips CONCURRENTLY from DROP INDEX', async () => {
    const result = await mutate('strip-concurrently-drop-index', 'DROP INDEX CONCURRENTLY IF EXISTS idx_users_email;');
    expect(result?.sql).toBe('DROP INDEX IF EXISTS idx_users_email');
  });

  it('strips CONCURRENTLY from REINDEX', async () => {
    const result = await mutate('strip-concurrently-reindex', 'REINDEX INDEX CONCURRENTLY idx_users_email;');
    expect(result?.sql).toBe('REINDEX INDEX idx_users_email');
  });

  it('strips CONCURRENTLY from DETACH PARTITION', async () => {
    const result = await mutate('strip-concurrently-detach-partition', 'ALTER TABLE events DETACH PARTITION events_2023 CONCURRENTLY;');
    expect(result?.sql).toBe('ALTER TABLE events DETACH PARTITION events_2023');
  });

  it('wraps a CONCURRENTLY statement in a transaction block', async () => {
    const result = await mutate('wrap-concurrently-in-transaction', 'CREATE INDEX CONCURRENTLY idx_users_email ON users (email);');
    expect(result?.sql).toBe('BEGIN;\nCREATE INDEX CONCURRENTLY idx_users_email ON users (email);\nCOMMIT');
  });

  it('does not re-wrap a statement already inside a transaction', async () => {
    const sql = 'BEGIN;\nCREATE INDEX CONCURRENTLY idx_users_email ON users (email);\nCOMMIT;';
    expect(await mutate('wrap-concurrently-in-transaction', sql, 1)).toBeNull();
  });
});

describe('constraint operators', () => {
  it('strips NOT VALID from a CHECK constraint', async () => {
    const result = await mutate('strip-not-valid-check', 'ALTER TABLE orders ADD CONSTRAINT chk_total CHECK (total >= 0) NOT VALID;');
    expect(result?.sql).toBe('ALTER TABLE orders ADD CONSTRAINT chk_total CHECK (total >= 0)');
  });

  it('strips NOT VALID from a foreign key', async () => {
    const result = await mutate('strip-not-valid-fk', 'ALTER TABLE orders ADD CONSTRAINT fk_customer FOREIGN KEY (customer_id) REFERENCES customers (id) NOT VALID;');
    expect(result?.sql).toBe('ALTER TABLE orders ADD CONSTRAINT fk_customer FOREIGN KEY (customer_id) REFERENCES customers (id)');
  });

  it('leaves an already validating CHECK constraint alone', async () => {
    expect(await mutate('strip-not-valid-check', 'ALTER TABLE orders ADD CONSTRAINT chk_total CHECK (total >= 0);')).toBeNull();
  });

  it('rewrites UNIQUE USING INDEX into a direct UNIQUE constraint', async () => {
    const sql = [
      'CREATE UNIQUE INDEX CONCURRENTLY uq_customers_email_idx ON customers (email);',
      'ALTER TABLE customers ADD CONSTRAINT uq_customers_email UNIQUE USING INDEX uq_customers_email_idx;',
    ].join('\n');
    const result = await mutate('unique-constraint-drop-using-index', sql, 1);
    expect(result?.sql).toBe('ALTER TABLE customers ADD CONSTRAINT uq_customers_email UNIQUE (email)');
  });

  it('uses every column of a composite unique index', async () => {
    const sql = [
      'CREATE UNIQUE INDEX CONCURRENTLY uq_memberships ON memberships (org_id, user_id);',
      'ALTER TABLE memberships ADD CONSTRAINT uq_memberships_cols UNIQUE USING INDEX uq_memberships;',
    ].join('\n');
    const result = await mutate('unique-constraint-drop-using-index', sql, 1);
    expect(result?.sql).toBe('ALTER TABLE memberships ADD CONSTRAINT uq_memberships_cols UNIQUE (org_id, user_id)');
  });

  it('declines when the referenced index is not in the migration', async () => {
    const sql = 'ALTER TABLE customers ADD CONSTRAINT uq_customers_email UNIQUE USING INDEX uq_customers_email_idx;';
    expect(await mutate('unique-constraint-drop-using-index', sql)).toBeNull();
  });

  it('collapses the CHECK + VALIDATE pattern into a bare SET NOT NULL', async () => {
    const sql = [
      "ALTER TABLE orders ADD CONSTRAINT chk_status_nn CHECK (status IS NOT NULL) NOT VALID;",
      'ALTER TABLE orders VALIDATE CONSTRAINT chk_status_nn;',
      'ALTER TABLE orders ALTER COLUMN status SET NOT NULL;',
    ].join('\n');
    const result = await mutate('collapse-check-to-set-not-null', sql, 2);
    expect(result?.sql).toBe('ALTER TABLE orders ALTER COLUMN status SET NOT NULL');
    expect(result?.removes).toEqual([0, 1]);
  });

  it('does not collapse when the CHECK is about another column', async () => {
    const sql = [
      "ALTER TABLE orders ADD CONSTRAINT chk_total_nn CHECK (total IS NOT NULL) NOT VALID;",
      'ALTER TABLE orders ALTER COLUMN status SET NOT NULL;',
    ].join('\n');
    expect(await mutate('collapse-check-to-set-not-null', sql, 1)).toBeNull();
  });
});

describe('timeout operators', () => {
  const withDdl = "SET lock_timeout = '5s';\nALTER TABLE orders ADD COLUMN note TEXT;";

  it('deletes SET lock_timeout ahead of lock-heavy DDL', async () => {
    const result = await mutate('remove-lock-timeout', withDdl);
    expect(result).toEqual({ sql: '' });
  });

  it('leaves lock_timeout alone when nothing lock-heavy follows', async () => {
    const sql = "SET lock_timeout = '5s';\nCREATE INDEX CONCURRENTLY idx_orders_id ON orders (id);";
    expect(await mutate('remove-lock-timeout', sql)).toBeNull();
  });

  it('deletes SET statement_timeout ahead of a long-running statement', async () => {
    const sql = "SET statement_timeout = '30s';\nALTER TABLE orders VALIDATE CONSTRAINT chk_total;";
    expect(await mutate('remove-statement-timeout', sql)).toEqual({ sql: '' });
  });

  it('leaves statement_timeout alone ahead of a metadata-only change', async () => {
    const sql = "SET statement_timeout = '30s';\nALTER TABLE orders ADD COLUMN note TEXT;";
    expect(await mutate('remove-statement-timeout', sql)).toBeNull();
  });
});

describe('column operators', () => {
  it('adds a volatile default to a new timestamp column', async () => {
    const result = await mutate('add-volatile-default', 'ALTER TABLE orders ADD COLUMN shipped_at TIMESTAMPTZ;');
    expect(result?.sql).toBe('ALTER TABLE orders ADD COLUMN shipped_at TIMESTAMPTZ DEFAULT now()');
  });

  it('does not add a second default', async () => {
    expect(await mutate('add-volatile-default', "ALTER TABLE orders ADD COLUMN shipped_at TIMESTAMPTZ DEFAULT '2020-01-01';")).toBeNull();
  });

  it('does not add a volatile default to a non-temporal column', async () => {
    expect(await mutate('add-volatile-default', 'ALTER TABLE orders ADD COLUMN note TEXT;')).toBeNull();
  });

  it('makes a nullable new column NOT NULL', async () => {
    const result = await mutate('add-column-not-null', 'ALTER TABLE orders ADD COLUMN note TEXT;');
    expect(result?.sql).toBe('ALTER TABLE orders ADD COLUMN note TEXT NOT NULL');
  });

  it('leaves a column that is already NOT NULL alone', async () => {
    expect(await mutate('add-column-not-null', 'ALTER TABLE orders ADD COLUMN note TEXT NOT NULL;')).toBeNull();
  });

  it('replaces ADD COLUMN with a RENAME COLUMN', async () => {
    const result = await mutate('rename-instead-of-add-column', 'ALTER TABLE orders ADD COLUMN shipped_at TIMESTAMPTZ;');
    expect(result?.sql).toBe('ALTER TABLE orders RENAME COLUMN shipped_at TO shipped_at_v2');
  });

  it('narrows a BIGINT primary key to INTEGER', async () => {
    const result = await mutate('narrow-bigint-to-int', 'CREATE TABLE orders (id BIGINT PRIMARY KEY, total BIGINT);');
    expect(result?.sql).toBe('CREATE TABLE orders (id INTEGER PRIMARY KEY, total BIGINT)');
  });

  it('ignores BIGINT columns that are not keys', async () => {
    expect(await mutate('narrow-bigint-to-int', 'CREATE TABLE orders (id UUID PRIMARY KEY, total BIGINT);')).toBeNull();
  });

  it('narrows TEXT to VARCHAR(255) in CREATE TABLE', async () => {
    const result = await mutate('narrow-text-to-varchar', 'CREATE TABLE orders (id UUID PRIMARY KEY, note TEXT);');
    expect(result?.sql).toBe('CREATE TABLE orders (id UUID PRIMARY KEY, note VARCHAR(255))');
  });

  it('narrows TEXT to VARCHAR(255) in ADD COLUMN', async () => {
    const result = await mutate('narrow-text-to-varchar', 'ALTER TABLE orders ADD COLUMN note TEXT;');
    expect(result?.sql).toBe('ALTER TABLE orders ADD COLUMN note VARCHAR(255)');
  });
});

describe('destructive operators', () => {
  it('adds CASCADE to a DROP', async () => {
    const result = await mutate('add-drop-cascade', 'DROP TABLE IF EXISTS legacy_orders;');
    expect(result?.sql).toBe('DROP TABLE IF EXISTS legacy_orders CASCADE');
  });

  it('does not add CASCADE to DROP INDEX CONCURRENTLY', async () => {
    expect(await mutate('add-drop-cascade', 'DROP INDEX CONCURRENTLY idx_orders_id;')).toBeNull();
  });

  it('adds CASCADE to a TRUNCATE', async () => {
    const result = await mutate('add-truncate-cascade', 'TRUNCATE order_events;');
    expect(result?.sql).toBe('TRUNCATE order_events CASCADE');
  });

  it('strips IF NOT EXISTS from CREATE TABLE', async () => {
    const result = await mutate('strip-if-not-exists', 'CREATE TABLE IF NOT EXISTS orders (id UUID PRIMARY KEY);');
    expect(result?.sql).toBe('CREATE TABLE orders (id UUID PRIMARY KEY)');
  });

  it('turns VACUUM into VACUUM FULL', async () => {
    const result = await mutate('vacuum-to-vacuum-full', 'VACUUM ANALYZE orders;');
    expect(result?.sql).toBe('VACUUM FULL ANALYZE orders');
  });

  it('adds FULL inside a parenthesised VACUUM option list', async () => {
    const result = await mutate('vacuum-to-vacuum-full', 'VACUUM (VERBOSE, ANALYZE) orders;');
    expect(result?.sql).toBe('VACUUM (FULL, VERBOSE, ANALYZE) orders');
  });

  it('leaves VACUUM FULL alone', async () => {
    expect(await mutate('vacuum-to-vacuum-full', 'VACUUM FULL orders;')).toBeNull();
  });

  it('widens GRANT SELECT to GRANT ALL', async () => {
    const result = await mutate('grant-select-to-grant-all', 'GRANT SELECT ON orders TO reporting_role;');
    expect(result?.sql).toBe('GRANT ALL ON orders TO reporting_role');
  });

  it('widens a multi-privilege GRANT', async () => {
    const result = await mutate('grant-select-to-grant-all', 'GRANT SELECT, INSERT ON orders TO app_role;');
    expect(result?.sql).toBe('GRANT ALL ON orders TO app_role');
  });

  it('leaves a column-level GRANT alone', async () => {
    expect(await mutate('grant-select-to-grant-all', 'GRANT SELECT (id, total) ON orders TO reporting_role;')).toBeNull();
  });

  it('leaves REVOKE alone', async () => {
    expect(await mutate('grant-select-to-grant-all', 'REVOKE SELECT ON orders FROM reporting_role;')).toBeNull();
  });
});

describe('DML operators', () => {
  it('strips the WHERE clause from an UPDATE', async () => {
    const result = await mutate('strip-where-update', "UPDATE orders SET status = 'archived' WHERE created_at < '2020-01-01';");
    expect(result?.sql).toBe("UPDATE orders SET status = 'archived'");
  });

  it('strips the WHERE clause from a DELETE', async () => {
    const result = await mutate('strip-where-delete', "DELETE FROM order_events WHERE created_at < '2020-01-01';");
    expect(result?.sql).toBe('DELETE FROM order_events');
  });

  it('declines when a subquery also has a WHERE clause', async () => {
    const sql = 'UPDATE orders SET total = 0 WHERE id IN (SELECT id FROM refunds WHERE amount > 0);';
    expect(await mutate('strip-where-update', sql)).toBeNull();
  });

  it('declines on an UPDATE with no WHERE clause', async () => {
    expect(await mutate('strip-where-update', "UPDATE orders SET status = 'archived';")).toBeNull();
  });
});

describe('statement splicing', () => {
  it('excludes leading comments from a statement span', () => {
    const sql = '-- set a guard\nSET lock_timeout = \'5s\';\nVACUUM orders;';
    const { start, end } = statementSpan(sql, 0, sql.indexOf(';'));
    expect(sql.slice(start, end)).toBe("SET lock_timeout = '5s'");
  });

  it('removes the trailing semicolon and newline when deleting a statement', async () => {
    const sql = "SET lock_timeout = '5s';\nALTER TABLE orders ADD COLUMN note TEXT;\n";
    const parsed = await parseMigration(sql);
    const spans = parsed.statements.map(s => {
      const { start, end } = statementSpan(sql, s.stmtLocation, s.stmtLen ?? sql.length - s.stmtLocation);
      return { start, end, sql: sql.slice(start, end), stmt: s.stmt, line: 1 };
    });
    expect(applyEdit(sql, spans, 0, '', [])).toBe('ALTER TABLE orders ADD COLUMN note TEXT;\n');
  });
});

describe('violation delta', () => {
  const violation = (ruleId: string, severity: 'critical' | 'warning' = 'critical') => ({
    ruleId, ruleName: ruleId, severity, message: '', line: 1,
  });

  it('reports only violations the mutation introduced', () => {
    const baseline = [violation('MP004')];
    const mutant = [violation('MP004'), violation('MP001')];
    expect(newViolations(baseline, mutant).map(v => v.ruleId)).toEqual(['MP001']);
  });

  it('counts a second violation of an already-failing rule as new', () => {
    const baseline = [violation('MP004')];
    const mutant = [violation('MP004'), violation('MP004')];
    expect(newViolations(baseline, mutant)).toHaveLength(1);
  });

  it('honours the failOn threshold', () => {
    expect(meetsFailOn('warning', 'critical')).toBe(false);
    expect(meetsFailOn('critical', 'critical')).toBe(true);
    expect(meetsFailOn('warning', 'warning')).toBe(true);
    expect(meetsFailOn('critical', 'never')).toBe(false);
  });
});

describe('golden fixture: permissive config', () => {
  it('finds the holes its three loosened settings opened', async () => {
    const report = await runMutationTest(await fixtureInputs(), await optionsFor('permissive'));

    expect(report.totalMutants).toBeGreaterThan(20);
    expect(report.holes.length).toBeGreaterThan(0);

    const disabled = report.holes.find(h => h.operatorId === 'strip-not-valid-fk');
    expect(disabled?.reason?.kind).toBe('rule-disabled');
    expect(disabled?.reason?.ruleIds).toContain('MP005');

    const downgraded = report.holes.find(h => h.operatorId === 'strip-concurrently-create-index');
    expect(downgraded?.reason?.kind).toBe('severity-downgraded');
    expect(downgraded?.reason?.ruleIds).toContain('MP001');

    const threshold = report.holes.find(h => h.reason?.kind === 'fail-on-threshold');
    expect(threshold).toBeDefined();

    // Every hole names a rule that would have caught it.
    for (const hole of report.holes) {
      expect(hole.reason?.ruleIds.length, `${hole.operatorId} has no diagnosed rule`).toBeGreaterThan(0);
    }
  });

  it('analyses every fixture from a clean baseline', async () => {
    const report = await runMutationTest(await fixtureInputs(), await optionsFor('permissive'));
    for (const file of report.files) {
      expect(file.skipped, `${file.file} was skipped`).toBeUndefined();
      expect(file.baselineClean, `${file.file} does not pass its own config`).toBe(true);
    }
  });
});

describe('golden fixture: strict config', () => {
  it('leaves no config holes', async () => {
    const report = await runMutationTest(await fixtureInputs(), await optionsFor('strict'));

    expect(report.holes).toEqual([]);
    expect(report.caught).toBeGreaterThan(0);
    expect(report.caught).toBe(report.totalMutants - report.uncovered.length);
  });

  it('leaves no mutation uncovered', async () => {
    const report = await runMutationTest(await fixtureInputs(), await optionsFor('strict'));
    const operators = [...new Set(report.uncovered.map(m => m.operatorId))].sort();

    // add-column-not-null and grant-select-to-grant-all are now caught by
    // MP084 and MP085, which were written in response to this report.
    expect(operators).toEqual([]);
    for (const mutant of report.uncovered) {
      expect(mutant.reason?.kind).toBe('not-covered');
    }
  });

  it('catches strictly more than the permissive config', async () => {
    const inputs = await fixtureInputs();
    const strict = await runMutationTest(inputs, await optionsFor('strict'));
    const permissive = await runMutationTest(inputs, await optionsFor('permissive'));

    expect(strict.caught).toBeGreaterThan(permissive.caught);
    expect(strict.holes.length).toBeLessThan(permissive.holes.length);
  });
});

describe('runner behaviour', () => {
  it('is deterministic across runs', async () => {
    const inputs = await fixtureInputs();
    const options = await optionsFor('permissive');
    const first = await runMutationTest(inputs, options);
    const second = await runMutationTest(inputs, options);

    const signature = (r: typeof first) => r.files.flatMap(f => f.mutants.map(m => `${f.file}|${m.operatorId}|${m.line}|${m.status}|${m.reason?.kind ?? ''}`));
    expect(signature(second)).toEqual(signature(first));
  });

  it('does not emit duplicate mutants for the same operator and text', async () => {
    const sql = [
      "SET lock_timeout = '5s';",
      'CREATE INDEX CONCURRENTLY idx_a ON t (a);',
      'CREATE INDEX CONCURRENTLY idx_b ON t (b);',
    ].join('\n');
    const report = await mutateFile('dup.sql', sql, await optionsFor('strict'));

    const keys = report.mutants.map(m => `${m.operatorId}|${m.line}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('skips a file it cannot parse', async () => {
    const report = await mutateFile('broken.sql', 'CREATE TABLE (;', await optionsFor('strict'));
    expect(report.skipped).toBeDefined();
    expect(report.mutants).toEqual([]);
  });

  it('flags a file that already fails its own config', async () => {
    const report = await mutateFile('dirty.sql', 'CREATE INDEX idx_orders_id ON orders (id);', await optionsFor('permissive'));
    expect(report.baselineClean).toBe(false);
    expect(report.baselineViolations.length).toBeGreaterThan(0);
  });

  it('generates nothing from a migration no operator applies to', async () => {
    const report = await mutateFile('noop.sql', 'COMMENT ON TABLE orders IS \'customer orders\';', await optionsFor('strict'));
    expect(report.mutants).toEqual([]);
  });
});

describe('report formatting', () => {
  it('leads with the holes and ends with the caught count', async () => {
    const report = await runMutationTest(await fixtureInputs(), await optionsFor('permissive'));
    const text = formatMutationReport(report);

    expect(text).toContain('Your config would ALLOW:');
    expect(text).toContain('Guardrail caught');
    expect(text).toContain('experimental');
    expect(text.indexOf('Your config would ALLOW:')).toBeLessThan(text.indexOf('Guardrail caught'));
  });

  it('says so plainly when nothing slipped through', async () => {
    const report = await runMutationTest(await fixtureInputs(), await optionsFor('strict'));
    const text = formatMutationReport(report);

    expect(text).toContain('No config holes found.');
    expect(text).not.toContain('Your config would ALLOW:');
  });

  it('emits JSON a CI job can act on', async () => {
    const report = await runMutationTest(await fixtureInputs(), await optionsFor('permissive'));
    const parsed = JSON.parse(formatMutationJson(report)) as {
      holeCount: number;
      totalMutants: number;
      holes: Array<{ operator: string; reason: { kind: string } | null; targetRules: string[] }>;
    };

    expect(parsed.holeCount).toBe(report.holes.length);
    expect(parsed.totalMutants).toBe(report.totalMutants);
    expect(parsed.holes[0]?.reason?.kind).toBeDefined();
  });
});
