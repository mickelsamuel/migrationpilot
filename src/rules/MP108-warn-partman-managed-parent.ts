/**
 * MP108: warn-partman-managed-parent
 *
 * Hand-written partition DDL on a parent that pg_partman manages. partman
 * creates, attaches, and drops children itself from what part_config says;
 * partitions made by hand sit outside that bookkeeping and collide with the ones
 * maintenance tries to create.
 *
 * Production-context rule: silent without --database-url. Whether a parent is
 * managed is only knowable from part_config.
 */

import type { Rule, RuleContext, RuleViolation } from './engine.js';
import { lookupTableExtensions } from './catalog-helpers.js';

export const warnPartmanManagedParent: Rule = {
  id: 'MP108',
  name: 'warn-partman-managed-parent',
  severity: 'warning',
  description: 'Manual partition DDL on a parent table managed by pg_partman.',
  whyItMatters:
    'pg_partman decides which children exist from part_config: run_maintenance pre-creates the next ' +
    'few partitions and applies the retention policy. A partition created, attached, or detached by ' +
    'hand is invisible to that bookkeeping, so the next maintenance run can try to create a partition ' +
    'whose range you already covered — which fails — or drop one it believes it owns. The two systems ' +
    'disagree quietly and the failure surfaces later, on a maintenance run nobody was watching.',
  docsUrl: 'https://migrationpilot.dev/rules/mp108',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    const operation = partitionOperation(stmt);
    if (!operation) return null;

    // Only fires with production context — part_config is the only source of truth
    const info = lookupTableExtensions(ctx, operation.parentTable);
    if (!info?.isPartmanParent) return null;

    const config = [
      info.partmanControlColumn ? `control column "${info.partmanControlColumn}"` : null,
      info.partmanInterval ? `interval ${info.partmanInterval}` : null,
      info.partmanPremake !== undefined ? `premake ${info.partmanPremake}` : null,
      info.partmanRetention ? `retention ${info.partmanRetention}` : null,
    ].filter(Boolean).join(', ');

    const configNote = config ? ` (${config})` : '';
    const retentionNote = info.partmanRetention
      ? ` Its retention policy is ${info.partmanRetention}, so partman will drop children on that schedule whether or not this migration made them.`
      : '';

    return {
      ruleId: 'MP108',
      ruleName: 'warn-partman-managed-parent',
      severity: 'warning',
      message: `${operation.label} on "${operation.parentTable}", which pg_partman manages${configNote}. partman creates and removes children from part_config on its own schedule; a partition changed by hand is not recorded there, so the next run_maintenance can collide with it.${retentionNote}`,
      line: ctx.line,
      safeAlternative: `-- Check what partman thinks it owns before changing anything:
SELECT parent_table, control, partition_interval, premake, retention, automatic_maintenance
FROM part_config WHERE parent_table LIKE '%${operation.parentTable}';

-- Let partman make the partitions, by widening how far ahead it pre-creates:
UPDATE part_config SET premake = 8 WHERE parent_table = 'public.${operation.parentTable}';
CALL run_maintenance_proc();

-- To move existing rows into the partition set, use partman's own procedure so
-- it commits in batches instead of one long transaction:
CALL partition_data_proc('public.${operation.parentTable}');

-- If the partition set really should be managed by hand from now on, take it out
-- of partman first: DELETE FROM part_config WHERE parent_table = '...';`,
    };
  },
};

interface PartitionOperation {
  label: string;
  parentTable: string;
}

function partitionOperation(stmt: Record<string, unknown>): PartitionOperation | null {
  if ('CreateStmt' in stmt) {
    const create = stmt.CreateStmt as {
      relation?: { relname?: string };
      partbound?: Record<string, unknown>;
      inhRelations?: Array<{ RangeVar?: { relname?: string } }>;
    };
    if (!create.partbound) return null;
    const parent = create.inhRelations?.[0]?.RangeVar?.relname;
    if (!parent) return null;
    return {
      label: `CREATE TABLE ${create.relation?.relname ?? 'child'} PARTITION OF`,
      parentTable: parent,
    };
  }

  if ('AlterTableStmt' in stmt) {
    const alter = stmt.AlterTableStmt as {
      relation?: { relname?: string };
      cmds?: Array<{ AlterTableCmd?: { subtype?: string } }>;
    };
    const parent = alter.relation?.relname;
    if (!parent) return null;

    for (const cmd of alter.cmds ?? []) {
      const sub = cmd.AlterTableCmd?.subtype;
      if (sub === 'AT_AttachPartition') return { label: 'ATTACH PARTITION', parentTable: parent };
      if (sub === 'AT_DetachPartition') return { label: 'DETACH PARTITION', parentTable: parent };
    }
  }

  return null;
}
