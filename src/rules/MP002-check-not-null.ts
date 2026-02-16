import type { Rule, RuleContext, RuleViolation } from './engine.js';

const AT_SetNotNull = 'AT_SetNotNull';

export const requireCheckNotNull: Rule = {
  id: 'MP002',
  name: 'require-check-not-null-pattern',
  severity: 'critical',
  description: 'ALTER TABLE ... SET NOT NULL requires a full table scan to validate. Use the CHECK constraint pattern instead for large tables.',
  whyItMatters: 'SET NOT NULL requires a full table scan while holding an ACCESS EXCLUSIVE lock. The CHECK constraint + VALIDATE pattern splits this into a brief lock for adding the constraint and a longer scan under a weaker lock that allows reads and writes.',
  docsUrl: 'https://migrationpilot.dev/rules/mp002',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (!('AlterTableStmt' in stmt)) return null;

    const alter = stmt.AlterTableStmt as {
      relation?: { relname?: string };
      cmds?: Array<{ AlterTableCmd: { subtype: string; name?: string } }>;
    };

    if (!alter.cmds) return null;

    for (const cmd of alter.cmds) {
      if (cmd.AlterTableCmd.subtype !== AT_SetNotNull) continue;

      const tableName = alter.relation?.relname ?? 'unknown';
      const columnName = cmd.AlterTableCmd.name ?? 'unknown';

      // Check if there's a preceding CHECK constraint for this column
      const hasCheck = hasPrecedingCheckConstraint(ctx, tableName, columnName);
      if (hasCheck && ctx.pgVersion >= 12) continue;

      const safeAlternative = generateSafeNotNull(tableName, columnName, ctx.pgVersion);

      return {
        ruleId: 'MP002',
        ruleName: 'require-check-not-null-pattern',
        severity: 'critical',
        message: `SET NOT NULL on "${tableName}"."${columnName}" requires a full table scan under ACCESS EXCLUSIVE lock. Use the CHECK constraint pattern for zero-downtime.`,
        line: ctx.line,
        safeAlternative,
      };
    }

    return null;
  },
};

function hasPrecedingCheckConstraint(ctx: RuleContext, tableName: string, columnName: string): boolean {
  for (let i = 0; i < ctx.statementIndex; i++) {
    const entry = ctx.allStatements[i];
    if (!entry) continue;
    const prevStmt = entry.stmt;
    if (!('AlterTableStmt' in prevStmt)) continue;

    const alter = prevStmt.AlterTableStmt as {
      relation?: { relname?: string };
      cmds?: Array<{ AlterTableCmd: { subtype: string; def?: Record<string, unknown> } }>;
    };

    if (alter.relation?.relname !== tableName) continue;
    if (!alter.cmds) continue;

    for (const cmd of alter.cmds) {
      if (cmd.AlterTableCmd.subtype !== 'AT_AddConstraint') continue;
      const constraint = cmd.AlterTableCmd.def?.Constraint as { contype?: string; raw_expr?: unknown } | undefined;
      if (!constraint) continue;

      // Check if it's a CHECK constraint referencing this column
      const exprStr = JSON.stringify(constraint.raw_expr ?? '').toLowerCase();
      if (constraint.contype === 'CONSTR_CHECK' && exprStr.includes(columnName.toLowerCase())) {
        return true;
      }
    }
  }
  return false;
}

function generateSafeNotNull(tableName: string, columnName: string, pgVersion: number): string {
  if (pgVersion >= 18) {
    return `-- PG 18+ approach: SET NOT NULL NOT VALID + VALIDATE NOT NULL
-- Step 1: Mark column NOT NULL without scanning (instant, brief lock)
ALTER TABLE ${tableName} ALTER COLUMN ${columnName} SET NOT NULL NOT VALID;

-- Step 2: Validate separately (SHARE UPDATE EXCLUSIVE — allows reads + writes)
ALTER TABLE ${tableName} VALIDATE NOT NULL ${columnName};`;
  }

  return `-- Step 1: Add CHECK constraint (brief ACCESS EXCLUSIVE lock, no table scan)
ALTER TABLE ${tableName} ADD CONSTRAINT ${tableName}_${columnName}_not_null
  CHECK (${columnName} IS NOT NULL) NOT VALID;

-- Step 2: Validate constraint (SHARE UPDATE EXCLUSIVE — allows reads + writes)
ALTER TABLE ${tableName} VALIDATE CONSTRAINT ${tableName}_${columnName}_not_null;

-- Step 3: Set NOT NULL using validated constraint (PG 12+, instant — uses existing CHECK)
ALTER TABLE ${tableName} ALTER COLUMN ${columnName} SET NOT NULL;

-- Step 4: Clean up the CHECK constraint
ALTER TABLE ${tableName} DROP CONSTRAINT ${tableName}_${columnName}_not_null;`;
}
