import type { Rule, RuleContext, RuleViolation } from './engine.js';

export const banDropTable: Rule = {
  id: 'MP026',
  name: 'ban-drop-table',
  severity: 'critical',
  description: 'DROP TABLE permanently removes the table and all its data. Use with extreme caution in production.',
  whyItMatters: 'DROP TABLE is irreversible — it permanently deletes the table, all rows, indexes, constraints, triggers, and policies. In production, this means instant data loss. Prefer renaming the table first, keeping it as a backup, then dropping later after confirming no dependencies.',
  docsUrl: 'https://migrationpilot.dev/rules/mp026',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (!('DropStmt' in stmt)) return null;

    const drop = stmt.DropStmt as {
      removeType?: string;
      objects?: unknown[];
      missing_ok?: boolean;
    };

    if (drop.removeType !== 'OBJECT_TABLE') return null;

    const tableName = extractTableName(drop);

    return {
      ruleId: 'MP026',
      ruleName: 'ban-drop-table',
      severity: 'critical',
      message: `DROP TABLE "${tableName}" permanently removes the table and all its data. This is irreversible and takes an ACCESS EXCLUSIVE lock.`,
      line: ctx.line,
      safeAlternative: `-- Step 1: Rename the table (keeps data as backup)
ALTER TABLE ${tableName} RENAME TO ${tableName}_deprecated;

-- Step 2: After confirming no application depends on it, drop later
-- DROP TABLE ${tableName}_deprecated;`,
    };
  },
};

function extractTableName(drop: { objects?: unknown[] }): string {
  if (!drop.objects || drop.objects.length === 0) return 'unknown';
  const obj = drop.objects[0] as Record<string, unknown>;

  if ('List' in obj) {
    const list = (obj as { List: { items: Array<{ String?: { sval: string } }> } }).List;
    const parts = list.items?.filter(i => i.String?.sval).map(i => i.String!.sval);
    return parts?.join('.') ?? 'unknown';
  }

  return 'unknown';
}
