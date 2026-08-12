import type { Rule, RuleContext, RuleViolation } from './engine.js';
import { findFunction } from './helpers.js';

const AT_AddColumn = 'AT_AddColumn';

/**
 * Functions PostgreSQL marks VOLATILE. A default built from one of these cannot
 * be stored in `pg_attribute.attmissingval`, so `ADD COLUMN` falls back to
 * rewriting the whole table — the ALTER TABLE manual: adding a column with a
 * volatile `DEFAULT` "will cause the entire table and its indexes to be
 * rewritten".
 *
 * Verified on PostgreSQL 18.3 by watching `pg_class.relfilenode` across the
 * ALTER: `gen_random_uuid()`, `random()`, `clock_timestamp()`, `timeofday()`
 * and `nextval()` all changed it. `uuid_generate_v1`/`v4` come from uuid-ossp,
 * which declares them VOLATILE; the extension is not installable in the test
 * harness, so those two rest on that declaration rather than a local run.
 */
const VOLATILE_FUNCTIONS = new Set([
  'random', 'gen_random_uuid', 'uuid_generate_v1', 'uuid_generate_v1mc',
  'uuid_generate_v4', 'clock_timestamp', 'timeofday', 'nextval',
]);

/**
 * STABLE functions that read like volatile ones and are not.
 *
 * `now()`, `CURRENT_TIMESTAMP`, `statement_timestamp()` and `txid_current()`
 * hold one value for the whole transaction, so PostgreSQL evaluates them once
 * and stores the result as the column's missing value. No rewrite happens —
 * also verified on 18.3 — but every pre-existing row ends up sharing that single
 * value, which is rarely what "created_at" was meant to record.
 */
const STABLE_FUNCTIONS = new Set([
  'now', 'statement_timestamp', 'transaction_timestamp', 'txid_current',
  'current_timestamp', 'current_date', 'current_time', 'localtime', 'localtimestamp',
]);

export const volatileDefaultRewrite: Rule = {
  id: 'MP003',
  name: 'volatile-default-table-rewrite',
  severity: 'critical',
  description: 'ADD COLUMN with a volatile DEFAULT (gen_random_uuid(), random(), clock_timestamp()) rewrites the entire table and its indexes under ACCESS EXCLUSIVE.',
  whyItMatters: 'A non-volatile default is evaluated once and stored in pg_attribute.attmissingval, so ADD COLUMN touches no heap pages. A volatile default cannot be stored that way. PostgreSQL has to evaluate it separately for every existing row, which means writing a fresh copy of the table and all of its indexes while holding ACCESS EXCLUSIVE. Reads and writes are blocked for the whole rewrite, and the operation needs enough free disk for a second copy of the table before it can finish.',
  docsUrl: 'https://migrationpilot.dev/rules/mp003',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (!('AlterTableStmt' in stmt)) return null;

    const alter = stmt.AlterTableStmt as {
      relation?: { relname?: string };
      cmds?: Array<{ AlterTableCmd: { subtype: string; def?: Record<string, unknown> } }>;
    };

    if (!alter.cmds) return null;

    for (const cmd of alter.cmds) {
      if (cmd.AlterTableCmd.subtype !== AT_AddColumn) continue;

      const column = cmd.AlterTableCmd.def?.ColumnDef as ColumnDef | undefined;
      if (!column) continue;

      const defaultExpr = findDefaultExpr(column);
      if (!defaultExpr) continue;

      const columnName = column.colname ?? 'the new column';
      const tableName = alter.relation?.relname ?? 'unknown';
      const rendered = renderExpr(defaultExpr) ?? 'the default expression';
      const volatileFn = findFunction(defaultExpr, VOLATILE_FUNCTIONS);
      const stableFn = findFunction(defaultExpr, STABLE_FUNCTIONS);

      // Before PG 11 there was no missing-value machinery: any DEFAULT rewrote.
      if (ctx.pgVersion < 11) {
        if (!volatileFn && !stableFn) continue;
        return {
          ruleId: 'MP003',
          ruleName: 'volatile-default-table-rewrite',
          severity: 'critical',
          message: `ADD COLUMN "${columnName}" DEFAULT ${rendered} on "${tableName}" rewrites the whole table on PostgreSQL ${ctx.pgVersion}, which has no missing-value fast path. ACCESS EXCLUSIVE is held for the entire rewrite.`,
          line: ctx.line,
          safeAlternative: backfillPlan(tableName, columnName, rendered),
        };
      }

      if (volatileFn) {
        return {
          ruleId: 'MP003',
          ruleName: 'volatile-default-table-rewrite',
          severity: 'critical',
          message: `ADD COLUMN "${columnName}" DEFAULT ${rendered} on "${tableName}" uses a volatile default, so PostgreSQL rewrites the entire table and every index on it while holding ACCESS EXCLUSIVE. ${volatileFn} has to be evaluated once per existing row, which rules out the pg_attribute.attmissingval fast path a constant default takes.`,
          line: ctx.line,
          safeAlternative: backfillPlan(tableName, columnName, rendered),
        };
      }

      if (stableFn) {
        return {
          ruleId: 'MP003',
          ruleName: 'volatile-default-table-rewrite',
          severity: 'warning',
          message: `ADD COLUMN "${columnName}" DEFAULT ${rendered} on "${tableName}". ${stableFn} is stable rather than volatile, so there is no rewrite, but it is evaluated once, at migration time, and every pre-existing row is given that same value.`,
          line: ctx.line,
          safeAlternative: `-- No rewrite here. If existing rows need their own value rather than
-- one shared timestamp, add the column without a default and backfill:
ALTER TABLE ${tableName} ADD COLUMN ${columnName} <type>;
-- ... backfill in batches ...
ALTER TABLE ${tableName} ALTER COLUMN ${columnName} SET DEFAULT ${rendered};`,
        };
      }
    }

    return null;
  },
};

interface ColumnDef {
  colname?: string;
  constraints?: Array<{ Constraint?: { contype?: string; raw_expr?: Record<string, unknown> } }>;
}

/** The DEFAULT expression attached to an added column, if it has one. */
function findDefaultExpr(column: ColumnDef): Record<string, unknown> | null {
  for (const wrapper of column.constraints ?? []) {
    const constraint = wrapper.Constraint;
    if (constraint?.contype === 'CONSTR_DEFAULT' && constraint.raw_expr) {
      return constraint.raw_expr;
    }
  }
  return null;
}

/** Print an expression back as SQL, well enough to name it in a message. */
function renderExpr(node: unknown): string | null {
  if (node === null || typeof node !== 'object') return null;
  const record = node as Record<string, unknown>;

  const call = record.FuncCall as {
    funcname?: Array<{ String?: { sval?: string } }>;
    args?: unknown[];
  } | undefined;
  if (call) {
    const name = (call.funcname ?? []).map(n => n.String?.sval).filter(Boolean).join('.');
    const args = (call.args ?? []).map(a => renderExpr(a) ?? '...').join(', ');
    return `${name}(${args})`;
  }

  const sqlValue = record.SQLValueFunction as { op?: string } | undefined;
  if (sqlValue?.op) return sqlValue.op.replace(/^SVFOP_/, '').replace(/_N$/, '').toUpperCase();

  const cast = record.TypeCast as { arg?: unknown } | undefined;
  if (cast?.arg) return renderExpr(cast.arg);

  const expr = record.A_Expr as {
    name?: Array<{ String?: { sval?: string } }>;
    lexpr?: unknown;
    rexpr?: unknown;
  } | undefined;
  if (expr) {
    const op = expr.name?.[0]?.String?.sval ?? '?';
    return `${renderExpr(expr.lexpr) ?? '...'} ${op} ${renderExpr(expr.rexpr) ?? '...'}`;
  }

  const constant = record.A_Const as {
    sval?: { sval?: string };
    ival?: { ival?: number };
    fval?: { fval?: string };
    boolval?: { boolval?: boolean };
    isnull?: boolean;
  } | undefined;
  if (constant) {
    if (constant.isnull) return 'NULL';
    if (constant.sval) return `'${constant.sval.sval ?? ''}'`;
    if (constant.fval) return constant.fval.fval ?? '';
    if (constant.boolval) return constant.boolval.boolval ? 'true' : 'false';
    return String(constant.ival?.ival ?? 0);
  }

  const column = record.ColumnRef as { fields?: Array<{ String?: { sval?: string } }> } | undefined;
  if (column) return (column.fields ?? []).map(f => f.String?.sval).filter(Boolean).join('.');

  return null;
}

function backfillPlan(table: string, column: string, expr: string): string {
  return `-- Add the column with no default, so the catalog write is all it costs:
ALTER TABLE ${table} ADD COLUMN ${column} <type>;

-- Fill it in batches, outside any long transaction. Repeat until 0 rows:
UPDATE ${table} SET ${column} = ${expr}
WHERE ${column} IS NULL
  AND id IN (SELECT id FROM ${table} WHERE ${column} IS NULL LIMIT 10000);

-- Only then attach the default, for rows written from here on:
ALTER TABLE ${table} ALTER COLUMN ${column} SET DEFAULT ${expr};`;
}
