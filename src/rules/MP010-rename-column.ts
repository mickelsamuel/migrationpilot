import type { Rule, RuleContext, RuleViolation } from './engine.js';

export const noRenameColumn: Rule = {
  id: 'MP010',
  name: 'no-rename-column',
  severity: 'warning',
  description: 'RENAME COLUMN breaks application queries referencing the old column name. Prefer adding a new column and migrating data.',
  whyItMatters: 'Renaming a column takes an ACCESS EXCLUSIVE lock and instantly breaks every application query, view, and function referencing the old name. Use the expand-contract pattern: add a new column, migrate data, update code, then drop the old column.',
  docsUrl: 'https://migrationpilot.dev/rules/mp010',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (!('RenameStmt' in stmt)) return null;

    const rename = stmt.RenameStmt as {
      renameType?: string;
      relation?: { relname?: string };
      subname?: string;
      newname?: string;
    };

    // RENAME_TYPE_COLUMN = "OBJECT_COLUMN" in libpg-query
    if (rename.renameType !== 'OBJECT_COLUMN') return null;

    const tableName = rename.relation?.relname ?? 'unknown';
    const oldName = rename.subname ?? 'unknown';
    const newName = rename.newname ?? 'unknown';

    return {
      ruleId: 'MP010',
      ruleName: 'no-rename-column',
      severity: 'warning',
      message: `Renaming column "${oldName}" to "${newName}" on "${tableName}" will break any application queries or views referencing the old column name.`,
      line: ctx.line,
      safeAlternative: `-- Step 1: Add new column
ALTER TABLE ${tableName} ADD COLUMN ${newName} <same_type>;

-- Step 2: Backfill data (in batches for large tables)
UPDATE ${tableName} SET ${newName} = ${oldName} WHERE ${newName} IS NULL;

-- Step 3: Update application code to use "${newName}"
-- Step 4: Stop writing to "${oldName}"
-- Step 5: Drop old column (after verifying no reads)
ALTER TABLE ${tableName} DROP COLUMN ${oldName};`,
    };
  },
};
