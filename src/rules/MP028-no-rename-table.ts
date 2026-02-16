import type { Rule, RuleContext, RuleViolation } from './engine.js';

export const noRenameTable: Rule = {
  id: 'MP028',
  name: 'no-rename-table',
  severity: 'warning',
  description: 'Renaming a table breaks all application queries, views, and foreign keys referencing the old name.',
  whyItMatters: 'Renaming a table takes an ACCESS EXCLUSIVE lock and instantly breaks every application query, view, function, foreign key, and trigger referencing the old name. Unlike renaming a column, there is no pg_attribute fallback. Use the create-copy-swap pattern for zero-downtime renames.',
  docsUrl: 'https://migrationpilot.dev/rules/mp028',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (!('RenameStmt' in stmt)) return null;

    const rename = stmt.RenameStmt as {
      renameType?: string;
      relation?: { relname?: string };
      newname?: string;
    };

    if (rename.renameType !== 'OBJECT_TABLE') return null;

    const oldName = rename.relation?.relname ?? 'unknown';
    const newName = rename.newname ?? 'unknown';

    return {
      ruleId: 'MP028',
      ruleName: 'no-rename-table',
      severity: 'warning',
      message: `Renaming table "${oldName}" to "${newName}" will break all application queries, views, and foreign keys referencing the old name.`,
      line: ctx.line,
      safeAlternative: `-- Step 1: Create a view with the old name pointing to the new table
-- (or use the expand-contract pattern):
-- CREATE VIEW ${oldName} AS SELECT * FROM ${newName};

-- Step 2: Update application code to use "${newName}"
-- Step 3: Drop the compatibility view after all code is updated
-- DROP VIEW ${oldName};`,
    };
  },
};
