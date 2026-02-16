import type { Rule, RuleContext, RuleViolation } from './engine.js';

export const banCharField: Rule = {
  id: 'MP041',
  name: 'ban-char-field',
  severity: 'warning',
  description: 'CHAR(n) pads values with spaces, wasting storage and causing subtle bugs in comparisons. Use TEXT or VARCHAR instead.',
  whyItMatters: 'CHAR(n) blank-pads values to the specified length, wasting storage and causing confusing behavior in string comparisons and LIKE queries. It offers no performance advantage over TEXT in PostgreSQL. Use TEXT (or VARCHAR if you must have a length limit).',
  docsUrl: 'https://migrationpilot.dev/rules/mp041',

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
        const result = checkCharType(elt.ColumnDef, create.relation?.relname ?? 'unknown', ctx);
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
        const result = checkCharType(colDef, alter.relation?.relname ?? 'unknown', ctx);
        if (result) return result;
      }
    }

    return null;
  },
};

interface ColumnDefNode {
  colname?: string;
  typeName?: { names?: Array<{ String?: { sval: string } }> };
}

function checkCharType(colDef: ColumnDefNode, tableName: string, ctx: RuleContext): RuleViolation | null {
  const typeNames = colDef.typeName?.names
    ?.map(n => n.String?.sval)
    .filter((n): n is string => !!n) ?? [];

  // 'bpchar' is PG internal name for CHAR(n), 'character' without 'varying' is also CHAR
  const isChar = typeNames.some(n => n === 'bpchar' || n === 'char') &&
    !typeNames.some(n => n === 'varying');
  if (!isChar) return null;

  const colName = colDef.colname ?? 'unknown';

  return {
    ruleId: 'MP041',
    ruleName: 'ban-char-field',
    severity: 'warning',
    message: `Column "${colName}" on "${tableName}" uses CHAR(n), which blank-pads values and wastes storage. Use TEXT instead.`,
    line: ctx.line,
    safeAlternative: `-- Use TEXT instead of CHAR(n):
-- "${colName}" TEXT`,
  };
}
