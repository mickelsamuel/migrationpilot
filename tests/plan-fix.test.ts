/**
 * Tests for `migrationpilot plan-fix`.
 *
 * The three required choreographies (SET NOT NULL, column type change,
 * unbatched backfill) are snapshotted whole, so a change to any emitted SQL,
 * lock note, or deploy boundary shows up in review. Everything else is
 * asserted on structure.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import chalk from 'chalk';
import { buildPlanFixReport, isPlannable, PLANNABLE_RULE_IDS } from '../src/fixer/plan-fix.js';
import { formatPlanFix, formatPlanFixJson } from '../src/fixer/plan-fix-format.js';
import { fixClassOf, PLAN_ONLY_RULE_IDS } from '../src/fixer/classification.js';
import { parseMigration } from '../src/parser/parse.js';
import { classifyLock } from '../src/locks/classify.js';
import { allRules, runRules } from '../src/rules/index.js';

// Disable colors for deterministic snapshot output
beforeAll(() => {
  chalk.level = 0;
});

async function plan(sql: string, pgVersion = 17, ruleFilter?: string[]) {
  const parsed = await parseMigration(sql);
  expect(parsed.errors).toEqual([]);
  const statements = parsed.statements.map(s => ({
    ...s,
    lock: classifyLock(s.stmt, pgVersion),
    line: sql.slice(0, s.stmtLocation).split('\n').length,
  }));
  let violations = runRules(allRules, statements, pgVersion, undefined, sql);
  if (ruleFilter) violations = violations.filter(v => ruleFilter.includes(v.ruleId));
  return buildPlanFixReport('migration.sql', statements, violations, pgVersion, fixClassOf);
}

/** Plain-text render with colour off, for snapshots. */
async function render(sql: string, pgVersion = 17, ruleFilter?: string[]) {
  return formatPlanFix(await plan(sql, pgVersion, ruleFilter));
}

describe('plannable rules', () => {
  it('covers every plan-only rule in the classification table', () => {
    for (const ruleId of PLAN_ONLY_RULE_IDS) {
      expect(isPlannable(ruleId), ruleId).toBe(true);
    }
  });

  it('also plans the two mechanical rules whose fix leaves follow-up work', () => {
    // --fix adds NOT VALID; the matching VALIDATE CONSTRAINT is a plan step.
    expect(isPlannable('MP005')).toBe(true);
    expect(isPlannable('MP030')).toBe(true);
    expect(PLANNABLE_RULE_IDS.size).toBe(PLAN_ONLY_RULE_IDS.size + 2);
  });
});

describe('choreography: SET NOT NULL', () => {
  const sql = "SET lock_timeout = '5s';\nSET statement_timeout = '30s';\nALTER TABLE users ALTER COLUMN email SET NOT NULL;";

  it('renders the PostgreSQL 17 plan', async () => {
    await expect(render(sql, 17, ['MP002', 'MP018'])).resolves.toMatchSnapshot();
  });

  it('renders the PostgreSQL 18 native plan', async () => {
    await expect(render(sql, 18, ['MP002', 'MP018'])).resolves.toMatchSnapshot();
  });

  it('renders the PostgreSQL 11 plan, where the scan cannot be avoided', async () => {
    await expect(render(sql, 11, ['MP002', 'MP018'])).resolves.toMatchSnapshot();
  });

  it('drops from four steps to two on PostgreSQL 18', async () => {
    const before = await plan(sql, 17, ['MP002']);
    const after = await plan(sql, 18, ['MP002']);
    expect(before.plans[0]!.steps).toHaveLength(4);
    expect(before.plans[0]!.pattern).toBe('check-then-not-null');
    expect(after.plans[0]!.steps).toHaveLength(2);
    expect(after.plans[0]!.pattern).toBe('pg18-not-null-not-valid');
    expect(after.plans[0]!.steps[0]!.sql).toContain('NOT NULL email NOT VALID');
  });

  it('folds MP002 and MP018 into one plan', async () => {
    const report = await plan(sql, 17, ['MP002', 'MP018']);
    expect(report.plans).toHaveLength(1);
    expect(report.plans[0]!.alsoResolves).toEqual(['MP018']);
  });

  it('needs no deploy boundary — it is database-only', async () => {
    const report = await plan(sql, 17, ['MP002']);
    expect(report.plans[0]!.boundaries).toEqual([]);
    expect(new Set(report.plans[0]!.steps.map(s => s.deploy)).size).toBe(1);
  });
});

describe('choreography: column type change', () => {
  const sql = "SET lock_timeout = '5s';\nSET statement_timeout = '30s';\nALTER TABLE orders ALTER COLUMN amount TYPE numeric(12,2);";

  it('renders the plan', async () => {
    await expect(render(sql, 17, ['MP007'])).resolves.toMatchSnapshot();
  });

  it('splits into three deploys, one boundary per application release', async () => {
    const report = await plan(sql, 17, ['MP007']);
    const p = report.plans[0]!;
    expect(p.pattern).toBe('expand-contract-column-type');
    expect(p.boundaries).toHaveLength(2);
    expect(new Set(p.steps.map(s => s.deploy))).toEqual(new Set([1, 2, 3]));

    // Every boundary sits exactly where the deploy group changes.
    for (const boundary of p.boundaries) {
      const before = p.steps.find(s => s.number === boundary.afterStep)!;
      const after = p.steps.find(s => s.number === boundary.afterStep + 1)!;
      expect(after.deploy).toBe(before.deploy + 1);
    }
    // Deploy groups never interleave.
    expect(p.steps.map(s => s.deploy)).toEqual([...p.steps.map(s => s.deploy)].sort((a, b) => a - b));
  });

  it('drops the sync trigger between the two releases, never after', async () => {
    // The trigger writes amount_new from amount. Dropping it after the app has
    // stopped writing amount would leave amount_new stale; dropping it before
    // the app reads amount_new would leave it unmaintained.
    const report = await plan(sql, 17, ['MP007']);
    const p = report.plans[0]!;
    const dropTrigger = p.steps.find(s => s.title === 'Drop the sync trigger')!;
    const dropColumn = p.steps.find(s => s.title.startsWith('Drop the old'))!;
    expect(p.boundaries[0]!.afterStep).toBeLessThan(dropTrigger.number);
    expect(p.boundaries[1]!.afterStep).toBe(dropTrigger.number);
    expect(dropColumn.number).toBeGreaterThan(dropTrigger.number);
  });

  it('keeps the type exactly as the author wrote it', async () => {
    const report = await plan(sql, 17, ['MP007']);
    expect(report.plans[0]!.steps[0]!.sql).toContain('ADD COLUMN amount_new numeric(12,2)');
  });

  it('marks the batched backfill as non-transactional', async () => {
    const report = await plan(sql, 17, ['MP007']);
    const backfill = report.plans[0]!.steps.find(s => s.title.includes('Backfill'))!;
    expect(backfill.transactional).toBe(false);
    expect(backfill.sql).toContain('COMMIT;');
    expect(backfill.sql).toContain('pg_sleep');
    expect(backfill.sql).toContain("SET lock_timeout = '5s';");
  });

  it('adds an overflow pre-check when the new type is narrower', async () => {
    const narrowing = "SET lock_timeout = '5s';\nSET statement_timeout = '30s';\nALTER TABLE orders ALTER COLUMN amount TYPE integer;";
    const report = await plan(narrowing, 17, ['MP044']);
    expect(report.plans[0]!.steps[0]!.title).toContain('Confirm no existing value overflows');
    expect(report.plans[0]!.steps).toHaveLength(7);
  });
});

describe('choreography: unbatched backfill', () => {
  it('renders the UPDATE plan', async () => {
    const sql = "SET lock_timeout = '5s';\nUPDATE users SET status = 'active';";
    await expect(render(sql, 17, ['MP011'])).resolves.toMatchSnapshot();
  });

  it('renders the DELETE plan', async () => {
    const sql = "SET lock_timeout = '5s';\nDELETE FROM sessions;";
    await expect(render(sql, 17, ['MP067'])).resolves.toMatchSnapshot();
  });

  it('carries the original SET list into the loop', async () => {
    const sql = "SET lock_timeout = '5s';\nUPDATE users SET status = 'active', updated_at = now();";
    const report = await plan(sql, 17, ['MP011']);
    expect(report.plans[0]!.steps[0]!.sql).toContain("SET status = 'active', updated_at = now()");
  });

  it('derives a runnable stop condition from a literal assignment', async () => {
    const sql = "SET lock_timeout = '5s';\nUPDATE users SET status = 'active';";
    const report = await plan(sql, 17, ['MP011']);
    expect(report.plans[0]!.steps[0]!.sql).toContain("WHERE status IS DISTINCT FROM 'active'");
  });

  it('refuses to derive one from a volatile assignment, which would loop forever', async () => {
    const sql = "SET lock_timeout = '5s';\nUPDATE users SET seen_at = now();";
    const report = await plan(sql, 17, ['MP011']);
    expect(report.plans[0]!.steps[0]!.sql).toContain('WHERE seen_at IS DISTINCT FROM <value>');
  });

  it('leaves the column open when several are assigned at once', async () => {
    const sql = "SET lock_timeout = '5s';\nUPDATE users SET status = 'active', updated_at = now();";
    const report = await plan(sql, 17, ['MP011']);
    expect(report.plans[0]!.steps[0]!.sql).toContain('WHERE <column> IS DISTINCT FROM <value>');
  });

  it('falls back to an externally driven loop before PostgreSQL 11', async () => {
    const sql = "SET lock_timeout = '5s';\nUPDATE users SET status = 'active';";
    const report = await plan(sql, 10, ['MP011']);
    const loop = report.plans[0]!.steps[0]!.sql;
    expect(loop).not.toContain('DO $$');
    expect(loop).toContain('Repeat until it reports UPDATE 0.');
  });
});

describe('choreography: unique constraint', () => {
  const sql = "SET lock_timeout = '5s';\nALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email);";

  it('renders the plan', async () => {
    await expect(render(sql, 17, ['MP027'])).resolves.toMatchSnapshot();
  });

  it('builds the index concurrently outside a transaction, then adopts it', async () => {
    const report = await plan(sql, 17, ['MP027']);
    const [build, adopt] = report.plans[0]!.steps;
    expect(build!.sql).toContain('CREATE UNIQUE INDEX CONCURRENTLY users_email_key_idx');
    expect(build!.sql).toContain('ON users (email)');
    expect(build!.transactional).toBe(false);
    expect(adopt!.sql).toContain('UNIQUE USING INDEX users_email_key_idx');
    expect(adopt!.transactional).toBe(true);
  });
});

describe('choreography: column rename', () => {
  const sql = 'ALTER TABLE accounts RENAME COLUMN name TO full_name;';

  it('renders the plan', async () => {
    await expect(render(sql, 17, ['MP010', 'MP071'])).resolves.toMatchSnapshot();
  });

  it('needs two application releases, with the trigger dropped between them', async () => {
    const report = await plan(sql, 17, ['MP010']);
    const p = report.plans[0]!;
    expect(p.boundaries.map(b => b.afterStep)).toEqual([3, 4]);
    expect(p.steps[3]!.title).toBe('Drop the mirroring trigger');
    expect(p.steps.map(s => s.deploy)).toEqual([1, 1, 1, 2, 3]);
  });
});

describe('choreography: NOT VALID then VALIDATE', () => {
  it('shows the validate step --fix cannot add', async () => {
    const sql = "SET lock_timeout = '5s';\nALTER TABLE orders ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users (id);";
    const report = await plan(sql, 17, ['MP005']);
    const p = report.plans[0]!;
    expect(p.steps).toHaveLength(2);
    expect(p.steps[1]!.sql).toContain('VALIDATE CONSTRAINT fk_user');
    expect(p.steps[1]!.lock).toBe('SHARE UPDATE EXCLUSIVE');
  });
});

describe('report structure', () => {
  it('separates mechanical leftovers from ones needing a human', async () => {
    const sql = 'CREATE INDEX idx_a ON t (c);\nDROP TABLE legacy;';
    const report = await plan(sql, 17);
    expect(report.plans).toEqual([]);
    expect(report.unplanned.some(u => u.ruleId === 'MP001' && u.fixClass === 'mechanical')).toBe(true);
    expect(report.unplanned.some(u => u.ruleId === 'MP026' && u.fixClass === 'unfixable')).toBe(true);
  });

  it('says so plainly when there is nothing to plan', async () => {
    const text = await render("SET lock_timeout = '5s';\nSET statement_timeout = '30s';\nCREATE INDEX CONCURRENTLY IF NOT EXISTS idx_a ON t (c);");
    expect(text).toContain('Nothing here needs a multi-step plan.');
  });

  it('matches one statement per violation even when lines collide', async () => {
    // Rules report the line of the previous statement's `;`, so both
    // statements answer to line 1 — the planner must still pick the right one.
    const sql = 'CREATE TABLE IF NOT EXISTS t (id bigint PRIMARY KEY);\n\n\nUPDATE t SET id = id;';
    const report = await plan(sql, 17, ['MP011']);
    expect(report.plans).toHaveLength(1);
    expect(report.plans[0]!.title).toContain('Backfill t in batches');
  });
});

describe('shared with the template command', () => {
  // plan-fix and `migrationpilot template` must keep rendering the same
  // choreographies. If someone writes SQL in one of them again, this fails.
  it('renders every add-not-null step into the matching template phase', async () => {
    const { generateTemplate } = await import('../src/templates/expand-contract.js');
    const { addNotNullChoreography, renderPhase } = await import('../src/templates/choreography.js');

    const choreography = addNotNullChoreography({ table: 'users', column: 'name', pgVersion: 17 });
    const template = generateTemplate('add-not-null', { table: 'users', column: 'name' });

    for (const step of choreography.steps) {
      expect(template[step.phase], step.title).toContain(step.sql);
    }
    expect(template.expand).toBe(renderPhase(choreography, 'expand'));
  });

  it('gives plan-fix the same SET NOT NULL SQL the template emits', async () => {
    const { generateTemplate } = await import('../src/templates/expand-contract.js');
    const sql = "SET lock_timeout = '5s';\nSET statement_timeout = '30s';\nALTER TABLE users ALTER COLUMN email SET NOT NULL;";

    const report = await plan(sql, 17, ['MP002']);
    const template = generateTemplate('add-not-null', { table: 'users', column: 'email' });
    const wholeTemplate = [template.expand, template.migrate, template.contract].join('\n');

    for (const step of report.plans[0]!.steps) {
      expect(wholeTemplate, step.title).toContain(step.sql);
    }
  });

  it('gives plan-fix the same rename SQL the template emits', async () => {
    const { generateTemplate } = await import('../src/templates/expand-contract.js');
    const report = await plan('ALTER TABLE accounts RENAME COLUMN name TO full_name;', 17, ['MP010']);
    const template = generateTemplate('rename-column', {
      table: 'accounts',
      column: 'name',
      newName: 'full_name',
      // plan-fix cannot know the source type, so it leaves a placeholder.
      columnType: '<same type as name>',
    });
    const wholeTemplate = [template.expand, template.migrate, template.contract].join('\n');

    for (const step of report.plans[0]!.steps) {
      expect(wholeTemplate, step.title).toContain(step.sql);
    }
  });

  it('lets change-type end either way, and each command picks its own', async () => {
    const { generateTemplate } = await import('../src/templates/expand-contract.js');
    const { changeTypeChoreography } = await import('../src/templates/choreography.js');

    // `template` swaps the names, so application code never changes.
    const template = generateTemplate('change-type', { table: 'orders', column: 'amount', newType: 'bigint' });
    expect(template.contract).toContain('RENAME COLUMN amount_new TO amount');

    const swap = changeTypeChoreography({ table: 'orders', column: 'amount', newType: 'bigint', strategy: 'swap' });
    expect(swap.boundaries).toEqual([]);

    // plan-fix hands over across releases, so the boundaries are visible.
    const handover = await plan(
      "SET lock_timeout = '5s';\nSET statement_timeout = '30s';\nALTER TABLE orders ALTER COLUMN amount TYPE bigint;",
      17,
      ['MP007'],
    );
    expect(handover.plans[0]!.boundaries).toHaveLength(2);
    expect(handover.plans[0]!.steps.some(s => s.sql.includes('RENAME COLUMN'))).toBe(false);
  });

  it('follows pgVersion in the template, the same way plan-fix does', async () => {
    const { generateTemplate } = await import('../src/templates/expand-contract.js');
    const opts = { table: 'users', column: 'name' };

    // PG18: the native NOT NULL constraint, no CHECK workaround, two phases.
    const pg18 = generateTemplate('add-not-null', { ...opts, pgVersion: 18 });
    expect(pg18.expand).toContain('NOT NULL name NOT VALID');
    expect(pg18.expand).not.toContain('CHECK');
    expect(pg18.contract).toContain('Nothing to do in the contract phase');

    // PG12-17: the CHECK stands in, so the final SET NOT NULL is instant.
    const pg17 = generateTemplate('add-not-null', { ...opts, pgVersion: 17 });
    expect(pg17.expand).toContain('CHECK (name IS NOT NULL)');
    expect(pg17.contract).toContain('SET NOT NULL');

    // Pre-12: no shortcut exists, so the plan is a guarded scan.
    const pg11 = generateTemplate('add-not-null', { ...opts, pgVersion: 11 });
    expect(pg11.migrate).toContain('Backfill the remaining NULLs');
    expect(pg11.contract).toContain('RESET lock_timeout');
  });

  it('defaults the template to PostgreSQL 17', async () => {
    const { generateTemplate } = await import('../src/templates/expand-contract.js');
    const explicit = generateTemplate('add-not-null', { table: 'users', column: 'name', pgVersion: 17 });
    const implicit = generateTemplate('add-not-null', { table: 'users', column: 'name' });
    expect(implicit).toEqual(explicit);
  });

  it('drops the DO block below PostgreSQL 11, which cannot COMMIT inside one', async () => {
    const { generateTemplate } = await import('../src/templates/expand-contract.js');
    const old = generateTemplate('change-type', { table: 't', column: 'c', newType: 'bigint', pgVersion: 10 });
    expect(old.migrate).not.toContain('DO $$');
    expect(old.migrate).toContain('Repeat until it reports UPDATE 0.');
  });

  it('commits every batch, in both commands', async () => {
    const { generateTemplate } = await import('../src/templates/expand-contract.js');
    // Without COMMIT the loop is one transaction holding its locks and WAL to
    // the end, which is the exact failure batching is meant to avoid.
    for (const op of ['rename-column', 'change-type', 'split-table'] as const) {
      const template = generateTemplate(op, { table: 't', column: 'c', newName: 'd', newType: 'bigint' });
      expect(template.migrate, op).toContain('COMMIT;');
    }

    const report = await plan("SET lock_timeout = '5s';\nUPDATE users SET status = 'active';", 17, ['MP011']);
    expect(report.plans[0]!.steps[0]!.sql).toContain('COMMIT;');
  });
});

describe('JSON output', () => {
  const sql = "SET lock_timeout = '5s';\nSET statement_timeout = '30s';\nALTER TABLE orders ALTER COLUMN amount TYPE numeric(12,2);";

  it('is valid JSON with the whole plan in it', async () => {
    const parsed = JSON.parse(formatPlanFixJson(await plan(sql, 17, ['MP007'])));
    expect(parsed.pgVersion).toBe(17);
    expect(parsed.plans).toHaveLength(1);
    expect(parsed.plans[0].pattern).toBe('expand-contract-column-type');
    expect(parsed.plans[0].deploys).toBe(3);
    expect(parsed.plans[0].steps).toHaveLength(6);
    expect(parsed.plans[0].boundaries).toHaveLength(2);
  });

  it('gives every step the fields tooling needs', async () => {
    const parsed = JSON.parse(formatPlanFixJson(await plan(sql, 17, ['MP007'])));
    for (const step of parsed.plans[0].steps) {
      // `phase` comes from the shared choreography model — it is what lets
      // `migrationpilot template` group these same steps into its three phases.
      expect(Object.keys(step).sort()).toEqual(
        ['deploy', 'duration', 'lock', 'lockNote', 'number', 'phase', 'sql', 'title', 'transactional'],
      );
    }
  });

  it('numbers steps from 1 without gaps', async () => {
    const parsed = JSON.parse(formatPlanFixJson(await plan(sql, 17, ['MP007'])));
    expect(parsed.plans[0].steps.map((s: { number: number }) => s.number)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
