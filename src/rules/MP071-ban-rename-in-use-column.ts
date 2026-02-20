import type { Rule, RuleContext, RuleViolation } from './engine.js';

/**
 * MP071: ban-rename-in-use-column
 *
 * Renaming a column does NOT automatically update views, functions,
 * triggers, or policies that reference the old column name. These
 * dependent objects will fail at query time — not at migration time.
 *
 * This rule specifically warns when a column rename is not accompanied
 * by updates to dependent objects in the same migration. Complements
 * MP010 (general rename warning) and MP052 (dependent objects warning).
 */

export const banRenameInUseColumn: Rule = {
  id: 'MP071',
  name: 'ban-rename-in-use-column',
  severity: 'warning',
  description: 'Renaming a column breaks views, functions, and triggers that reference the old name. Use add-copy-drop pattern instead.',
  whyItMatters:
    'PostgreSQL does not automatically update views, functions, triggers, or policies when a column ' +
    'is renamed. All dependent objects continue referencing the old name and fail at query time. ' +
    'The safe alternative is the add-copy-drop pattern: add a new column, backfill data, update ' +
    'all dependents, then drop the old column in a separate migration.',
  docsUrl: 'https://migrationpilot.dev/rules/mp071',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (!('RenameStmt' in stmt)) return null;

    const rename = stmt.RenameStmt as {
      renameType?: string | number;
      relation?: { relname?: string };
      subname?: string;
      newname?: string;
    };

    // libpg-query returns renameType as string 'OBJECT_COLUMN'
    if (rename.renameType !== 'OBJECT_COLUMN' && rename.renameType !== 7) return null;

    const table = rename.relation?.relname ?? 'unknown';
    const oldName = rename.subname ?? 'unknown';
    const newName = rename.newname ?? 'unknown';

    // Check if migration also updates dependent objects (views, functions)
    const updatesViews = ctx.allStatements.some(s => {
      const sql = s.originalSql.toLowerCase();
      return (sql.includes('create or replace view') || sql.includes('create or replace function'))
        && sql.includes(newName.toLowerCase());
    });

    if (updatesViews) return null;

    return {
      ruleId: 'MP071',
      ruleName: 'ban-rename-in-use-column',
      severity: 'warning',
      message: `Renaming "${oldName}" to "${newName}" on "${table}" will break any views, functions, or triggers referencing the old name. Use the add-copy-drop pattern instead.`,
      line: ctx.line,
      safeAlternative: `-- Safe add-copy-drop pattern:
-- Step 1: Add new column
ALTER TABLE ${table} ADD COLUMN ${newName} <type>;

-- Step 2: Backfill data (batched for large tables)
UPDATE ${table} SET ${newName} = ${oldName} WHERE ${newName} IS NULL;

-- Step 3: Update all views, functions, triggers to use "${newName}"

-- Step 4: Drop old column in a separate migration
ALTER TABLE ${table} DROP COLUMN ${oldName};`,
    };
  },
};
