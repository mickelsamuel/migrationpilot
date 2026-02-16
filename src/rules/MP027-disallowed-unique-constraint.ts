import type { Rule, RuleContext, RuleViolation } from './engine.js';

const AT_AddConstraint = 'AT_AddConstraint';

export const disallowedUniqueConstraint: Rule = {
  id: 'MP027',
  name: 'disallowed-unique-constraint',
  severity: 'critical',
  description: 'Adding a UNIQUE constraint directly scans the entire table under ACCESS EXCLUSIVE lock. Create the index concurrently first, then add the constraint USING INDEX.',
  whyItMatters: 'ALTER TABLE ADD CONSTRAINT UNIQUE builds a unique index while holding ACCESS EXCLUSIVE lock, blocking all reads and writes for the entire scan. Instead, create the unique index concurrently (non-blocking), then attach it as a constraint with USING INDEX.',
  docsUrl: 'https://migrationpilot.dev/rules/mp027',

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
        indexname?: string;
      } | undefined;

      if (!constraint) continue;
      if (constraint.contype !== 'CONSTR_UNIQUE') continue;

      // Skip if using USING INDEX pattern (already safe)
      if (constraint.indexname) continue;

      const tableName = alter.relation?.relname ?? 'unknown';
      const constraintName = constraint.conname ?? 'unnamed_unique';

      return {
        ruleId: 'MP027',
        ruleName: 'disallowed-unique-constraint',
        severity: 'critical',
        message: `Adding UNIQUE constraint "${constraintName}" on "${tableName}" scans the entire table under ACCESS EXCLUSIVE lock. Create the index concurrently first, then use USING INDEX.`,
        line: ctx.line,
        safeAlternative: `-- Step 1: Create the unique index concurrently (non-blocking)
CREATE UNIQUE INDEX CONCURRENTLY ${constraintName}_idx ON ${tableName} (...);

-- Step 2: Add the constraint using the pre-built index (instant)
ALTER TABLE ${tableName} ADD CONSTRAINT ${constraintName} UNIQUE USING INDEX ${constraintName}_idx;`,
      };
    }

    return null;
  },
};
