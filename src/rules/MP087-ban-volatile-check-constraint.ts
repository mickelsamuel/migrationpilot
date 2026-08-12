import type { Rule, RuleContext, RuleViolation } from './engine.js';

/**
 * MP087: ban-volatile-check-constraint
 *
 * PostgreSQL accepts a CHECK constraint that calls a volatile function — it
 * does not require IMMUTABLE — and that acceptance is the problem. The
 * predicate is only evaluated when a row is written, so its truth decays:
 *
 *   CREATE TABLE w (id int, ts timestamptz CHECK (ts > now()));
 *   INSERT INTO w VALUES (1, now() + interval '2 seconds');   -- accepted
 *   -- ...time passes, the stored row no longer satisfies the predicate...
 *   UPDATE w SET id = id;
 *   ERROR: new row for relation "w" violates check constraint "w_ts_check"
 *
 * The row stays readable, so nothing looks wrong until an ordinary UPDATE on
 * an unrelated column starts failing, and re-adding the constraint (which is
 * what restoring a dump does) fails with "is violated by some row".
 */

const VOLATILE_FUNCTIONS = new Set([
  'now', 'random', 'nextval', 'clock_timestamp',
  'statement_timestamp', 'timeofday', 'txid_current',
  'gen_random_uuid', 'uuid_generate_v4', 'uuid_generate_v1',
  'current_timestamp', 'current_date', 'current_time', 'localtime', 'localtimestamp',
  'currval', 'lastval',
]);

interface ConstraintShape {
  contype?: string;
  conname?: string;
  raw_expr?: unknown;
}

export const banVolatileCheckConstraint: Rule = {
  id: 'MP087',
  name: 'ban-volatile-check-constraint',
  severity: 'critical',
  description: 'CHECK constraint calling a volatile function (now(), random()) is only true at write time and rots afterwards.',
  whyItMatters:
    'PostgreSQL evaluates a CHECK constraint when a row is written and never again, so a predicate ' +
    'built on now() or random() stops describing the rows it admitted. Three things follow, none of ' +
    'them visible at migration time. The table quietly holds rows that violate its own constraint. ' +
    'Those rows become un-updatable: any UPDATE re-checks the constraint, so even writing to an ' +
    'unrelated column fails with "new row violates check constraint". And restoring a dump re-adds ' +
    'the constraint against the stored data, which fails with "is violated by some row", so the ' +
    'backup will not load. The constraint is not an invariant; it is a filter that was applied once.',
  docsUrl: 'https://migrationpilot.dev/rules/mp087',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    for (const { constraint, tableName } of collectCheckConstraints(stmt)) {
      const volatileFn = findVolatileCall(constraint.raw_expr);
      if (!volatileFn) continue;

      const constraintName = constraint.conname ?? 'unnamed CHECK';

      return {
        ruleId: 'MP087',
        ruleName: 'ban-volatile-check-constraint',
        severity: 'critical',
        message: `CHECK constraint "${constraintName}" on "${tableName}" calls the volatile function ${volatileFn}(). PostgreSQL evaluates it only at write time, so stored rows can stop satisfying it. They then become un-updatable, and restoring a dump fails with "is violated by some row".`,
        line: ctx.line,
        safeAlternative: `-- Compare against a stored value rather than the current time:
ALTER TABLE ${tableName} ADD CONSTRAINT ${constraintName}
  CHECK (expires_at > created_at) NOT VALID;
ALTER TABLE ${tableName} VALIDATE CONSTRAINT ${constraintName};

-- If the rule really is "relative to now", enforce it where it can be
-- re-evaluated: a partial index, a trigger, or the application, not in a
-- CHECK constraint that is frozen at insert time.`,
      };
    }

    return null;
  },
};

/** Collect CHECK constraints from ALTER TABLE ADD CONSTRAINT and CREATE TABLE. */
function collectCheckConstraints(
  stmt: Record<string, unknown>,
): Array<{ constraint: ConstraintShape; tableName: string }> {
  const found: Array<{ constraint: ConstraintShape; tableName: string }> = [];

  if ('AlterTableStmt' in stmt) {
    const alter = stmt.AlterTableStmt as {
      relation?: { relname?: string };
      cmds?: Array<{ AlterTableCmd?: { subtype?: string; def?: { Constraint?: ConstraintShape } } }>;
    };
    const tableName = alter.relation?.relname ?? 'unknown';
    for (const cmdWrapper of alter.cmds ?? []) {
      const cmd = cmdWrapper.AlterTableCmd;
      if (!cmd || cmd.subtype !== 'AT_AddConstraint') continue;
      const constraint = cmd.def?.Constraint;
      if (constraint?.contype === 'CONSTR_CHECK') found.push({ constraint, tableName });
    }
    return found;
  }

  if ('CreateStmt' in stmt) {
    const create = stmt.CreateStmt as {
      relation?: { relname?: string };
      tableElts?: Array<{
        Constraint?: ConstraintShape;
        ColumnDef?: { constraints?: Array<{ Constraint?: ConstraintShape }> };
      }>;
    };
    const tableName = create.relation?.relname ?? 'unknown';
    for (const elt of create.tableElts ?? []) {
      if (elt.Constraint?.contype === 'CONSTR_CHECK') {
        found.push({ constraint: elt.Constraint, tableName });
      }
      for (const colConstraint of elt.ColumnDef?.constraints ?? []) {
        if (colConstraint.Constraint?.contype === 'CONSTR_CHECK') {
          found.push({ constraint: colConstraint.Constraint, tableName });
        }
      }
    }
  }

  return found;
}

/**
 * Walk an expression tree for a FuncCall naming a volatile function.
 * A structural walk rather than a substring scan, so a column named
 * "random_seed" or "now_utc" does not trip the rule.
 */
function findVolatileCall(node: unknown): string | null {
  if (node === null || typeof node !== 'object') return null;

  if (Array.isArray(node)) {
    for (const item of node) {
      const hit = findVolatileCall(item);
      if (hit) return hit;
    }
    return null;
  }

  const record = node as Record<string, unknown>;

  const funcCall = record.FuncCall as
    | { funcname?: Array<{ String?: { sval?: string } }> }
    | undefined;
  if (funcCall) {
    // Use the last name part so pg_catalog.now() resolves to "now".
    const parts = (funcCall.funcname ?? [])
      .map(n => n.String?.sval?.toLowerCase())
      .filter((n): n is string => typeof n === 'string');
    const fnName = parts[parts.length - 1];
    if (fnName && VOLATILE_FUNCTIONS.has(fnName)) return fnName;
  }

  // SQLValueFunction covers bare CURRENT_TIMESTAMP / CURRENT_DATE / LOCALTIME.
  const sqlValueFn = record.SQLValueFunction as { op?: string } | undefined;
  if (sqlValueFn?.op) {
    const op = sqlValueFn.op.toLowerCase();
    if (op.includes('current_timestamp') || op.includes('current_date') ||
        op.includes('current_time') || op.includes('localtime')) {
      return op.replace(/^svfop_/, '').replace(/_n$/, '');
    }
  }

  for (const value of Object.values(record)) {
    const hit = findVolatileCall(value);
    if (hit) return hit;
  }

  return null;
}
