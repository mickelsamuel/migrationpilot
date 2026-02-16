import type { Rule, RuleContext, RuleViolation } from './engine.js';

export const banDropSchema: Rule = {
  id: 'MP035',
  name: 'ban-drop-schema',
  severity: 'critical',
  description: 'DROP SCHEMA permanently removes the schema and potentially all objects within it. Use with extreme caution.',
  whyItMatters: 'DROP SCHEMA removes the schema and — with CASCADE — all tables, views, functions, and types it contains. Even without CASCADE it takes an ACCESS EXCLUSIVE lock. Dropped schemas cannot be recovered without a backup restore.',
  docsUrl: 'https://migrationpilot.dev/rules/mp035',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (!('DropStmt' in stmt)) return null;

    const drop = stmt.DropStmt as {
      removeType?: string;
      objects?: unknown[];
      behavior?: string;
    };

    if (drop.removeType !== 'OBJECT_SCHEMA') return null;

    const schemaName = extractSchemaName(drop);
    const isCascade = drop.behavior === 'DROP_CASCADE';

    return {
      ruleId: 'MP035',
      ruleName: 'ban-drop-schema',
      severity: 'critical',
      message: `DROP SCHEMA "${schemaName}"${isCascade ? ' CASCADE' : ''} permanently removes the schema${isCascade ? ' and ALL objects within it' : ''}. This is irreversible without a backup.`,
      line: ctx.line,
      safeAlternative: `-- Verify the schema is empty and unused before dropping:
-- SELECT * FROM information_schema.tables WHERE table_schema = '${schemaName}';
-- SELECT * FROM information_schema.routines WHERE routine_schema = '${schemaName}';`,
    };
  },
};

function extractSchemaName(drop: { objects?: unknown[] }): string {
  if (!drop.objects || drop.objects.length === 0) return 'unknown';
  const obj = drop.objects[0];

  if (typeof obj === 'string') return obj;

  if (obj && typeof obj === 'object' && 'String' in obj) {
    return (obj as { String: { sval: string } }).String.sval;
  }

  if (Array.isArray(obj)) {
    const first = obj[0];
    if (first && typeof first === 'object' && 'String' in first) {
      return (first as { String: { sval: string } }).String.sval;
    }
  }

  return 'unknown';
}
