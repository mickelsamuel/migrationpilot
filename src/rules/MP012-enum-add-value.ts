import type { Rule, RuleContext, RuleViolation } from './engine.js';

export const noEnumAddInTransaction: Rule = {
  id: 'MP012',
  name: 'no-enum-add-value-in-transaction',
  severity: 'warning',
  description: 'ALTER TYPE ... ADD VALUE cannot run inside a transaction block on PG < 12. Even on PG 12+, enum modifications take ACCESS EXCLUSIVE on the type.',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (!('AlterEnumStmt' in stmt)) return null;

    const alterEnum = stmt.AlterEnumStmt as {
      typeName?: Array<{ String?: { sval: string } }>;
      newVal?: string;
    };

    // Check if inside a transaction
    const inTransaction = isInsideTransaction(ctx);

    const typeName = alterEnum.typeName
      ?.filter(t => t.String?.sval)
      .map(t => t.String!.sval)
      .join('.') ?? 'unknown';
    const newValue = alterEnum.newVal ?? 'unknown';

    if (inTransaction && ctx.pgVersion < 12) {
      return {
        ruleId: 'MP012',
        ruleName: 'no-enum-add-value-in-transaction',
        severity: 'warning',
        message: `ALTER TYPE "${typeName}" ADD VALUE '${newValue}' inside a transaction block will fail on PostgreSQL ${ctx.pgVersion}. This is only supported in PG 12+.`,
        line: ctx.line,
        safeAlternative: `-- Run outside a transaction block:
ALTER TYPE ${typeName} ADD VALUE '${newValue}';`,
      };
    }

    if (inTransaction && ctx.pgVersion >= 12) {
      return {
        ruleId: 'MP012',
        ruleName: 'no-enum-add-value-in-transaction',
        severity: 'warning',
        message: `ALTER TYPE "${typeName}" ADD VALUE '${newValue}' in a transaction. On PG 12+ this works but takes ACCESS EXCLUSIVE on the enum type. Consider running outside the transaction to minimize lock duration.`,
        line: ctx.line,
      };
    }

    return null;
  },
};

function isInsideTransaction(ctx: RuleContext): boolean {
  for (let i = ctx.statementIndex - 1; i >= 0; i--) {
    const sql = ctx.allStatements[i].originalSql.toLowerCase().trim();
    if (sql === 'begin' || sql === 'begin transaction' || sql.startsWith('begin;')) return true;
    if (sql === 'commit' || sql === 'rollback' || sql.startsWith('commit;')) return false;
  }
  return false;
}
