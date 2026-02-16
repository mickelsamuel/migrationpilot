import type { Rule, RuleContext, RuleViolation } from './engine.js';

export const preferBigintOverInt: Rule = {
  id: 'MP038',
  name: 'prefer-bigint-over-int',
  severity: 'warning',
  description: 'Primary key and foreign key columns using INT (4 bytes, max 2.1B) can overflow on high-traffic tables. Use BIGINT (8 bytes) instead.',
  whyItMatters: 'INT primary keys overflow at ~2.1 billion rows. Migrating from INT to BIGINT on a large table requires a full table rewrite under ACCESS EXCLUSIVE lock, which can take hours. Starting with BIGINT avoids this expensive migration and costs only 4 extra bytes per row.',
  docsUrl: 'https://migrationpilot.dev/rules/mp038',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (!('CreateStmt' in stmt)) return null;

    const create = stmt.CreateStmt as {
      relation?: { relname?: string; relpersistence?: string };
      tableElts?: Array<{ ColumnDef?: ColumnDefNode }>;
    };

    // Skip temp tables
    if (create.relation?.relpersistence === 't') return null;

    if (!create.tableElts) return null;

    for (const elt of create.tableElts) {
      if (!elt.ColumnDef) continue;
      const colDef = elt.ColumnDef;

      // Only flag if column has PK or FK constraint
      const hasPkOrFk = colDef.constraints?.some(c => {
        const contype = c.Constraint?.contype;
        return contype === 'CONSTR_PRIMARY' || contype === 'CONSTR_FOREIGN';
      });
      if (!hasPkOrFk) continue;

      const typeNames = colDef.typeName?.names
        ?.map(n => n.String?.sval)
        .filter((n): n is string => !!n) ?? [];

      const isSmallInt = typeNames.some(n => n === 'int4' || n === 'int2' || n === 'integer' || n === 'smallint');
      if (!isSmallInt) continue;

      const colName = colDef.colname ?? 'unknown';
      const tableName = create.relation?.relname ?? 'unknown';

      return {
        ruleId: 'MP038',
        ruleName: 'prefer-bigint-over-int',
        severity: 'warning',
        message: `Primary/foreign key column "${colName}" on "${tableName}" uses INT (max ~2.1B). Use BIGINT to avoid expensive future type migration.`,
        line: ctx.line,
        safeAlternative: `-- Use BIGINT for primary/foreign key columns:
-- "${colName}" BIGINT PRIMARY KEY`,
      };
    }

    return null;
  },
};

interface ColumnDefNode {
  colname?: string;
  typeName?: { names?: Array<{ String?: { sval: string } }> };
  constraints?: Array<{ Constraint?: { contype: string } }>;
}
