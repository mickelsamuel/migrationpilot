import type { Rule, RuleContext, RuleViolation } from './engine.js';

/**
 * MP081: prefer-pg18-not-null-not-valid
 *
 * On PostgreSQL 18+, the native SET NOT NULL NOT VALID + VALIDATE NOT NULL
 * syntax is available. Detects the old CHECK (col IS NOT NULL) NOT VALID
 * workaround and suggests the simpler PG18 approach.
 *
 * Does NOT overlap with MP002 (which catches bare SET NOT NULL).
 * MP081 catches the old workaround that is no longer needed on PG18+.
 */
export const preferPg18NotNullNotValid: Rule = {
  id: 'MP081',
  name: 'prefer-pg18-not-null-not-valid',
  severity: 'warning',
  description: 'On PG18+, use native SET NOT NULL NOT VALID instead of the CHECK constraint workaround.',
  whyItMatters:
    'PostgreSQL 18 introduced ALTER TABLE ... SET NOT NULL NOT VALID, which marks a column NOT NULL ' +
    'without scanning the table (instant). The old workaround of adding a CHECK (col IS NOT NULL) ' +
    'NOT VALID constraint is no longer needed and adds unnecessary complexity.',
  docsUrl: 'https://migrationpilot.dev/rules/mp081',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (ctx.pgVersion < 18) return null;
    if (!('AlterTableStmt' in stmt)) return null;

    const alter = stmt.AlterTableStmt as {
      relation?: { relname?: string };
      cmds?: Array<{ AlterTableCmd: { subtype: string; def?: Record<string, unknown> } }>;
    };

    if (!alter.cmds) return null;

    for (const cmd of alter.cmds) {
      if (cmd.AlterTableCmd.subtype !== 'AT_AddConstraint') continue;

      const constraint = cmd.AlterTableCmd.def?.Constraint as {
        contype?: string;
        skip_validation?: boolean;
        conname?: string;
        raw_expr?: unknown;
      } | undefined;

      if (!constraint) continue;
      if (constraint.contype !== 'CONSTR_CHECK') continue;
      if (!constraint.skip_validation) continue;

      // Check if the CHECK expression is a NOT NULL check
      const exprStr = JSON.stringify(constraint.raw_expr ?? '');
      if (!isNotNullCheck(exprStr)) continue;

      const tableName = alter.relation?.relname ?? 'unknown';
      const columnName = extractColumnName(exprStr) ?? 'unknown';

      return {
        ruleId: 'MP081',
        ruleName: 'prefer-pg18-not-null-not-valid',
        severity: 'warning',
        message: `CHECK (${columnName} IS NOT NULL) NOT VALID on "${tableName}" can be simplified on PG18+. Use native SET NOT NULL NOT VALID instead.`,
        line: ctx.line,
        safeAlternative: `-- PG18+ native approach (simpler, same safety):
ALTER TABLE ${tableName} ALTER COLUMN ${columnName} SET NOT NULL NOT VALID;
ALTER TABLE ${tableName} VALIDATE NOT NULL ${columnName};`,
      };
    }

    return null;
  },
};

/** Check if a serialized expression represents IS NOT NULL */
function isNotNullCheck(exprJson: string): boolean {
  return exprJson.includes('IS_NOT_NULL') || exprJson.includes('"nulltesttype"');
}

/** Extract column name from a serialized NOT NULL check expression */
function extractColumnName(exprJson: string): string | null {
  const match = exprJson.match(/"sval"\s*:\s*"([^"]+)"/);
  return match?.[1] ?? null;
}
