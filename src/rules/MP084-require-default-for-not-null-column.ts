import type { Rule, RuleContext, RuleViolation } from './engine.js';

/**
 * MP084: require-default-for-not-null-column
 *
 * ADD COLUMN ... NOT NULL without a DEFAULT fails outright on any table that
 * already has rows:
 *
 *   ERROR: column "email" of relation "users" contains null values
 *
 * The migration passes review, passes on an empty CI database, and then aborts
 * the moment it reaches an environment with real data.
 *
 * Columns that supply their own values are not flagged: DEFAULT, IDENTITY,
 * GENERATED ... STORED, PRIMARY KEY (on a serial-like type), and the SERIAL
 * pseudo-types all populate existing rows or are rejected for other reasons.
 */

const SELF_POPULATING_CONSTRAINTS = new Set([
  'CONSTR_DEFAULT',
  'CONSTR_IDENTITY',
  'CONSTR_GENERATED',
]);

const SERIAL_TYPES = new Set(['serial', 'bigserial', 'smallserial', 'serial4', 'serial8', 'serial2']);

interface ColumnDefShape {
  colname?: string;
  typeName?: { names?: Array<{ String?: { sval?: string } }> };
  constraints?: Array<{ Constraint?: { contype?: string } }>;
}

export const requireDefaultForNotNullColumn: Rule = {
  id: 'MP084',
  name: 'require-default-for-not-null-column',
  severity: 'critical',
  description: 'ADD COLUMN ... NOT NULL without a DEFAULT aborts the migration on any table that already contains rows.',
  whyItMatters:
    'PostgreSQL has to give existing rows a value for the new column. Without a DEFAULT there is ' +
    'nothing to give them, so the statement fails with "column ... contains null values" and the ' +
    'whole migration rolls back. An empty CI database accepts the same statement happily, which is ' +
    'what makes this one dangerous: it passes every check you run before deploy and only fails in ' +
    'the environment that has data.',
  docsUrl: 'https://migrationpilot.dev/rules/mp084',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (!('AlterTableStmt' in stmt)) return null;

    const alter = stmt.AlterTableStmt as {
      relation?: { relname?: string };
      cmds?: Array<{ AlterTableCmd?: { subtype?: string; def?: { ColumnDef?: ColumnDefShape } } }>;
    };

    if (!alter.cmds) return null;
    const tableName = alter.relation?.relname ?? 'unknown';

    for (const cmdWrapper of alter.cmds) {
      const cmd = cmdWrapper.AlterTableCmd;
      if (!cmd || cmd.subtype !== 'AT_AddColumn') continue;

      const col = cmd.def?.ColumnDef;
      if (!col) continue;

      const contypes = (col.constraints ?? [])
        .map(c => c.Constraint?.contype)
        .filter((c): c is string => typeof c === 'string');

      if (!contypes.includes('CONSTR_NOTNULL')) continue;

      // A column that populates itself is safe.
      if (contypes.some(c => SELF_POPULATING_CONSTRAINTS.has(c))) continue;

      // SERIAL/BIGSERIAL expand to a nextval() default.
      const typeNames = (col.typeName?.names ?? [])
        .map(n => n.String?.sval?.toLowerCase())
        .filter((n): n is string => typeof n === 'string');
      if (typeNames.some(t => SERIAL_TYPES.has(t))) continue;

      const colName = col.colname ?? 'unknown';

      return {
        ruleId: 'MP084',
        ruleName: 'require-default-for-not-null-column',
        severity: 'critical',
        message: `ADD COLUMN "${colName}" NOT NULL on "${tableName}" has no DEFAULT. On a table that already has rows this aborts with: column "${colName}" of relation "${tableName}" contains null values. It will pass on an empty CI database and fail in production.`,
        line: ctx.line,
        safeAlternative: `-- Option A: give existing rows a value (PG 11+ does this without a rewrite):
ALTER TABLE ${tableName} ADD COLUMN ${colName} <type> NOT NULL DEFAULT <value>;

-- Option B: if there is no sensible default, add it nullable and tighten later:
ALTER TABLE ${tableName} ADD COLUMN ${colName} <type>;
-- backfill in batches, then:
ALTER TABLE ${tableName} ADD CONSTRAINT ${tableName}_${colName}_not_null
  CHECK (${colName} IS NOT NULL) NOT VALID;
ALTER TABLE ${tableName} VALIDATE CONSTRAINT ${tableName}_${colName}_not_null;`,
      };
    }

    return null;
  },
};
