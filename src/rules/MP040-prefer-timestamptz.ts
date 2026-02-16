import type { Rule, RuleContext, RuleViolation } from './engine.js';

export const preferTimestamptz: Rule = {
  id: 'MP040',
  name: 'prefer-timestamptz',
  severity: 'warning',
  description: 'TIMESTAMP WITHOUT TIME ZONE loses timezone information, causing bugs when servers or users span time zones. Use TIMESTAMPTZ instead.',
  whyItMatters: 'TIMESTAMP WITHOUT TIME ZONE stores the literal wall-clock time with no timezone context. When servers move between zones, or users are in different timezones, this causes silent data corruption. TIMESTAMPTZ stores instants in UTC and converts on display, which is almost always what you want.',
  docsUrl: 'https://migrationpilot.dev/rules/mp040',

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
        const result = checkTimestamp(elt.ColumnDef, create.relation?.relname ?? 'unknown', ctx);
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
        const result = checkTimestamp(colDef, alter.relation?.relname ?? 'unknown', ctx);
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

function checkTimestamp(colDef: ColumnDefNode, tableName: string, ctx: RuleContext): RuleViolation | null {
  const typeNames = colDef.typeName?.names
    ?.map(n => n.String?.sval)
    .filter((n): n is string => !!n) ?? [];

  // Flag 'timestamp' without 'tz' — but not 'timestamptz'
  const isTimestampWithoutTz = typeNames.some(n => n === 'timestamp') && !typeNames.some(n => n === 'timestamptz');
  if (!isTimestampWithoutTz) return null;

  const colName = colDef.colname ?? 'unknown';

  return {
    ruleId: 'MP040',
    ruleName: 'prefer-timestamptz',
    severity: 'warning',
    message: `Column "${colName}" on "${tableName}" uses TIMESTAMP WITHOUT TIME ZONE. Use TIMESTAMPTZ to avoid timezone-related bugs.`,
    line: ctx.line,
    safeAlternative: `-- Use TIMESTAMPTZ instead:
-- "${colName}" TIMESTAMPTZ`,
  };
}
