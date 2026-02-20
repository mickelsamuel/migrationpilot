import type { Rule, RuleContext, RuleViolation } from './engine.js';

export const alterTypeRenameValue: Rule = {
  id: 'MP060',
  name: 'alter-type-rename-value',
  severity: 'critical',
  description: 'ALTER TYPE ... RENAME VALUE is not replicated via logical replication, silently causing enum mismatches on subscribers.',
  whyItMatters: 'RENAME VALUE modifies the pg_enum catalog entry in-place. Logical replication does not replicate catalog changes, so subscribers (Neon branches, Supabase read replicas, RDS logical replicas, Debezium CDC) retain the old value name. Any row containing the renamed value that arrives via replication will fail to decode. The only safe alternative is to add a new value, migrate data, then drop the old one.',
  docsUrl: 'https://migrationpilot.dev/rules/mp060',

  check(stmt: Record<string, unknown>, _ctx: RuleContext): RuleViolation | null {
    // Detect ALTER TYPE ... RENAME VALUE via SQL text since the AST
    // representation varies across libpg-query versions
    if (!('AlterEnumStmt' in stmt)) return null;

    const alterEnum = stmt.AlterEnumStmt as {
      typeName?: Array<{ String?: { sval: string } }>;
      newVal?: string;
      newValNeighbor?: string;
      newValIsAfter?: boolean;
      skipIfNewValExists?: boolean;
    };

    // In libpg-query, RENAME VALUE sets newValNeighbor to the old value
    // and newVal to the new value. ADD VALUE only sets newVal.
    // We detect rename by checking the SQL text directly.
    const sql = _ctx.originalSql.toLowerCase();
    if (!sql.includes('rename value')) return null;

    const typeName = alterEnum.typeName
      ?.filter(t => t.String?.sval)
      .map(t => t.String!.sval)
      .join('.') ?? 'unknown';

    return {
      ruleId: 'MP060',
      ruleName: 'alter-type-rename-value',
      severity: 'critical',
      message: `ALTER TYPE "${typeName}" RENAME VALUE is not replicated via logical replication. This silently causes enum mismatches on subscribers (Neon, Supabase, RDS replicas, CDC pipelines).`,
      line: _ctx.line,
      safeAlternative: `-- Instead of RENAME VALUE, use add-migrate-drop:
-- 1. ALTER TYPE ${typeName} ADD VALUE 'new_name';
-- 2. UPDATE table SET col = 'new_name' WHERE col = 'old_name';
-- 3. -- Drop old value requires recreating the type (complex but safe)`,
    };
  },
};
