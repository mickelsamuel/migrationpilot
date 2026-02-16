import type { Rule, RuleContext, RuleViolation } from './engine.js';

const AT_AddConstraint = 'AT_AddConstraint';

export const requireNotValidCheck: Rule = {
  id: 'MP030',
  name: 'require-not-valid-check',
  severity: 'critical',
  description: 'Adding a CHECK constraint without NOT VALID scans the entire table under ACCESS EXCLUSIVE lock. Add with NOT VALID first, then VALIDATE separately.',
  whyItMatters: 'ALTER TABLE ADD CONSTRAINT CHECK validates all existing rows while holding an ACCESS EXCLUSIVE lock, blocking all reads and writes. NOT VALID skips the scan during creation (instant), then VALIDATE CONSTRAINT checks rows under a less restrictive lock that allows concurrent reads and writes.',
  docsUrl: 'https://migrationpilot.dev/rules/mp030',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (!('AlterTableStmt' in stmt)) return null;

    const alter = stmt.AlterTableStmt as {
      relation?: { relname?: string };
      cmds?: Array<{ AlterTableCmd: { subtype: string; def?: Record<string, unknown> } }>;
    };

    if (!alter.cmds) return null;

    for (const cmd of alter.cmds) {
      if (cmd.AlterTableCmd.subtype !== AT_AddConstraint) continue;

      const constraint = cmd.AlterTableCmd.def?.Constraint as {
        contype?: string;
        conname?: string;
        skip_validation?: boolean;
      } | undefined;

      if (!constraint) continue;
      if (constraint.contype !== 'CONSTR_CHECK') continue;
      if (constraint.skip_validation) continue;

      const tableName = alter.relation?.relname ?? 'unknown';
      const constraintName = constraint.conname ?? 'unnamed_check';

      return {
        ruleId: 'MP030',
        ruleName: 'require-not-valid-check',
        severity: 'critical',
        message: `CHECK constraint "${constraintName}" on "${tableName}" without NOT VALID scans the entire table under ACCESS EXCLUSIVE lock, blocking all reads and writes.`,
        line: ctx.line,
        safeAlternative: `-- Step 1: Add CHECK with NOT VALID (instant, no scan)
ALTER TABLE ${tableName} ADD CONSTRAINT ${constraintName} CHECK (...) NOT VALID;

-- Step 2: Validate separately (SHARE UPDATE EXCLUSIVE — allows reads + writes)
ALTER TABLE ${tableName} VALIDATE CONSTRAINT ${constraintName};`,
      };
    }

    return null;
  },
};
