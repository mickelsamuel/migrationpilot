import type { Rule, RuleContext, RuleViolation } from './engine.js';

const AT_AlterColumnType = 'AT_AlterColumnType';


export const noDataLossTypeNarrowing: Rule = {
  id: 'MP044',
  name: 'no-data-loss-type-narrowing',
  severity: 'warning',
  description: 'Changing a column to a narrower type can cause data loss or errors if existing values exceed the new type range.',
  whyItMatters: 'Narrowing a column type (e.g., BIGINT → INT, TEXT → VARCHAR(50)) will fail if any existing row has a value that does not fit the new type. Even if it succeeds today, future inserts may fail unexpectedly. The change also requires a full table rewrite under ACCESS EXCLUSIVE lock.',
  docsUrl: 'https://migrationpilot.dev/rules/mp044',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (!('AlterTableStmt' in stmt)) return null;

    const alter = stmt.AlterTableStmt as {
      relation?: { relname?: string };
      cmds?: Array<{ AlterTableCmd: { subtype: string; name?: string; def?: Record<string, unknown> } }>;
    };

    if (!alter.cmds) return null;

    for (const cmd of alter.cmds) {
      if (cmd.AlterTableCmd.subtype !== AT_AlterColumnType) continue;

      const colDef = cmd.AlterTableCmd.def?.ColumnDef as {
        typeName?: { names?: Array<{ String?: { sval: string } }> };
      } | undefined;
      if (!colDef?.typeName?.names) continue;

      const newTypeNames = colDef.typeName.names
        .map(n => n.String?.sval)
        .filter((n): n is string => !!n);

      // Check if this is a known narrowing operation
      // We can only detect the target type from AST — the source type requires production context
      // Flag known small types when used in ALTER COLUMN TYPE as potentially narrowing
      const isNarrowType = newTypeNames.some(n =>
        ['int2', 'smallint', 'int4', 'integer', 'float4', 'real'].includes(n)
      );

      if (!isNarrowType) continue;

      const tableName = alter.relation?.relname ?? 'unknown';
      const colName = cmd.AlterTableCmd.name ?? 'unknown';
      const newType = newTypeNames.filter(n => n !== 'pg_catalog').join(' ');

      return {
        ruleId: 'MP044',
        ruleName: 'no-data-loss-type-narrowing',
        severity: 'warning',
        message: `Changing "${colName}" on "${tableName}" to ${newType.toUpperCase()} may cause data loss if existing values exceed the new type range. This also requires a full table rewrite.`,
        line: ctx.line,
        safeAlternative: `-- Verify no data exceeds the new type range before changing:
-- SELECT COUNT(*) FROM ${tableName} WHERE "${colName}" > <max_value_of_new_type>;
-- Consider adding a CHECK constraint instead of narrowing the type.`,
      };
    }

    return null;
  },
};
