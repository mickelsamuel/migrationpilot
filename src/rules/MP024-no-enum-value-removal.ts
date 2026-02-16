import type { Rule, RuleContext, RuleViolation } from './engine.js';

export const noEnumValueRemoval: Rule = {
  id: 'MP024',
  name: 'no-enum-value-removal',
  severity: 'warning',
  description: 'DROP TYPE destroys the enum and all columns using it. PostgreSQL has no ALTER TYPE ... DROP VALUE — removing enum values requires a full type recreation.',
  whyItMatters: 'Dropping an enum type destroys the type and fails if any columns reference it. PostgreSQL cannot remove individual enum values — you must recreate the type and migrate all columns, which requires an ACCESS EXCLUSIVE lock per table.',
  docsUrl: 'https://migrationpilot.dev/rules/mp024',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (!('DropStmt' in stmt)) return null;

    const drop = stmt.DropStmt as {
      removeType?: string;
      objects?: unknown[];
    };

    // Only flag DROP TYPE, not DROP TABLE/INDEX/etc.
    if (drop.removeType !== 'OBJECT_TYPE') return null;

    const typeName = extractTypeName(drop.objects);

    return {
      ruleId: 'MP024',
      ruleName: 'no-enum-value-removal',
      severity: 'warning',
      message: `DROP TYPE${typeName ? ` "${typeName}"` : ''} will destroy the type and fail if any columns use it. PostgreSQL cannot remove individual enum values — the type must be recreated.`,
      line: ctx.line,
      safeAlternative: `-- Safe enum recreation pattern:
-- 1. Create the new type:
--    CREATE TYPE ${typeName || '<type>'}_new AS ENUM ('value1', 'value2');
-- 2. Migrate columns (ACCESS EXCLUSIVE lock, rewrites table):
--    ALTER TABLE <table> ALTER COLUMN <col>
--      TYPE ${typeName || '<type>'}_new USING <col>::text::${typeName || '<type>'}_new;
-- 3. Drop the old type:
--    DROP TYPE ${typeName || '<type>'};
-- 4. Rename:
--    ALTER TYPE ${typeName || '<type>'}_new RENAME TO ${typeName || '<type>'};`,
    };
  },
};

function extractTypeName(objects: unknown[] | undefined): string | null {
  if (!objects || objects.length === 0) return null;
  const obj = objects[0] as Record<string, unknown>;

  if ('TypeName' in obj) {
    const tn = (obj as { TypeName: { names: Array<{ String?: { sval: string } }> } }).TypeName;
    const parts = tn.names?.filter(n => n.String?.sval).map(n => n.String!.sval);
    return parts?.join('.') ?? null;
  }

  return null;
}
