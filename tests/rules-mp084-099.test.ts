import { describe, it, expect } from 'vitest';
import { parseMigration } from '../src/parser/parse.js';
import { requireDefaultForNotNullColumn } from '../src/rules/MP084-require-default-for-not-null-column.js';
import { warnGrantWidening } from '../src/rules/MP085-warn-grant-widening.js';
import { requireExplicitOnDelete } from '../src/rules/MP086-require-explicit-on-delete.js';
import { banVolatileCheckConstraint } from '../src/rules/MP087-ban-volatile-check-constraint.js';
import { requireAnalyzeAfterBackfill } from '../src/rules/MP088-require-analyze-after-backfill.js';
import { warnCollationChangeRewrite } from '../src/rules/MP089-warn-collation-change-rewrite.js';
import { warnTriggerOnHotTable } from '../src/rules/MP090-warn-trigger-on-hot-table.js';
import { warnPrivilegeDrift } from '../src/rules/MP091-warn-privilege-drift.js';
import { requirePartitionedIndexStrategy } from '../src/rules/MP092-require-partitioned-index-strategy.js';
import { warnDefaultPartitionGrowth } from '../src/rules/MP093-warn-default-partition-growth.js';
import { requireAttachPartitionCheck } from '../src/rules/MP094-require-attach-partition-check.js';
import { warnSetTablespaceRewrite } from '../src/rules/MP095-warn-set-tablespace-rewrite.js';
import { warnMatviewWithData } from '../src/rules/MP096-warn-matview-with-data.js';
import { banDropConstraintBackingIndex } from '../src/rules/MP097-ban-drop-constraint-backing-index.js';
import { warnSetSchema } from '../src/rules/MP098-warn-set-schema.js';
import { warnSecurityDefinerSearchPath } from '../src/rules/MP099-warn-security-definer-search-path.js';
import type { Rule, RuleViolation } from '../src/rules/engine.js';

/** Run a rule over every statement in `sql` and return all violations. */
async function checkAll(rule: Rule, sql: string, pgVersion = 17): Promise<RuleViolation[]> {
  const { statements } = await parseMigration(sql);
  const results: RuleViolation[] = [];
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i]!;
    const v = rule.check(stmt.stmt, {
      originalSql: stmt.originalSql,
      line: i + 1,
      pgVersion,
      lock: { lockType: 'ACCESS EXCLUSIVE', blocksReads: true, blocksWrites: true },
      allStatements: statements.map(s => ({ stmt: s.stmt, originalSql: s.originalSql })),
      statementIndex: i,
    });
    if (v) results.push(v);
  }
  return results;
}

/** First violation, or null when the rule stayed quiet. */
async function checkOne(rule: Rule, sql: string, pgVersion = 17): Promise<RuleViolation | null> {
  const all = await checkAll(rule, sql, pgVersion);
  return all[0] ?? null;
}

// ──────────────────────────────────────────────
// Cross-cutting: rendered output hygiene
// ──────────────────────────────────────────────

describe('violation text renders cleanly', () => {
  // Escaping a quote inside a template literal puts a literal backslash in
  // the terminal output. Messages are read by humans, not re-parsed.
  const cases: Array<[Rule, string]> = [
    [requireDefaultForNotNullColumn, 'ALTER TABLE users ADD COLUMN email TEXT NOT NULL;'],
    [warnGrantWidening, 'GRANT ALL ON users TO PUBLIC;'],
    [requireExplicitOnDelete, 'ALTER TABLE o ADD CONSTRAINT fk FOREIGN KEY (u) REFERENCES users(id);'],
    [banVolatileCheckConstraint, 'ALTER TABLE t ADD CONSTRAINT c CHECK (ts < now());'],
    [requireAnalyzeAfterBackfill, 'UPDATE users SET a = 1;'],
    [warnCollationChangeRewrite, 'ALTER TABLE t ALTER COLUMN c TYPE TEXT COLLATE "C";'],
    [warnTriggerOnHotTable, 'CREATE TRIGGER g AFTER INSERT ON users FOR EACH ROW EXECUTE FUNCTION f();'],
    [warnSetTablespaceRewrite, 'ALTER TABLE users SET TABLESPACE fast;'],
    [warnMatviewWithData, 'CREATE MATERIALIZED VIEW mv AS SELECT * FROM users;'],
    [banDropConstraintBackingIndex, 'ALTER TABLE users ADD CONSTRAINT users_pkey PRIMARY KEY (id);\nDROP INDEX users_pkey;'],
    [warnSetSchema, 'ALTER TABLE users SET SCHEMA archive;'],
    [warnSecurityDefinerSearchPath, 'CREATE FUNCTION f() RETURNS int AS $$ SELECT 1 $$ LANGUAGE sql SECURITY DEFINER;'],
    [warnDefaultPartitionGrowth, 'CREATE TABLE e_def PARTITION OF e DEFAULT;'],
    [requireAttachPartitionCheck, "ALTER TABLE e ATTACH PARTITION e1 FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');"],
  ];

  it.each(cases)('$0.id emits no literal backslash escapes', async (rule, sql) => {
    const v = await checkOne(rule, sql);
    expect(v, `${rule.id} produced no violation for its own fixture`).not.toBeNull();
    expect(v!.message).not.toContain('\\"');
    expect(v!.message).not.toContain('\\n');
    expect(v!.safeAlternative ?? '').not.toContain('\\"');
  });
});

// ──────────────────────────────────────────────
// MP084: require-default-for-not-null-column
// ──────────────────────────────────────────────

describe('MP084: require-default-for-not-null-column', () => {
  it('flags ADD COLUMN NOT NULL with no DEFAULT', async () => {
    const v = await checkOne(requireDefaultForNotNullColumn, 'ALTER TABLE users ADD COLUMN email TEXT NOT NULL;');
    expect(v).not.toBeNull();
    expect(v!.ruleId).toBe('MP084');
    expect(v!.severity).toBe('critical');
    expect(v!.message).toContain('email');
    expect(v!.message).toContain('users');
  });

  it('ignores ADD COLUMN NOT NULL DEFAULT', async () => {
    const v = await checkOne(requireDefaultForNotNullColumn, "ALTER TABLE users ADD COLUMN email TEXT NOT NULL DEFAULT '';");
    expect(v).toBeNull();
  });

  it('ignores nullable ADD COLUMN', async () => {
    const v = await checkOne(requireDefaultForNotNullColumn, 'ALTER TABLE users ADD COLUMN email TEXT;');
    expect(v).toBeNull();
  });

  it('ignores GENERATED ALWAYS AS IDENTITY (populates itself)', async () => {
    const v = await checkOne(requireDefaultForNotNullColumn, 'ALTER TABLE t ADD COLUMN id INT NOT NULL GENERATED ALWAYS AS IDENTITY;');
    expect(v).toBeNull();
  });

  it('ignores GENERATED ALWAYS AS (expr) STORED', async () => {
    const v = await checkOne(requireDefaultForNotNullColumn, 'ALTER TABLE t ADD COLUMN f INT NOT NULL GENERATED ALWAYS AS (a + b) STORED;');
    expect(v).toBeNull();
  });

  it('ignores SERIAL (expands to a nextval default)', async () => {
    const v = await checkOne(requireDefaultForNotNullColumn, 'ALTER TABLE t ADD COLUMN id SERIAL NOT NULL;');
    expect(v).toBeNull();
  });

  it('ignores unrelated ALTER TABLE commands', async () => {
    const v = await checkOne(requireDefaultForNotNullColumn, 'ALTER TABLE users DROP COLUMN email;');
    expect(v).toBeNull();
  });

  it('offers both a DEFAULT and a nullable-then-tighten path', async () => {
    const v = await checkOne(requireDefaultForNotNullColumn, 'ALTER TABLE orders ADD COLUMN total INT NOT NULL;');
    expect(v!.safeAlternative).toContain('NOT NULL DEFAULT');
    expect(v!.safeAlternative).toContain('NOT VALID');
  });
});

// ──────────────────────────────────────────────
// MP085: warn-grant-widening
// ──────────────────────────────────────────────

describe('MP085: warn-grant-widening', () => {
  it('flags GRANT ALL (no explicit privilege list)', async () => {
    const v = await checkOne(warnGrantWidening, 'GRANT ALL ON users TO app;');
    expect(v).not.toBeNull();
    expect(v!.ruleId).toBe('MP085');
    expect(v!.message).toContain('ALL PRIVILEGES');
  });

  it('flags GRANT to PUBLIC', async () => {
    const v = await checkOne(warnGrantWidening, 'GRANT SELECT ON users TO PUBLIC;');
    expect(v).not.toBeNull();
    expect(v!.message).toContain('PUBLIC');
  });

  it('flags blanket ALL TABLES IN SCHEMA grants', async () => {
    const v = await checkOne(warnGrantWidening, 'GRANT SELECT ON ALL TABLES IN SCHEMA public TO app;');
    expect(v).not.toBeNull();
    expect(v!.message).toContain('every table in the schema');
  });

  it('ignores a narrow grant to a named role', async () => {
    const v = await checkOne(warnGrantWidening, 'GRANT SELECT, INSERT ON users TO app;');
    expect(v).toBeNull();
  });

  it('ignores REVOKE, which narrows rather than widens', async () => {
    const v = await checkOne(warnGrantWidening, 'REVOKE ALL ON users FROM PUBLIC;');
    expect(v).toBeNull();
  });

  it('reports both reasons when a grant is ALL and to PUBLIC', async () => {
    const v = await checkOne(warnGrantWidening, 'GRANT ALL ON users TO PUBLIC;');
    expect(v!.message).toContain('PUBLIC');
    expect(v!.message).toContain('ALL PRIVILEGES');
  });
});

// ──────────────────────────────────────────────
// MP086: require-explicit-on-delete
// ──────────────────────────────────────────────

describe('MP086: require-explicit-on-delete', () => {
  it('flags ALTER TABLE ADD FK with no ON DELETE', async () => {
    const v = await checkOne(requireExplicitOnDelete, 'ALTER TABLE orders ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id);');
    expect(v).not.toBeNull();
    expect(v!.ruleId).toBe('MP086');
    expect(v!.message).toContain('NO ACTION');
    expect(v!.message).toContain('fk_user');
  });

  it('ignores FK with an explicit ON DELETE CASCADE', async () => {
    const v = await checkOne(requireExplicitOnDelete, 'ALTER TABLE orders ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;');
    expect(v).toBeNull();
  });

  it('ignores an explicit ON DELETE NO ACTION — the default was chosen', async () => {
    const v = await checkOne(requireExplicitOnDelete, 'ALTER TABLE orders ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE NO ACTION;');
    expect(v).toBeNull();
  });

  it('flags a column-level REFERENCES in CREATE TABLE', async () => {
    const v = await checkOne(requireExplicitOnDelete, 'CREATE TABLE orders (id BIGINT, user_id BIGINT REFERENCES users(id));');
    expect(v).not.toBeNull();
    expect(v!.ruleId).toBe('MP086');
  });

  it('flags a table-level FOREIGN KEY in CREATE TABLE', async () => {
    const v = await checkOne(requireExplicitOnDelete, 'CREATE TABLE orders (id BIGINT, user_id BIGINT, FOREIGN KEY (user_id) REFERENCES users(id));');
    expect(v).not.toBeNull();
  });

  it('ignores CREATE TABLE with no foreign key', async () => {
    const v = await checkOne(requireExplicitOnDelete, 'CREATE TABLE orders (id BIGINT, total INT);');
    expect(v).toBeNull();
  });

  it('names the referenced table in the message', async () => {
    const v = await checkOne(requireExplicitOnDelete, 'ALTER TABLE payments ADD CONSTRAINT fk_o FOREIGN KEY (order_id) REFERENCES orders(id);');
    expect(v!.message).toContain('orders');
    expect(v!.message).toContain('order_id');
  });
});

// ──────────────────────────────────────────────
// MP087: ban-volatile-check-constraint
// ──────────────────────────────────────────────

describe('MP087: ban-volatile-check-constraint', () => {
  it('flags CHECK using now()', async () => {
    const v = await checkOne(banVolatileCheckConstraint, 'ALTER TABLE t ADD CONSTRAINT c CHECK (created_at < now());');
    expect(v).not.toBeNull();
    expect(v!.ruleId).toBe('MP087');
    expect(v!.severity).toBe('critical');
    expect(v!.message).toContain('now()');
  });

  it('flags CHECK using random()', async () => {
    const v = await checkOne(banVolatileCheckConstraint, 'ALTER TABLE t ADD CONSTRAINT c CHECK (r < random());');
    expect(v).not.toBeNull();
    expect(v!.message).toContain('random()');
  });

  it('flags an inline CHECK in CREATE TABLE', async () => {
    const v = await checkOne(banVolatileCheckConstraint, 'CREATE TABLE t (ts timestamptz, CHECK (ts < now()));');
    expect(v).not.toBeNull();
  });

  it('flags a volatile call nested inside a subquery', async () => {
    const v = await checkOne(banVolatileCheckConstraint, 'ALTER TABLE t ADD CONSTRAINT c CHECK (ts < (SELECT now()));');
    expect(v).not.toBeNull();
  });

  it('ignores an immutable CHECK', async () => {
    const v = await checkOne(banVolatileCheckConstraint, 'ALTER TABLE t ADD CONSTRAINT c CHECK (a > 0);');
    expect(v).toBeNull();
  });

  it('ignores a CHECK comparing two stored columns', async () => {
    const v = await checkOne(banVolatileCheckConstraint, 'ALTER TABLE t ADD CONSTRAINT c CHECK (expires_at > created_at);');
    expect(v).toBeNull();
  });

  it('does not trip on a column whose name merely contains a function name', async () => {
    const v = await checkOne(banVolatileCheckConstraint, 'ALTER TABLE t ADD CONSTRAINT c CHECK (random_seed > 0 AND now_utc IS NOT NULL);');
    expect(v).toBeNull();
  });

  it('resolves schema-qualified pg_catalog.now()', async () => {
    const v = await checkOne(banVolatileCheckConstraint, 'ALTER TABLE t ADD CONSTRAINT c CHECK (ts < pg_catalog.now());');
    expect(v).not.toBeNull();
    expect(v!.message).toContain('now()');
  });

  it('ignores a non-CHECK constraint', async () => {
    const v = await checkOne(banVolatileCheckConstraint, 'ALTER TABLE t ADD CONSTRAINT u UNIQUE (email);');
    expect(v).toBeNull();
  });
});

// ──────────────────────────────────────────────
// MP088: require-analyze-after-backfill
// ──────────────────────────────────────────────

describe('MP088: require-analyze-after-backfill', () => {
  it('flags an UPDATE backfill with no ANALYZE', async () => {
    const v = await checkOne(requireAnalyzeAfterBackfill, 'UPDATE users SET status = 1 WHERE status IS NULL;');
    expect(v).not.toBeNull();
    expect(v!.ruleId).toBe('MP088');
    expect(v!.message).toContain('users');
  });

  it('accepts a backfill followed by ANALYZE on the same table', async () => {
    const sql = `UPDATE users SET status = 1 WHERE status IS NULL;
ANALYZE users;`;
    const v = await checkOne(requireAnalyzeAfterBackfill, sql);
    expect(v).toBeNull();
  });

  it('accepts a bare ANALYZE, which covers every table', async () => {
    const sql = `UPDATE users SET status = 1;
ANALYZE;`;
    const v = await checkOne(requireAnalyzeAfterBackfill, sql);
    expect(v).toBeNull();
  });

  it('accepts VACUUM ANALYZE as a statistics refresh', async () => {
    const sql = `UPDATE users SET status = 1;
VACUUM ANALYZE users;`;
    const v = await checkOne(requireAnalyzeAfterBackfill, sql);
    expect(v).toBeNull();
  });

  it('still flags when ANALYZE targets a different table', async () => {
    const sql = `UPDATE users SET status = 1;
ANALYZE orders;`;
    const v = await checkOne(requireAnalyzeAfterBackfill, sql);
    expect(v).not.toBeNull();
  });

  it('still flags when ANALYZE runs before the backfill', async () => {
    const sql = `ANALYZE users;
UPDATE users SET status = 1;`;
    const v = await checkOne(requireAnalyzeAfterBackfill, sql);
    expect(v).not.toBeNull();
  });

  it('flags INSERT ... SELECT but not INSERT ... VALUES', async () => {
    const fromSelect = await checkOne(requireAnalyzeAfterBackfill, 'INSERT INTO archive SELECT * FROM users;');
    expect(fromSelect).not.toBeNull();

    const fromValues = await checkOne(requireAnalyzeAfterBackfill, "INSERT INTO settings VALUES ('k', 'v');");
    expect(fromValues).toBeNull();
  });

  it('reports once per table even with several backfills', async () => {
    const sql = `UPDATE users SET a = 1;
UPDATE users SET b = 2;
UPDATE users SET c = 3;`;
    const all = await checkAll(requireAnalyzeAfterBackfill, sql);
    expect(all).toHaveLength(1);
  });

  it('reports separately for different tables', async () => {
    const sql = `UPDATE users SET a = 1;
UPDATE orders SET b = 2;`;
    const all = await checkAll(requireAnalyzeAfterBackfill, sql);
    expect(all).toHaveLength(2);
  });

  it('ignores plain DDL', async () => {
    const v = await checkOne(requireAnalyzeAfterBackfill, 'ALTER TABLE users ADD COLUMN x INT;');
    expect(v).toBeNull();
  });
});

// ──────────────────────────────────────────────
// MP089: warn-collation-change-rewrite
// ──────────────────────────────────────────────

describe('MP089: warn-collation-change-rewrite', () => {
  it('flags ALTER COLUMN TYPE with a COLLATE clause', async () => {
    const v = await checkOne(warnCollationChangeRewrite, 'ALTER TABLE t ALTER COLUMN c TYPE TEXT COLLATE "en_US";');
    expect(v).not.toBeNull();
    expect(v!.ruleId).toBe('MP089');
    expect(v!.message).toContain('en_US');
    expect(v!.message).toContain('c');
  });

  it('flags the SET DATA TYPE spelling too', async () => {
    const v = await checkOne(warnCollationChangeRewrite, 'ALTER TABLE t ALTER COLUMN c SET DATA TYPE TEXT COLLATE "C";');
    expect(v).not.toBeNull();
  });

  it('ignores a type change with no COLLATE clause', async () => {
    const v = await checkOne(warnCollationChangeRewrite, 'ALTER TABLE t ALTER COLUMN c TYPE TEXT;');
    expect(v).toBeNull();
  });

  it('ignores unrelated ALTER TABLE commands', async () => {
    const v = await checkOne(warnCollationChangeRewrite, 'ALTER TABLE t ADD COLUMN c TEXT;');
    expect(v).toBeNull();
  });

  it('suggests the expand-contract path', async () => {
    const v = await checkOne(warnCollationChangeRewrite, 'ALTER TABLE users ALTER COLUMN name TYPE TEXT COLLATE "C";');
    expect(v!.safeAlternative).toContain('CONCURRENTLY');
  });
});

// ──────────────────────────────────────────────
// MP090: warn-trigger-on-hot-table
// ──────────────────────────────────────────────

describe('MP090: warn-trigger-on-hot-table', () => {
  it('flags a row-level trigger', async () => {
    const v = await checkOne(warnTriggerOnHotTable, 'CREATE TRIGGER trg AFTER INSERT ON users FOR EACH ROW EXECUTE FUNCTION audit();');
    expect(v).not.toBeNull();
    expect(v!.ruleId).toBe('MP090');
    expect(v!.message).toContain('trg');
    expect(v!.message).toContain('users');
    expect(v!.message).toContain('audit');
  });

  it('ignores a statement-level trigger', async () => {
    const v = await checkOne(warnTriggerOnHotTable, 'CREATE TRIGGER trg AFTER INSERT ON users FOR EACH STATEMENT EXECUTE FUNCTION audit();');
    expect(v).toBeNull();
  });

  it('ignores a trigger that omits FOR EACH ROW (statement-level by default)', async () => {
    const v = await checkOne(warnTriggerOnHotTable, 'CREATE TRIGGER trg AFTER INSERT ON users EXECUTE FUNCTION audit();');
    expect(v).toBeNull();
  });

  it('decodes the event mask into names', async () => {
    const v = await checkOne(warnTriggerOnHotTable, 'CREATE TRIGGER trg AFTER UPDATE ON users FOR EACH ROW EXECUTE FUNCTION audit();');
    expect(v!.message).toContain('UPDATE');
  });

  it('decodes a multi-event trigger', async () => {
    const v = await checkOne(warnTriggerOnHotTable, 'CREATE TRIGGER trg AFTER INSERT OR DELETE ON users FOR EACH ROW EXECUTE FUNCTION audit();');
    expect(v!.message).toContain('INSERT');
    expect(v!.message).toContain('DELETE');
  });

  it('ignores non-trigger statements', async () => {
    const v = await checkOne(warnTriggerOnHotTable, 'CREATE TABLE users (id INT);');
    expect(v).toBeNull();
  });
});

// ──────────────────────────────────────────────
// MP091: warn-privilege-drift
// ──────────────────────────────────────────────

describe('MP091: warn-privilege-drift', () => {
  it('flags a GRANT alongside DDL', async () => {
    const sql = `CREATE TABLE reports (id INT);
GRANT SELECT ON reports TO analyst;`;
    const v = await checkOne(warnPrivilegeDrift, sql);
    expect(v).not.toBeNull();
    expect(v!.ruleId).toBe('MP091');
    expect(v!.message).toContain('GRANT');
  });

  it('flags a REVOKE alongside DDL', async () => {
    const sql = `CREATE TABLE reports (id INT);
REVOKE SELECT ON reports FROM analyst;`;
    const v = await checkOne(warnPrivilegeDrift, sql);
    expect(v).not.toBeNull();
    expect(v!.message).toContain('REVOKE');
  });

  it('ignores a privileges-only migration', async () => {
    const sql = `GRANT SELECT ON reports TO analyst;
REVOKE INSERT ON reports FROM analyst;`;
    const v = await checkOne(warnPrivilegeDrift, sql);
    expect(v).toBeNull();
  });

  it('ignores a DDL-only migration', async () => {
    const v = await checkOne(warnPrivilegeDrift, 'CREATE TABLE reports (id INT);');
    expect(v).toBeNull();
  });

  it('reports once per file, not once per grant', async () => {
    const sql = `CREATE TABLE reports (id INT);
GRANT SELECT ON reports TO analyst;
GRANT INSERT ON reports TO writer;
REVOKE DELETE ON reports FROM analyst;`;
    const all = await checkAll(warnPrivilegeDrift, sql);
    expect(all).toHaveLength(1);
  });
});

// ──────────────────────────────────────────────
// MP092: require-partitioned-index-strategy
// ──────────────────────────────────────────────

describe('MP092: require-partitioned-index-strategy', () => {
  it('flags CREATE INDEX CONCURRENTLY on a partitioned parent as a hard failure', async () => {
    const sql = `CREATE TABLE events (id INT, ts TIMESTAMPTZ) PARTITION BY RANGE (ts);
CREATE INDEX CONCURRENTLY idx_events_id ON events (id);`;
    const v = await checkOne(requirePartitionedIndexStrategy, sql);
    expect(v).not.toBeNull();
    expect(v!.ruleId).toBe('MP092');
    expect(v!.message).toContain('rejected by PostgreSQL');
  });

  it('flags a recursive CREATE INDEX on a partitioned parent', async () => {
    const sql = `CREATE TABLE events (id INT, ts TIMESTAMPTZ) PARTITION BY RANGE (ts);
CREATE INDEX idx_events_id ON events (id);`;
    const v = await checkOne(requirePartitionedIndexStrategy, sql);
    expect(v).not.toBeNull();
    expect(v!.message).toContain('every partition');
  });

  it('accepts CREATE INDEX ON ONLY, which is the recommended step', async () => {
    const sql = `CREATE TABLE events (id INT, ts TIMESTAMPTZ) PARTITION BY RANGE (ts);
CREATE INDEX idx_events_id ON ONLY events (id);`;
    const v = await checkOne(requirePartitionedIndexStrategy, sql);
    expect(v).toBeNull();
  });

  it('ignores an index on an ordinary table', async () => {
    const sql = `CREATE TABLE events (id INT, ts TIMESTAMPTZ);
CREATE INDEX idx_events_id ON events (id);`;
    const v = await checkOne(requirePartitionedIndexStrategy, sql);
    expect(v).toBeNull();
  });

  it('recognises a parent via a CREATE TABLE ... PARTITION OF it', async () => {
    const sql = `CREATE TABLE events_p1 PARTITION OF events FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
CREATE INDEX idx_events_id ON events (id);`;
    const v = await checkOne(requirePartitionedIndexStrategy, sql);
    expect(v).not.toBeNull();
  });

  it('recognises a parent via ATTACH PARTITION', async () => {
    const sql = `ALTER TABLE events ATTACH PARTITION events_p1 FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
CREATE INDEX idx_events_id ON events (id);`;
    const v = await checkOne(requirePartitionedIndexStrategy, sql);
    expect(v).not.toBeNull();
  });

  it('spells out the ON ONLY then attach recipe', async () => {
    const sql = `CREATE TABLE events (id INT, ts TIMESTAMPTZ) PARTITION BY RANGE (ts);
CREATE INDEX idx_events_id ON events (id);`;
    const v = await checkOne(requirePartitionedIndexStrategy, sql);
    expect(v!.safeAlternative).toContain('ON ONLY');
    expect(v!.safeAlternative).toContain('ATTACH PARTITION');
  });
});

// ──────────────────────────────────────────────
// MP093: warn-default-partition-growth
// ──────────────────────────────────────────────

describe('MP093: warn-default-partition-growth', () => {
  it('flags a DEFAULT partition', async () => {
    const v = await checkOne(warnDefaultPartitionGrowth, 'CREATE TABLE events_def PARTITION OF events DEFAULT;');
    expect(v).not.toBeNull();
    expect(v!.ruleId).toBe('MP093');
    expect(v!.message).toContain('events_def');
    expect(v!.message).toContain('events');
  });

  it('ignores a bounded range partition', async () => {
    const v = await checkOne(warnDefaultPartitionGrowth, "CREATE TABLE events_p1 PARTITION OF events FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');");
    expect(v).toBeNull();
  });

  it('ignores an ordinary CREATE TABLE', async () => {
    const v = await checkOne(warnDefaultPartitionGrowth, 'CREATE TABLE events (id INT);');
    expect(v).toBeNull();
  });

  it('ignores a partitioned parent declaration', async () => {
    const v = await checkOne(warnDefaultPartitionGrowth, 'CREATE TABLE events (id INT, ts TIMESTAMPTZ) PARTITION BY RANGE (ts);');
    expect(v).toBeNull();
  });
});

// ──────────────────────────────────────────────
// MP094: require-attach-partition-check
// ──────────────────────────────────────────────

describe('MP094: require-attach-partition-check', () => {
  it('flags ATTACH PARTITION with no matching CHECK', async () => {
    const v = await checkOne(requireAttachPartitionCheck, "ALTER TABLE events ATTACH PARTITION events_p1 FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');");
    expect(v).not.toBeNull();
    expect(v!.ruleId).toBe('MP094');
    expect(v!.message).toContain('events_p1');
  });

  it('stays quiet when a CHECK was added to the incoming table first', async () => {
    const sql = `ALTER TABLE events_p1 ADD CONSTRAINT events_p1_bound CHECK (ts >= '2024-01-01' AND ts < '2024-02-01') NOT VALID;
ALTER TABLE events ATTACH PARTITION events_p1 FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');`;
    const v = await checkOne(requireAttachPartitionCheck, sql);
    expect(v).toBeNull();
  });

  it('stays quiet when the incoming table was created with a CHECK', async () => {
    const sql = `CREATE TABLE events_p1 (id INT, ts TIMESTAMPTZ, CHECK (ts >= '2024-01-01'));
ALTER TABLE events ATTACH PARTITION events_p1 FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');`;
    const v = await checkOne(requireAttachPartitionCheck, sql);
    expect(v).toBeNull();
  });

  it('still flags when the CHECK is on a different table', async () => {
    const sql = `ALTER TABLE other ADD CONSTRAINT other_c CHECK (x > 0);
ALTER TABLE events ATTACH PARTITION events_p1 FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');`;
    const v = await checkOne(requireAttachPartitionCheck, sql);
    expect(v).not.toBeNull();
  });

  it('still flags when the CHECK comes after the ATTACH', async () => {
    const sql = `ALTER TABLE events ATTACH PARTITION events_p1 FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
ALTER TABLE events_p1 ADD CONSTRAINT events_p1_bound CHECK (ts >= '2024-01-01');`;
    const v = await checkOne(requireAttachPartitionCheck, sql);
    expect(v).not.toBeNull();
  });

  it('ignores DETACH PARTITION', async () => {
    const v = await checkOne(requireAttachPartitionCheck, 'ALTER TABLE events DETACH PARTITION events_p1;');
    expect(v).toBeNull();
  });
});

// ──────────────────────────────────────────────
// MP095: warn-set-tablespace-rewrite
// ──────────────────────────────────────────────

describe('MP095: warn-set-tablespace-rewrite', () => {
  it('flags ALTER TABLE SET TABLESPACE', async () => {
    const v = await checkOne(warnSetTablespaceRewrite, 'ALTER TABLE users SET TABLESPACE fast_ssd;');
    expect(v).not.toBeNull();
    expect(v!.ruleId).toBe('MP095');
    expect(v!.message).toContain('fast_ssd');
    expect(v!.message).toContain('Table');
  });

  it('flags ALTER INDEX SET TABLESPACE and labels it an index', async () => {
    const v = await checkOne(warnSetTablespaceRewrite, 'ALTER INDEX idx_users_email SET TABLESPACE fast_ssd;');
    expect(v).not.toBeNull();
    expect(v!.message).toContain('Index');
  });

  it('ignores unrelated ALTER TABLE commands', async () => {
    const v = await checkOne(warnSetTablespaceRewrite, 'ALTER TABLE users ADD COLUMN x INT;');
    expect(v).toBeNull();
  });

  it('mentions the disk-space requirement', async () => {
    const v = await checkOne(warnSetTablespaceRewrite, 'ALTER TABLE users SET TABLESPACE fast_ssd;');
    expect(v!.safeAlternative).toContain('free space');
  });
});

// ──────────────────────────────────────────────
// MP096: warn-matview-with-data
// ──────────────────────────────────────────────

describe('MP096: warn-matview-with-data', () => {
  it('flags an implicit WITH DATA matview', async () => {
    const v = await checkOne(warnMatviewWithData, 'CREATE MATERIALIZED VIEW mv AS SELECT * FROM users;');
    expect(v).not.toBeNull();
    expect(v!.ruleId).toBe('MP096');
    expect(v!.message).toContain('mv');
  });

  it('flags an explicit WITH DATA matview', async () => {
    const v = await checkOne(warnMatviewWithData, 'CREATE MATERIALIZED VIEW mv AS SELECT * FROM users WITH DATA;');
    expect(v).not.toBeNull();
  });

  it('accepts WITH NO DATA', async () => {
    const v = await checkOne(warnMatviewWithData, 'CREATE MATERIALIZED VIEW mv AS SELECT * FROM users WITH NO DATA;');
    expect(v).toBeNull();
  });

  it('ignores CREATE TABLE ... AS, which shares the same node type', async () => {
    const v = await checkOne(warnMatviewWithData, 'CREATE TABLE t2 AS SELECT * FROM users;');
    expect(v).toBeNull();
  });

  it('suggests WITH NO DATA plus a concurrent refresh', async () => {
    const v = await checkOne(warnMatviewWithData, 'CREATE MATERIALIZED VIEW mv AS SELECT * FROM users;');
    expect(v!.safeAlternative).toContain('WITH NO DATA');
    expect(v!.safeAlternative).toContain('REFRESH MATERIALIZED VIEW CONCURRENTLY');
  });
});

// ──────────────────────────────────────────────
// MP097: ban-drop-constraint-backing-index
// ──────────────────────────────────────────────

describe('MP097: ban-drop-constraint-backing-index', () => {
  it('flags DROP INDEX on a primary-key backing index', async () => {
    const v = await checkOne(
      banDropConstraintBackingIndex,
      'ALTER TABLE users ADD CONSTRAINT users_pkey PRIMARY KEY (id);\nDROP INDEX users_pkey;',
    );
    expect(v).not.toBeNull();
    expect(v!.ruleId).toBe('MP097');
    expect(v!.severity).toBe('critical');
    expect(v!.message).toContain('PRIMARY KEY');
    expect(v!.message).toContain('cannot drop index');
  });

  it('flags DROP INDEX on an index this migration adopts into a constraint', async () => {
    const v = await checkOne(
      banDropConstraintBackingIndex,
      'ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE USING INDEX users_email_key;\nDROP INDEX users_email_key;',
    );
    expect(v).not.toBeNull();
    expect(v!.message).toContain('UNIQUE');
  });

  it('names the migration as the source of the ownership claim', async () => {
    const v = await checkOne(
      banDropConstraintBackingIndex,
      'ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email);\nDROP INDEX users_email_key;',
    );
    expect(v!.message).toContain('This migration puts it under constraint "users_email_key"');
  });

  it('calls out CASCADE as losing the constraint rather than erroring', async () => {
    const v = await checkOne(
      banDropConstraintBackingIndex,
      'ALTER TABLE users ADD CONSTRAINT users_pkey PRIMARY KEY (id);\nDROP INDEX users_pkey CASCADE;',
    );
    expect(v).not.toBeNull();
    expect(v!.message).toContain('CASCADE');
    expect(v!.message).toContain('foreign key');
  });

  it('ignores DROP INDEX on an ordinary index', async () => {
    const v = await checkOne(banDropConstraintBackingIndex, 'DROP INDEX idx_users_created_at;');
    expect(v).toBeNull();
  });

  // The a08 regression: `projects_slug_key` is a plain unique index the file
  // creates itself. Nothing owns it, the drop succeeds, and claiming otherwise
  // put a merge-blocking critical on a correct migration.
  it('stays quiet on a unique index no constraint owns', async () => {
    const v = await checkOne(
      banDropConstraintBackingIndex,
      'DROP INDEX CONCURRENTLY IF EXISTS projects_slug_key;\nCREATE UNIQUE INDEX CONCURRENTLY projects_slug_key ON projects (slug);',
    );
    expect(v).toBeNull();
  });

  it('does not infer ownership from a _pkey suffix alone', async () => {
    const v = await checkOne(banDropConstraintBackingIndex, 'DROP INDEX users_pkey;');
    expect(v).toBeNull();
  });

  it('takes the production catalog as evidence when it is available', async () => {
    const { statements } = await parseMigration('DROP INDEX users_email_key;');
    const v = banDropConstraintBackingIndex.check(statements[0]!.stmt, {
      originalSql: statements[0]!.originalSql,
      line: 1,
      pgVersion: 17,
      lock: { lockType: 'ACCESS EXCLUSIVE', blocksReads: true, blocksWrites: true },
      allStatements: [{ stmt: statements[0]!.stmt, originalSql: statements[0]!.originalSql }],
      statementIndex: 0,
      cluster: {
        indexes: new Map([['users', [{
          tableName: 'users',
          indexName: 'users_email_key',
          method: 'btree',
          isUnique: true,
          isPrimary: false,
          isConstraintBacked: true,
          isPartial: false,
          keyColumns: ['email'],
          definition: 'CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email)',
        }]]]),
        tableFacts: new Map(),
        extensionTables: new Map(),
        installedExtensions: new Set(),
      },
    });
    expect(v).not.toBeNull();
    expect(v!.message).toContain('The catalog on the target database reports');
  });

  it('stays quiet when the catalog says nothing owns the index', async () => {
    const { statements } = await parseMigration('DROP INDEX users_email_key;');
    const v = banDropConstraintBackingIndex.check(statements[0]!.stmt, {
      originalSql: statements[0]!.originalSql,
      line: 1,
      pgVersion: 17,
      lock: { lockType: 'ACCESS EXCLUSIVE', blocksReads: true, blocksWrites: true },
      allStatements: [{ stmt: statements[0]!.stmt, originalSql: statements[0]!.originalSql }],
      statementIndex: 0,
      cluster: {
        indexes: new Map([['users', [{
          tableName: 'users',
          indexName: 'users_email_key',
          method: 'btree',
          isUnique: true,
          isPrimary: false,
          isConstraintBacked: false,
          isPartial: false,
          keyColumns: ['email'],
          definition: 'CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email)',
        }]]]),
        tableFacts: new Map(),
        extensionTables: new Map(),
        installedExtensions: new Set(),
      },
    });
    expect(v).toBeNull();
  });

  it('flags DROP CONSTRAINT on a unique constraint', async () => {
    const v = await checkOne(banDropConstraintBackingIndex, 'ALTER TABLE users DROP CONSTRAINT users_email_key;');
    expect(v).not.toBeNull();
    expect(v!.message).toContain('UNIQUE');
  });

  it('leaves DROP CONSTRAINT on a primary key to MP055', async () => {
    const v = await checkOne(banDropConstraintBackingIndex, 'ALTER TABLE users DROP CONSTRAINT users_pkey;');
    expect(v).toBeNull();
  });

  it('ignores DROP TABLE', async () => {
    const v = await checkOne(banDropConstraintBackingIndex, 'DROP TABLE users;');
    expect(v).toBeNull();
  });
});

// ──────────────────────────────────────────────
// MP098: warn-set-schema
// ──────────────────────────────────────────────

describe('MP098: warn-set-schema', () => {
  it('flags ALTER TABLE SET SCHEMA', async () => {
    const v = await checkOne(warnSetSchema, 'ALTER TABLE users SET SCHEMA archive;');
    expect(v).not.toBeNull();
    expect(v!.ruleId).toBe('MP098');
    expect(v!.message).toContain('users');
    expect(v!.message).toContain('archive');
    expect(v!.message).toContain('Table');
  });

  it('names the old schema when it is qualified', async () => {
    const v = await checkOne(warnSetSchema, 'ALTER TABLE public.users SET SCHEMA archive;');
    expect(v!.message).toContain('public');
  });

  it('labels a sequence correctly', async () => {
    const v = await checkOne(warnSetSchema, 'ALTER SEQUENCE users_id_seq SET SCHEMA archive;');
    expect(v).not.toBeNull();
    expect(v!.message).toContain('Sequence');
  });

  it('labels a view correctly', async () => {
    const v = await checkOne(warnSetSchema, 'ALTER VIEW active_users SET SCHEMA archive;');
    expect(v).not.toBeNull();
    expect(v!.message).toContain('View');
  });

  it('ignores unrelated ALTER TABLE commands', async () => {
    const v = await checkOne(warnSetSchema, 'ALTER TABLE users ADD COLUMN x INT;');
    expect(v).toBeNull();
  });

  it('suggests a compatibility view for the old path', async () => {
    const v = await checkOne(warnSetSchema, 'ALTER TABLE users SET SCHEMA archive;');
    expect(v!.safeAlternative).toContain('CREATE VIEW');
  });
});

// ──────────────────────────────────────────────
// MP099: warn-security-definer-search-path
// ──────────────────────────────────────────────

describe('MP099: warn-security-definer-search-path', () => {
  it('flags SECURITY DEFINER with no SET search_path', async () => {
    const v = await checkOne(warnSecurityDefinerSearchPath, 'CREATE FUNCTION f() RETURNS int AS $$ SELECT 1 $$ LANGUAGE sql SECURITY DEFINER;');
    expect(v).not.toBeNull();
    expect(v!.ruleId).toBe('MP099');
    expect(v!.severity).toBe('critical');
    expect(v!.message).toContain('search_path');
    expect(v!.message).toContain('f');
  });

  it('accepts SECURITY DEFINER with a pinned search_path', async () => {
    const v = await checkOne(warnSecurityDefinerSearchPath, 'CREATE FUNCTION f() RETURNS int AS $$ SELECT 1 $$ LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog;');
    expect(v).toBeNull();
  });

  it('ignores a function with no SECURITY DEFINER', async () => {
    const v = await checkOne(warnSecurityDefinerSearchPath, 'CREATE FUNCTION f() RETURNS int AS $$ SELECT 1 $$ LANGUAGE sql;');
    expect(v).toBeNull();
  });

  it('ignores an explicit SECURITY INVOKER', async () => {
    const v = await checkOne(warnSecurityDefinerSearchPath, 'CREATE FUNCTION f() RETURNS int AS $$ SELECT 1 $$ LANGUAGE sql SECURITY INVOKER;');
    expect(v).toBeNull();
  });

  it('does not treat an unrelated SET clause as a search_path pin', async () => {
    const v = await checkOne(warnSecurityDefinerSearchPath, "CREATE FUNCTION f() RETURNS int AS $$ SELECT 1 $$ LANGUAGE sql SECURITY DEFINER SET work_mem = '64MB';");
    expect(v).not.toBeNull();
  });

  it('ignores non-function statements', async () => {
    const v = await checkOne(warnSecurityDefinerSearchPath, 'CREATE TABLE t (id INT);');
    expect(v).toBeNull();
  });

  it('recommends revoking EXECUTE from PUBLIC as well', async () => {
    const v = await checkOne(warnSecurityDefinerSearchPath, 'CREATE FUNCTION f() RETURNS int AS $$ SELECT 1 $$ LANGUAGE sql SECURITY DEFINER;');
    expect(v!.safeAlternative).toContain('REVOKE EXECUTE');
  });
});
