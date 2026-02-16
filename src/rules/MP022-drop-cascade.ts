import type { Rule, RuleContext, RuleViolation } from './engine.js';

export const noDropCascade: Rule = {
  id: 'MP022',
  name: 'no-drop-cascade',
  severity: 'warning',
  description: 'DROP ... CASCADE silently drops all dependent objects (views, foreign keys, policies). Always drop dependents explicitly.',
  whyItMatters: 'CASCADE silently drops all dependent objects — views, foreign keys, policies, and triggers — without listing them. You may unintentionally destroy critical production objects that other services depend on.',
  docsUrl: 'https://migrationpilot.dev/rules/mp022',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (!('DropStmt' in stmt)) return null;

    const drop = stmt.DropStmt as {
      removeType?: string;
      behavior?: string;
      objects?: unknown[];
    };

    if (drop.behavior !== 'DROP_CASCADE') return null;

    const objectType = drop.removeType?.replace('OBJECT_', '').toLowerCase() ?? 'object';
    const objectName = extractObjectName(drop);

    return {
      ruleId: 'MP022',
      ruleName: 'no-drop-cascade',
      severity: 'warning',
      message: `DROP ${objectType.toUpperCase()}${objectName ? ` "${objectName}"` : ''} CASCADE will silently drop all dependent objects (views, foreign keys, policies, triggers). Drop dependents explicitly instead.`,
      line: ctx.line,
      safeAlternative: `-- First check dependent objects:
-- SELECT deptype, classid::regclass, objid, objsubid
--   FROM pg_depend
--   WHERE refobjid = '${objectName || '<object>'}'::regclass;
-- Then drop dependents explicitly before the target:
${ctx.originalSql.replace(/\s+CASCADE\s*;?\s*$/i, ';')}`,
    };
  },
};

function extractObjectName(drop: { removeType?: string; objects?: unknown[] }): string | null {
  if (!drop.objects || drop.objects.length === 0) return null;
  const obj = drop.objects[0] as Record<string, unknown>;

  // Table/Index/View: objects are List { items: [String { sval }] }
  if ('List' in obj) {
    const list = (obj as { List: { items: Array<{ String?: { sval: string } }> } }).List;
    const parts = list.items?.filter(i => i.String?.sval).map(i => i.String!.sval);
    return parts?.join('.') ?? null;
  }

  // Type: objects are TypeName { names: [String { sval }] }
  if ('TypeName' in obj) {
    const tn = (obj as { TypeName: { names: Array<{ String?: { sval: string } }> } }).TypeName;
    const parts = tn.names?.filter(n => n.String?.sval).map(n => n.String!.sval);
    return parts?.join('.') ?? null;
  }

  return null;
}
