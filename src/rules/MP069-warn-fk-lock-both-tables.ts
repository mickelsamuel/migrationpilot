import type { Rule, RuleContext, RuleViolation } from './engine.js';

/**
 * MP069: warn-fk-lock-both-tables
 *
 * Adding a foreign key constraint acquires a SHARE ROW EXCLUSIVE lock
 * on BOTH the source table (where the FK column lives) and the referenced
 * table (the target). This means two tables are locked simultaneously,
 * which doubles the blast radius and can cause unexpected blocking.
 *
 * This is different from MP005 (which focuses on NOT VALID) — MP069 warns
 * about the dual-table locking regardless of NOT VALID usage.
 */

export const warnFkLockBothTables: Rule = {
  id: 'MP069',
  name: 'warn-fk-lock-both-tables',
  severity: 'warning',
  description: 'Adding a foreign key locks BOTH the source and referenced table simultaneously.',
  whyItMatters:
    'ALTER TABLE ADD CONSTRAINT ... FOREIGN KEY acquires SHARE ROW EXCLUSIVE lock on both ' +
    'the table with the FK column AND the referenced table. This blocks writes to both tables ' +
    'simultaneously, doubling the blast radius. If either table is high-traffic, the lock wait ' +
    'can cascade to all queries on both tables.',
  docsUrl: 'https://migrationpilot.dev/rules/mp069',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (!('AlterTableStmt' in stmt)) return null;

    const alter = stmt.AlterTableStmt as {
      relation?: { relname?: string };
      cmds?: Array<{
        AlterTableCmd?: {
          subtype?: string;
          def?: Record<string, unknown>;
        };
      }>;
    };

    if (!alter.cmds) return null;

    for (const cmdWrapper of alter.cmds) {
      const cmd = cmdWrapper.AlterTableCmd;
      if (!cmd || cmd.subtype !== 'AT_AddConstraint') continue;

      const constraint = cmd.def?.Constraint as {
        contype?: string;
        conname?: string;
        pktable?: { relname?: string };
      } | undefined;

      if (!constraint || constraint.contype !== 'CONSTR_FOREIGN') continue;

      const sourceTable = alter.relation?.relname ?? 'unknown';
      const refTable = constraint.pktable?.relname ?? 'unknown';
      const constraintName = constraint.conname ?? 'fk';

      return {
        ruleId: 'MP069',
        ruleName: 'warn-fk-lock-both-tables',
        severity: 'warning',
        message: `FK "${constraintName}" locks both "${sourceTable}" AND "${refTable}" simultaneously (SHARE ROW EXCLUSIVE). Set lock_timeout on both tables to fail fast.`,
        line: ctx.line,
        safeAlternative: `-- Set a short lock_timeout to prevent cascading locks:
SET lock_timeout = '3s';
ALTER TABLE ${sourceTable} ADD CONSTRAINT ${constraintName}
  FOREIGN KEY (...) REFERENCES ${refTable} (...) NOT VALID;
RESET lock_timeout;

-- Then validate separately (weaker lock):
ALTER TABLE ${sourceTable} VALIDATE CONSTRAINT ${constraintName};`,
      };
    }

    return null;
  },
};
