/**
 * MP018: no-force-set-not-null
 *
 * ALTER TABLE ... SET NOT NULL without a pre-existing CHECK constraint scans
 * the entire table under ACCESS EXCLUSIVE lock to verify no NULLs exist.
 * On PG 12+ you can avoid the scan by adding a CHECK (col IS NOT NULL) NOT VALID
 * constraint first, validating it separately, then SET NOT NULL is instant.
 *
 * Safe alternative: Add a CHECK constraint NOT VALID, validate it, then SET NOT NULL.
 */

import type { Rule, RuleContext, RuleViolation } from './engine.js';

export const noForceNotNull: Rule = {
  id: 'MP018',
  name: 'no-force-set-not-null',
  severity: 'warning',
  description: 'SET NOT NULL without a pre-existing CHECK constraint scans the entire table under ACCESS EXCLUSIVE lock.',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (!('AlterTableStmt' in stmt)) return null;

    const alter = stmt.AlterTableStmt as {
      relation?: { relname?: string };
      cmds?: Array<{
        AlterTableCmd?: {
          subtype?: string;
          name?: string;
        };
      }>;
    };

    if (!alter.cmds) return null;

    const tableName = alter.relation?.relname || 'unknown';

    for (const cmd of alter.cmds) {
      const atCmd = cmd.AlterTableCmd;
      if (!atCmd || atCmd.subtype !== 'AT_SetNotNull') continue;

      // PG 12+ optimisation: check if there's a preceding CHECK (col IS NOT NULL) in the migration
      if (ctx.pgVersion >= 12) {
        const colName = atCmd.name || '';
        const hasCheckConstraint = ctx.allStatements.some((s, idx) => {
          if (idx >= ctx.statementIndex) return false;
          if (!('AlterTableStmt' in s.stmt)) return false;
          const prevAlter = s.stmt.AlterTableStmt as {
            relation?: { relname?: string };
            cmds?: Array<{
              AlterTableCmd?: {
                subtype?: string;
                def?: {
                  Constraint?: {
                    contype?: string;
                    raw_expr?: Record<string, unknown>;
                  };
                };
              };
            }>;
          };
          if (prevAlter.relation?.relname !== tableName) return false;
          return prevAlter.cmds?.some(c => {
            const pc = c.AlterTableCmd;
            if (!pc || pc.subtype !== 'AT_AddConstraint') return false;
            const constraint = pc.def?.Constraint;
            if (!constraint || constraint.contype !== 'CONSTR_CHECK') return false;
            // Check if the constraint references this column via SQL text
            const prevSql = s.originalSql.toLowerCase();
            return prevSql.includes(colName.toLowerCase()) && prevSql.includes('is not null');
          }) ?? false;
        });
        if (hasCheckConstraint) continue;
      }

      const columnName = atCmd.name || 'unknown';

      return {
        ruleId: 'MP018',
        ruleName: 'no-force-set-not-null',
        severity: 'warning',
        message: `SET NOT NULL on "${tableName}"."${columnName}" scans the entire table under ACCESS EXCLUSIVE lock to verify no NULLs.`,
        line: ctx.line,
        safeAlternative: ctx.pgVersion >= 12
          ? `-- PG 12+ safe approach:
-- Step 1: Add CHECK constraint NOT VALID (instant, no scan)
ALTER TABLE ${tableName} ADD CONSTRAINT ${tableName}_${columnName}_not_null
  CHECK (${columnName} IS NOT NULL) NOT VALID;

-- Step 2: Validate separately (SHARE UPDATE EXCLUSIVE — allows reads + writes)
ALTER TABLE ${tableName} VALIDATE CONSTRAINT ${tableName}_${columnName}_not_null;

-- Step 3: SET NOT NULL is now instant (PG sees the validated CHECK)
ALTER TABLE ${tableName} ALTER COLUMN ${columnName} SET NOT NULL;`
          : `-- Set a short lock_timeout to fail fast
SET lock_timeout = '5s';
ALTER TABLE ${tableName} ALTER COLUMN ${columnName} SET NOT NULL;
RESET lock_timeout;`,
      };
    }

    return null;
  },
};
