import type { Rule, RuleContext, RuleViolation } from './engine.js';

const AT_AlterColumnType = 'AT_AlterColumnType';

export const noColumnTypeChange: Rule = {
  id: 'MP007',
  name: 'no-column-type-change',
  severity: 'critical',
  description: 'ALTER COLUMN TYPE rewrites the entire table under ACCESS EXCLUSIVE lock. Use the expand-contract pattern instead.',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (!('AlterTableStmt' in stmt)) return null;

    const alter = stmt.AlterTableStmt as {
      relation?: { relname?: string };
      cmds?: Array<{ AlterTableCmd: { subtype: string; name?: string } }>;
    };

    if (!alter.cmds) return null;

    for (const cmd of alter.cmds) {
      if (cmd.AlterTableCmd.subtype !== AT_AlterColumnType) continue;

      const tableName = alter.relation?.relname ?? 'unknown';
      const columnName = cmd.AlterTableCmd.name ?? 'unknown';

      return {
        ruleId: 'MP007',
        ruleName: 'no-column-type-change',
        severity: 'critical',
        message: `ALTER COLUMN TYPE on "${tableName}"."${columnName}" rewrites the entire table under ACCESS EXCLUSIVE lock, blocking all reads and writes.`,
        line: ctx.line,
        safeAlternative: `-- Use the expand-contract pattern:
-- Step 1: Add new column with desired type
ALTER TABLE ${tableName} ADD COLUMN ${columnName}_new <new_type>;

-- Step 2: Backfill in batches
UPDATE ${tableName} SET ${columnName}_new = ${columnName}::<new_type>
  WHERE id IN (SELECT id FROM ${tableName} WHERE ${columnName}_new IS NULL LIMIT 10000);

-- Step 3: Create trigger to sync writes (during backfill)
-- Step 4: Swap columns (brief lock)
-- Step 5: Drop old column`,
      };
    }

    return null;
  },
};
