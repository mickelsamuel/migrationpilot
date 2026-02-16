import type { Rule, RuleContext, RuleViolation } from './engine.js';

export const preferTextOverVarchar: Rule = {
  id: 'MP037',
  name: 'prefer-text-over-varchar',
  severity: 'warning',
  description: 'VARCHAR(n) offers no performance benefit over TEXT in PostgreSQL and makes future schema changes harder.',
  whyItMatters: 'In PostgreSQL, VARCHAR(n) and TEXT have identical performance — both use the same varlena storage. VARCHAR(n) only adds a length check constraint that makes future length changes require a table rewrite (on PG < 17) or at minimum a constraint adjustment. Use TEXT with a CHECK constraint if you need length validation.',
  docsUrl: 'https://migrationpilot.dev/rules/mp037',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    // Check CREATE TABLE columns
    if ('CreateStmt' in stmt) {
      const create = stmt.CreateStmt as {
        relation?: { relname?: string };
        tableElts?: Array<{ ColumnDef?: ColumnDefNode }>;
      };

      if (!create.tableElts) return null;

      for (const elt of create.tableElts) {
        if (!elt.ColumnDef) continue;
        const result = checkColumnType(elt.ColumnDef, create.relation?.relname ?? 'unknown', ctx);
        if (result) return result;
      }
    }

    // Check ALTER TABLE ADD COLUMN
    if ('AlterTableStmt' in stmt) {
      const alter = stmt.AlterTableStmt as {
        relation?: { relname?: string };
        cmds?: Array<{ AlterTableCmd: { subtype: string; def?: Record<string, unknown> } }>;
      };

      if (!alter.cmds) return null;

      for (const cmd of alter.cmds) {
        if (cmd.AlterTableCmd.subtype !== 'AT_AddColumn') continue;
        const colDef = cmd.AlterTableCmd.def?.ColumnDef as ColumnDefNode | undefined;
        if (!colDef) continue;
        const result = checkColumnType(colDef, alter.relation?.relname ?? 'unknown', ctx);
        if (result) return result;
      }
    }

    return null;
  },
};

interface ColumnDefNode {
  colname?: string;
  typeName?: { names?: Array<{ String?: { sval: string } }>; typmods?: unknown[] };
}

function checkColumnType(colDef: ColumnDefNode, tableName: string, ctx: RuleContext): RuleViolation | null {
  const typeNames = colDef.typeName?.names
    ?.map(n => n.String?.sval)
    .filter((n): n is string => !!n) ?? [];

  const isVarchar = typeNames.some(n => n === 'varchar' || n === 'character varying');

  if (!isVarchar) return null;

  const colName = colDef.colname ?? 'unknown';

  return {
    ruleId: 'MP037',
    ruleName: 'prefer-text-over-varchar',
    severity: 'warning',
    message: `Column "${colName}" on "${tableName}" uses VARCHAR. In PostgreSQL, TEXT has identical performance. Use TEXT with a CHECK constraint if you need length validation.`,
    line: ctx.line,
    safeAlternative: `-- Use TEXT instead of VARCHAR:
-- "${colName}" TEXT
-- If you need a max length, add a CHECK constraint:
-- "${colName}" TEXT CHECK (length("${colName}") <= <max_length>)`,
  };
}
