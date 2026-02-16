import type { Rule, RuleContext, RuleViolation } from './engine.js';

const AT_AddConstraint = 'AT_AddConstraint';

export const requireNotValidFK: Rule = {
  id: 'MP005',
  name: 'require-not-valid-foreign-key',
  severity: 'critical',
  description: 'Adding a FK constraint without NOT VALID scans the entire table under ACCESS EXCLUSIVE lock.',
  whyItMatters: 'Adding a foreign key validates all existing rows while holding an ACCESS EXCLUSIVE lock. NOT VALID skips validation during creation, then VALIDATE CONSTRAINT checks rows with a SHARE UPDATE EXCLUSIVE lock that allows reads and writes.',
  docsUrl: 'https://migrationpilot.dev/rules/mp005',

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
        skip_validation?: boolean;
        conname?: string;
        pktable?: { relname?: string };
      } | undefined;

      if (!constraint) continue;
      if (constraint.contype !== 'CONSTR_FOREIGN') continue;
      if (constraint.skip_validation) continue;

      const tableName = alter.relation?.relname ?? 'unknown';
      const constraintName = constraint.conname ?? 'unnamed_fk';
      const refTable = constraint.pktable?.relname ?? 'unknown';

      return {
        ruleId: 'MP005',
        ruleName: 'require-not-valid-foreign-key',
        severity: 'critical',
        message: `FK constraint "${constraintName}" on "${tableName}" → "${refTable}" without NOT VALID. This scans the entire table under ACCESS EXCLUSIVE lock, blocking all reads and writes.`,
        line: ctx.line,
        safeAlternative: `-- Step 1: Add FK with NOT VALID (brief lock, no scan)
ALTER TABLE ${tableName} ADD CONSTRAINT ${constraintName}
  FOREIGN KEY (...) REFERENCES ${refTable} (...) NOT VALID;

-- Step 2: Validate separately (SHARE UPDATE EXCLUSIVE — allows reads + writes)
ALTER TABLE ${tableName} VALIDATE CONSTRAINT ${constraintName};`,
      };
    }

    return null;
  },
};
