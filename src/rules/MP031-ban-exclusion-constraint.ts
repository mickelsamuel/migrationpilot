import type { Rule, RuleContext, RuleViolation } from './engine.js';

const AT_AddConstraint = 'AT_AddConstraint';

export const banExclusionConstraint: Rule = {
  id: 'MP031',
  name: 'ban-exclusion-constraint',
  severity: 'critical',
  description: 'Adding an EXCLUSION constraint builds a GiST index and scans the entire table under ACCESS EXCLUSIVE lock. This cannot use NOT VALID.',
  whyItMatters: 'EXCLUSION constraints require a GiST index, which is built inline while holding ACCESS EXCLUSIVE lock. Unlike CHECK or FK constraints, exclusion constraints have no NOT VALID option — the full table scan and index build happen atomically, blocking all reads and writes for the entire duration.',
  docsUrl: 'https://migrationpilot.dev/rules/mp031',

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
      } | undefined;

      if (!constraint) continue;
      if (constraint.contype !== 'CONSTR_EXCLUSION') continue;

      const tableName = alter.relation?.relname ?? 'unknown';
      const constraintName = constraint.conname ?? 'unnamed_exclusion';

      return {
        ruleId: 'MP031',
        ruleName: 'ban-exclusion-constraint',
        severity: 'critical',
        message: `EXCLUSION constraint "${constraintName}" on "${tableName}" builds a GiST index under ACCESS EXCLUSIVE lock. This cannot use NOT VALID and blocks all reads and writes for the full scan.`,
        line: ctx.line,
        safeAlternative: `-- Exclusion constraints cannot be added without locking.
-- Consider these alternatives:
-- 1. Add during a maintenance window
-- 2. Create the table with the exclusion constraint from the start
-- 3. Use application-level uniqueness checking with advisory locks`,
      };
    }

    return null;
  },
};
