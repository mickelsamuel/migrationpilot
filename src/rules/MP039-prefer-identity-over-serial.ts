import type { Rule, RuleContext, RuleViolation } from './engine.js';

export const preferIdentityOverSerial: Rule = {
  id: 'MP039',
  name: 'prefer-identity-over-serial',
  severity: 'warning',
  description: 'SERIAL/BIGSERIAL creates an implicit sequence with ownership quirks. Use GENERATED ALWAYS AS IDENTITY (PG 10+) instead.',
  whyItMatters: 'SERIAL is a legacy shorthand that creates a separate sequence with confusing ownership semantics — dropping the column does not drop the sequence, and permissions are not automatically granted. GENERATED ALWAYS AS IDENTITY (PG 10+) is SQL-standard, has cleaner ownership, and is the recommended approach.',
  docsUrl: 'https://migrationpilot.dev/rules/mp039',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    // Only available on PG 10+
    if (ctx.pgVersion < 10) return null;

    if (!('CreateStmt' in stmt)) return null;

    const create = stmt.CreateStmt as {
      relation?: { relname?: string };
      tableElts?: Array<{ ColumnDef?: ColumnDefNode }>;
    };

    if (!create.tableElts) return null;

    for (const elt of create.tableElts) {
      if (!elt.ColumnDef) continue;
      const colDef = elt.ColumnDef;

      const typeNames = colDef.typeName?.names
        ?.map(n => n.String?.sval)
        .filter((n): n is string => !!n) ?? [];

      const isSerial = typeNames.some(n =>
        n === 'serial' || n === 'bigserial' || n === 'smallserial' ||
        n === 'serial4' || n === 'serial8' || n === 'serial2'
      );
      if (!isSerial) continue;

      const colName = colDef.colname ?? 'unknown';
      const tableName = create.relation?.relname ?? 'unknown';
      const serialType = typeNames.find(n => n.startsWith('serial') || n.startsWith('big') || n.startsWith('small')) ?? 'serial';

      return {
        ruleId: 'MP039',
        ruleName: 'prefer-identity-over-serial',
        severity: 'warning',
        message: `Column "${colName}" on "${tableName}" uses ${serialType.toUpperCase()}. Use GENERATED ALWAYS AS IDENTITY instead (PG 10+, SQL-standard, cleaner ownership).`,
        line: ctx.line,
        safeAlternative: `-- Use IDENTITY instead of SERIAL:
-- "${colName}" BIGINT GENERATED ALWAYS AS IDENTITY`,
      };
    }

    return null;
  },
};

interface ColumnDefNode {
  colname?: string;
  typeName?: { names?: Array<{ String?: { sval: string } }> };
}
