import type { Rule, RuleContext, RuleViolation } from './engine.js';

export const warnDependentObjects: Rule = {
  id: 'MP052',
  name: 'warn-dependent-objects',
  severity: 'warning',
  description: 'DROP COLUMN, RENAME COLUMN, or ALTER COLUMN TYPE may silently break views, functions, and triggers that reference the column.',
  whyItMatters: 'Views, functions, and triggers that reference a column will fail at query time — not at migration time — when the column is dropped, renamed, or its type is changed. PostgreSQL does not automatically update these dependent objects. This is the most common cause of post-deployment failures that static analysis cannot fully resolve without a database connection.',
  docsUrl: 'https://migrationpilot.dev/rules/mp052',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (!('AlterTableStmt' in stmt)) return null;

    const alter = stmt.AlterTableStmt as {
      relation?: { relname?: string };
      cmds?: Array<{ AlterTableCmd: { subtype: string; name?: string } }>;
    };

    if (!alter.cmds) return null;
    const table = alter.relation?.relname ?? 'unknown';

    for (const cmd of alter.cmds) {
      const subtype = cmd.AlterTableCmd.subtype;
      const colName = cmd.AlterTableCmd.name ?? 'unknown';

      if (subtype === 'AT_DropColumn') {
        return {
          ruleId: 'MP052',
          ruleName: 'warn-dependent-objects',
          severity: 'warning',
          message: `Dropping column "${colName}" from "${table}" may break views, functions, or triggers that reference it. Check dependencies before deploying.`,
          line: ctx.line,
          safeAlternative: `-- Check for dependent objects before dropping:
SELECT dependent_ns.nspname || '.' || dependent_view.relname AS dependent_object,
       dependent_view.relkind
FROM pg_depend
JOIN pg_rewrite ON pg_depend.objid = pg_rewrite.oid
JOIN pg_class AS dependent_view ON pg_rewrite.ev_class = dependent_view.oid
JOIN pg_namespace AS dependent_ns ON dependent_view.relnamespace = dependent_ns.oid
JOIN pg_class AS source_table ON pg_depend.refobjid = source_table.oid
JOIN pg_attribute ON pg_depend.refobjid = pg_attribute.attrelid AND pg_depend.refobjsubid = pg_attribute.attnum
WHERE source_table.relname = '${table}' AND pg_attribute.attname = '${colName}';`,
        };
      }

      if (subtype === 'AT_AlterColumnType') {
        return {
          ruleId: 'MP052',
          ruleName: 'warn-dependent-objects',
          severity: 'warning',
          message: `Changing type of column "${colName}" on "${table}" may break views, functions, or triggers that reference it with the old type.`,
          line: ctx.line,
          safeAlternative: `-- Verify no views/functions depend on the old column type before altering.`,
        };
      }
    }

    // Check for RENAME COLUMN
    if ('RenameStmt' in stmt) {
      const rename = stmt.RenameStmt as {
        renameType?: number;
        relation?: { relname?: string };
        subname?: string;
        newname?: string;
      };

      // renameType 7 = OBJECT_COLUMN
      if (rename.renameType === 7) {
        const tbl = rename.relation?.relname ?? 'unknown';
        const oldName = rename.subname ?? 'unknown';
        const newName = rename.newname ?? 'unknown';
        return {
          ruleId: 'MP052',
          ruleName: 'warn-dependent-objects',
          severity: 'warning',
          message: `Renaming column "${oldName}" to "${newName}" on "${tbl}" may break views, functions, or triggers that reference the old name.`,
          line: ctx.line,
          safeAlternative: `-- Check for dependent objects before renaming. Consider a multi-step migration:
-- 1. Add new column, 2. Backfill, 3. Update dependents, 4. Drop old column.`,
        };
      }
    }

    return null;
  },
};
