import type { Rule, RuleContext, RuleViolation } from './engine.js';

const AT_DetachPartition = 'AT_DetachPartition';

export const requireConcurrentDetachPartition: Rule = {
  id: 'MP046',
  name: 'require-concurrent-detach-partition',
  severity: 'critical',
  description: 'DETACH PARTITION without CONCURRENTLY takes ACCESS EXCLUSIVE lock on the parent, blocking all queries. Use CONCURRENTLY on PG 14+.',
  whyItMatters: 'DETACH PARTITION without CONCURRENTLY takes an ACCESS EXCLUSIVE lock on the parent table, blocking all reads and writes until the operation completes. DETACH PARTITION CONCURRENTLY (PG 14+) uses a two-phase approach that only briefly locks the parent.',
  docsUrl: 'https://migrationpilot.dev/rules/mp046',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    // DETACH CONCURRENTLY only available on PG 14+
    if (ctx.pgVersion < 14) return null;

    if (!('AlterTableStmt' in stmt)) return null;

    const alter = stmt.AlterTableStmt as {
      relation?: { relname?: string };
      cmds?: Array<{ AlterTableCmd: { subtype: string; name?: string; def?: Record<string, unknown> } }>;
    };

    if (!alter.cmds) return null;

    for (const cmd of alter.cmds) {
      if (cmd.AlterTableCmd.subtype !== AT_DetachPartition) continue;

      // Check if CONCURRENTLY is specified
      const partCmd = cmd.AlterTableCmd.def?.PartitionCmd as {
        concurrent?: boolean;
        name?: { relname?: string };
      } | undefined;

      if (partCmd?.concurrent) continue;

      const parentTable = alter.relation?.relname ?? 'unknown';
      const partName = partCmd?.name?.relname ?? cmd.AlterTableCmd.name ?? 'unknown';

      return {
        ruleId: 'MP046',
        ruleName: 'require-concurrent-detach-partition',
        severity: 'critical',
        message: `DETACH PARTITION "${partName}" from "${parentTable}" without CONCURRENTLY takes ACCESS EXCLUSIVE lock on the parent, blocking all queries.`,
        line: ctx.line,
        safeAlternative: `-- Use CONCURRENTLY to avoid blocking (PG 14+):
ALTER TABLE ${parentTable} DETACH PARTITION ${partName} CONCURRENTLY;`,
      };
    }

    return null;
  },
};
