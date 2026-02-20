import type { Rule, RuleContext, RuleViolation } from './engine.js';

/**
 * MP072: warn-partition-default-scan
 *
 * ALTER TABLE ... ATTACH PARTITION triggers a scan of the DEFAULT partition
 * to verify that no rows in the default partition overlap with the new
 * partition's boundary. This scan holds an ACCESS EXCLUSIVE lock on the
 * default partition for its entire duration.
 *
 * On large default partitions, this can be very slow and block all queries.
 */

export const warnPartitionDefaultScan: Rule = {
  id: 'MP072',
  name: 'warn-partition-default-scan',
  severity: 'warning',
  description: 'ATTACH PARTITION scans the DEFAULT partition under ACCESS EXCLUSIVE lock to check for overlapping rows.',
  whyItMatters:
    'When attaching a new partition, PostgreSQL must verify that no rows in the DEFAULT partition ' +
    'belong to the new partition range. This requires scanning the entire DEFAULT partition while ' +
    'holding an ACCESS EXCLUSIVE lock on it. If the default partition is large, this scan blocks ' +
    'all reads and writes for its entire duration.',
  docsUrl: 'https://migrationpilot.dev/rules/mp072',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (!('AlterTableStmt' in stmt)) return null;

    const alter = stmt.AlterTableStmt as {
      relation?: { relname?: string };
      cmds?: Array<{
        AlterTableCmd?: {
          subtype?: string;
          def?: {
            PartitionCmd?: {
              name?: { relname?: string };
              bound?: Record<string, unknown>;
            };
          };
        };
      }>;
    };

    if (!alter.cmds) return null;
    const parentTable = alter.relation?.relname ?? 'unknown';

    for (const cmdWrapper of alter.cmds) {
      const cmd = cmdWrapper.AlterTableCmd;
      if (!cmd || cmd.subtype !== 'AT_AttachPartition') continue;

      const partName = cmd.def?.PartitionCmd?.name?.relname ?? 'unknown';

      return {
        ruleId: 'MP072',
        ruleName: 'warn-partition-default-scan',
        severity: 'warning',
        message: `ATTACH PARTITION "${partName}" to "${parentTable}" scans the DEFAULT partition under ACCESS EXCLUSIVE lock. Ensure the default partition is small or empty.`,
        line: ctx.line,
        safeAlternative: `-- Before attaching, move rows from default partition to avoid a long scan:
-- 1. Create the new partition detached first
-- 2. Move matching rows from DEFAULT to new partition
-- 3. Then attach:
SET lock_timeout = '5s';
ALTER TABLE ${parentTable} ATTACH PARTITION ${partName} FOR VALUES ...;
RESET lock_timeout;`,
      };
    }

    return null;
  },
};
