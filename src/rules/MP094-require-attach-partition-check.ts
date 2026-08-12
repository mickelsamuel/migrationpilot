import type { Rule, RuleContext, RuleViolation } from './engine.js';

/**
 * MP094: require-attach-partition-check
 *
 * ATTACH PARTITION has to prove that every row in the table being attached
 * satisfies the partition bound. By default it proves it the slow way: a full
 * scan of the table, under ACCESS EXCLUSIVE on both the table and the parent.
 *
 * PostgreSQL will skip that scan entirely if an existing CHECK constraint
 * already implies the bound. Adding the constraint first — with NOT VALID,
 * then VALIDATE, neither of which blocks reads and writes the way ATTACH does
 * — moves the whole cost out of the lock window.
 *
 * MP072 covers the other scan ATTACH can trigger, of the DEFAULT partition.
 * This rule stays quiet when a matching CHECK is already present, so a
 * correctly written ATTACH produces no violation here.
 */

export const requireAttachPartitionCheck: Rule = {
  id: 'MP094',
  name: 'require-attach-partition-check',
  severity: 'warning',
  description: 'ATTACH PARTITION without a matching CHECK constraint scans the whole table under ACCESS EXCLUSIVE to validate the bound.',
  whyItMatters:
    'Attaching a partition is meant to be a catalog operation, and it is, except for the validation ' +
    'scan. PostgreSQL reads every row of the incoming table to confirm it fits the partition bound, ' +
    'holding ACCESS EXCLUSIVE on both that table and the parent, which means the entire partitioned ' +
    'table is unavailable for the duration. On the multi-million-row table that a new partition ' +
    'usually is, that is minutes of downtime for what should be an instant operation. An equivalent ' +
    'CHECK constraint added beforehand lets PostgreSQL skip the scan on the strength of the ' +
    'constraint, and the work of validating it happens under a lock that does not block traffic.',
  docsUrl: 'https://migrationpilot.dev/rules/mp094',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (!('AlterTableStmt' in stmt)) return null;

    const alter = stmt.AlterTableStmt as {
      relation?: { relname?: string };
      cmds?: Array<{
        AlterTableCmd?: {
          subtype?: string;
          def?: { PartitionCmd?: { name?: { relname?: string } } };
        };
      }>;
    };

    if (!alter.cmds) return null;
    const parentTable = alter.relation?.relname ?? 'unknown';

    for (const cmdWrapper of alter.cmds) {
      const cmd = cmdWrapper.AlterTableCmd;
      if (!cmd || cmd.subtype !== 'AT_AttachPartition') continue;

      const partitionName = cmd.def?.PartitionCmd?.name?.relname;
      if (!partitionName) continue;

      // A CHECK on the incoming table earlier in the migration lets PG skip the scan.
      if (hasCheckConstraintOn(partitionName, ctx)) continue;

      return {
        ruleId: 'MP094',
        ruleName: 'require-attach-partition-check',
        severity: 'warning',
        message: `ATTACH PARTITION "${partitionName}" onto "${parentTable}" has no matching CHECK constraint on "${partitionName}", so PostgreSQL scans the whole table to validate the bound while holding ACCESS EXCLUSIVE on both tables.`,
        line: ctx.line,
        safeAlternative: `-- Add a CHECK matching the partition bound first. PostgreSQL then trusts
-- it and skips the validation scan during ATTACH.
ALTER TABLE ${partitionName}
  ADD CONSTRAINT ${partitionName}_bound
  CHECK (partition_key >= '<lower>' AND partition_key < '<upper>') NOT VALID;

-- VALIDATE takes only SHARE UPDATE EXCLUSIVE, so reads and writes continue:
ALTER TABLE ${partitionName} VALIDATE CONSTRAINT ${partitionName}_bound;

-- Now the ATTACH is a catalog-only operation:
ALTER TABLE ${parentTable} ATTACH PARTITION ${partitionName} FOR VALUES ...;

-- The CHECK is redundant once attached and can be dropped afterwards.`,
      };
    }

    return null;
  },
};

/** True if the migration adds a CHECK constraint to `tableName` before the ATTACH. */
function hasCheckConstraintOn(tableName: string, ctx: RuleContext): boolean {
  return ctx.allStatements.slice(0, ctx.statementIndex).some(({ stmt }) => {
    if ('AlterTableStmt' in stmt) {
      const alter = stmt.AlterTableStmt as {
        relation?: { relname?: string };
        cmds?: Array<{ AlterTableCmd?: { subtype?: string; def?: { Constraint?: { contype?: string } } } }>;
      };
      if (alter.relation?.relname !== tableName) return false;
      return (alter.cmds ?? []).some(
        c =>
          c.AlterTableCmd?.subtype === 'AT_AddConstraint' &&
          c.AlterTableCmd.def?.Constraint?.contype === 'CONSTR_CHECK',
      );
    }

    if ('CreateStmt' in stmt) {
      const create = stmt.CreateStmt as {
        relation?: { relname?: string };
        tableElts?: Array<{
          Constraint?: { contype?: string };
          ColumnDef?: { constraints?: Array<{ Constraint?: { contype?: string } }> };
        }>;
      };
      if (create.relation?.relname !== tableName) return false;
      return (create.tableElts ?? []).some(
        elt =>
          elt.Constraint?.contype === 'CONSTR_CHECK' ||
          (elt.ColumnDef?.constraints ?? []).some(c => c.Constraint?.contype === 'CONSTR_CHECK'),
      );
    }

    return false;
  });
}
