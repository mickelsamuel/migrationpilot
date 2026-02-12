import type { Rule, RuleContext, RuleViolation } from './engine.js';

export const requireDropIndexConcurrently: Rule = {
  id: 'MP009',
  name: 'require-drop-index-concurrently',
  severity: 'warning',
  description: 'DROP INDEX without CONCURRENTLY acquires ACCESS EXCLUSIVE lock, blocking all reads and writes.',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (!('DropStmt' in stmt)) return null;

    const drop = stmt.DropStmt as {
      removeType?: string;
      concurrent?: boolean;
      objects?: unknown[];
    };

    // Only flag DROP INDEX, not DROP TABLE etc.
    if (drop.removeType !== 'OBJECT_INDEX') return null;
    if (drop.concurrent) return null;

    const indexName = extractIndexName(drop.objects);

    return {
      ruleId: 'MP009',
      ruleName: 'require-drop-index-concurrently',
      severity: 'warning',
      message: `DROP INDEX${indexName ? ` "${indexName}"` : ''} without CONCURRENTLY acquires ACCESS EXCLUSIVE lock, blocking all reads and writes on the table.`,
      line: ctx.line,
      safeAlternative: ctx.originalSql.replace(/DROP\s+INDEX/i, 'DROP INDEX CONCURRENTLY'),
    };
  },
};

function extractIndexName(objects: unknown[] | undefined): string | null {
  if (!objects || objects.length === 0) return null;
  const obj = objects[0];
  if (obj && typeof obj === 'object' && 'List' in obj) {
    const list = (obj as { List: { items: Array<{ String?: { sval: string } }> } }).List;
    const parts = list.items?.filter(i => i.String?.sval).map(i => i.String!.sval);
    return parts?.join('.') ?? null;
  }
  return null;
}
