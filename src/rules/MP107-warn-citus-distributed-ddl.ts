/**
 * MP107: warn-citus-distributed-ddl
 *
 * ALTER TABLE on a Citus distributed table. Citus propagates the statement to
 * every shard on every worker, so one line in the migration becomes a lock on
 * the coordinator plus a lock per shard across the cluster.
 *
 * Production-context rule: silent without --database-url. Whether a table is
 * distributed is only knowable from the Citus catalog.
 */

import type { Rule, RuleContext, RuleViolation } from './engine.js';

/** ALTER subcommands Citus rejects when they touch the distribution column. */
const DISTRIBUTION_COLUMN_BLOCKED = new Set(['AT_AlterColumnType', 'AT_DropColumn']);

export const warnCitusDistributedDdl: Rule = {
  id: 'MP107',
  name: 'warn-citus-distributed-ddl',
  severity: 'warning',
  description: 'ALTER on a Citus distributed table propagates to every shard on every worker node.',
  whyItMatters:
    'A distributed table is a set of shards spread across worker nodes. Citus propagates DDL to all of ' +
    'them, so the ALTER holds a lock on the coordinator while each worker locks its own shards, and it ' +
    'is only done when the slowest worker is done. Anything that blocks on the coordinator blocks the ' +
    'whole cluster for that table. Some forms are refused outright rather than propagated — changing ' +
    'the distribution column is the common one.',
  docsUrl: 'https://migrationpilot.dev/rules/mp107',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    // Only fires with production context — distribution is only in the Citus catalog
    if (!ctx.tableExtensions?.isCitusDistributed) return null;
    if (!('AlterTableStmt' in stmt)) return null;

    const info = ctx.tableExtensions;
    const alter = stmt.AlterTableStmt as {
      relation?: { relname?: string };
      cmds?: Array<{ AlterTableCmd?: { subtype?: string; name?: string } }>;
    };

    const tableName = alter.relation?.relname ?? info.tableName;
    const shards = info.citusShardCount !== undefined
      ? `${info.citusShardCount.toLocaleString()} shard${info.citusShardCount === 1 ? '' : 's'}`
      : 'every shard';
    const distributedBy = info.citusDistributionColumn
      ? `, distributed by "${info.citusDistributionColumn}"`
      : '';

    // Touching the distribution column is rejected, not propagated
    const blocked = (alter.cmds ?? []).find(cmd => {
      const sub = cmd.AlterTableCmd?.subtype;
      const column = cmd.AlterTableCmd?.name;
      return (
        sub !== undefined &&
        DISTRIBUTION_COLUMN_BLOCKED.has(sub) &&
        column !== undefined &&
        info.citusDistributionColumn !== undefined &&
        column.toLowerCase() === info.citusDistributionColumn.toLowerCase()
      );
    });

    const lead = blocked
      ? `This ALTER targets "${info.citusDistributionColumn}", the distribution column of Citus table "${tableName}". Citus refuses ALTER TABLE commands involving the distribution column, so the migration will fail rather than propagate.`
      : `"${tableName}" is a Citus distributed table with ${shards}${distributedBy}. Citus propagates this ALTER to every shard: the coordinator holds a lock on the table while each worker locks its shards, and the statement is not finished until the slowest worker is.`;

    return {
      ruleId: 'MP107',
      ruleName: 'warn-citus-distributed-ddl',
      severity: 'warning',
      message: lead,
      line: ctx.line,
      safeAlternative: `-- See what this statement fans out to:
SELECT table_name, citus_table_type, distribution_column, shard_count
FROM citus_tables WHERE table_name::text LIKE '%${tableName}%';

-- If parallel propagation is deadlocking against other work, serialise it:
BEGIN;
SET LOCAL citus.multi_shard_modify_mode TO 'sequential';
SET LOCAL lock_timeout = '5s';
${ctx.originalSql}
COMMIT;

-- Changing the distribution column is not an ALTER — it means redistributing the
-- table (undistribute_table + create_distributed_table, or alter_distributed_table).`,
    };
  },
};
