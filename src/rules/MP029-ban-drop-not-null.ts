import type { Rule, RuleContext, RuleViolation } from './engine.js';

const AT_DropNotNull = 'AT_DropNotNull';

export const banDropNotNull: Rule = {
  id: 'MP029',
  name: 'ban-drop-not-null',
  severity: 'warning',
  description: 'Dropping NOT NULL allows NULL values in a previously non-nullable column. This may break application code that assumes the column is always populated.',
  whyItMatters: 'Dropping a NOT NULL constraint allows NULL values to be inserted into a column that was previously guaranteed non-null. Application code, ORMs, and downstream systems may crash or return incorrect results when encountering unexpected NULLs.',
  docsUrl: 'https://migrationpilot.dev/rules/mp029',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (!('AlterTableStmt' in stmt)) return null;

    const alter = stmt.AlterTableStmt as {
      relation?: { relname?: string };
      cmds?: Array<{ AlterTableCmd: { subtype: string; name?: string } }>;
    };

    if (!alter.cmds) return null;

    for (const cmd of alter.cmds) {
      if (cmd.AlterTableCmd.subtype !== AT_DropNotNull) continue;

      const tableName = alter.relation?.relname ?? 'unknown';
      const columnName = cmd.AlterTableCmd.name ?? 'unknown';

      return {
        ruleId: 'MP029',
        ruleName: 'ban-drop-not-null',
        severity: 'warning',
        message: `Dropping NOT NULL on "${tableName}"."${columnName}" allows NULL values. Application code that assumes this column is always populated may break.`,
        line: ctx.line,
        safeAlternative: `-- Verify that all application code handles NULL values for "${columnName}" before dropping NOT NULL.
-- Consider adding a default value instead:
-- ALTER TABLE ${tableName} ALTER COLUMN ${columnName} SET DEFAULT <value>;`,
      };
    }

    return null;
  },
};
