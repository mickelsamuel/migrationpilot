import type { Rule, RuleContext, RuleViolation } from './engine.js';

export const alterTypeAddValueInTransaction: Rule = {
  id: 'MP054',
  name: 'alter-type-add-value-in-transaction',
  severity: 'critical',
  description: 'ALTER TYPE ... ADD VALUE in the same transaction as a statement referencing the new value will fail on PG < 12, and on PG 12+ the new value is not visible until COMMIT.',
  whyItMatters: 'On PostgreSQL < 12, ALTER TYPE ADD VALUE cannot run inside a transaction at all. On PG 12+, it can run in a transaction but the new enum value is not visible to other statements in the same transaction — any INSERT or UPDATE referencing the new value will fail with "unsafe use of new value." Prisma, TypeORM, and Alembic frequently generate migrations that trigger this.',
  docsUrl: 'https://migrationpilot.dev/rules/mp054',

  check(_stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    // Only check DML statements (INSERT, UPDATE) inside transactions
    const sql = ctx.originalSql.toLowerCase().trim();
    const isInsertOrUpdate = sql.startsWith('insert') || sql.startsWith('update');
    if (!isInsertOrUpdate) return null;

    // Look for ALTER TYPE ADD VALUE in earlier statements within the same transaction
    let inTransaction = false;
    const addedValues: Array<{ typeName: string; value: string; line: number }> = [];

    for (let i = 0; i < ctx.statementIndex; i++) {
      const entry = ctx.allStatements[i];
      if (!entry) continue;
      const s = entry.originalSql.toLowerCase().trim();

      if (s === 'begin' || s === 'begin transaction' || s.startsWith('begin;')) {
        inTransaction = true;
        addedValues.length = 0; // Reset on new transaction
      } else if (s === 'commit' || s === 'rollback' || s.startsWith('commit;') || s.startsWith('rollback;')) {
        inTransaction = false;
        addedValues.length = 0;
      }

      // Track ALTER TYPE ADD VALUE
      if (inTransaction && 'AlterEnumStmt' in entry.stmt) {
        const alterEnum = entry.stmt.AlterEnumStmt as {
          typeName?: Array<{ String?: { sval: string } }>;
          newVal?: string;
        };

        const typeName = alterEnum.typeName
          ?.filter(t => t.String?.sval)
          .map(t => t.String!.sval)
          .join('.') ?? 'unknown';
        const value = alterEnum.newVal ?? 'unknown';
        addedValues.push({ typeName, value, line: i + 1 });
      }
    }

    // If we're in a transaction and there were ADD VALUE statements before us, flag it
    if (inTransaction && addedValues.length > 0) {
      const first = addedValues[0]!;
      return {
        ruleId: 'MP054',
        ruleName: 'alter-type-add-value-in-transaction',
        severity: 'critical',
        message: `INSERT/UPDATE in the same transaction as ALTER TYPE "${first.typeName}" ADD VALUE '${first.value}'. The new enum value is not visible until COMMIT, so this statement will fail.`,
        line: ctx.line,
        safeAlternative: `-- Split into separate transactions:
-- Transaction 1: ALTER TYPE ${first.typeName} ADD VALUE '${first.value}';
-- Transaction 2 (after COMMIT): ${ctx.originalSql.trim().slice(0, 60)}...`,
      };
    }

    return null;
  },
};
