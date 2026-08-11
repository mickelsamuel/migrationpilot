/**
 * MP111: warn-timescale-columnstore-ddl
 *
 * An ALTER form that TimescaleDB refuses on a hypertable with compression /
 * columnstore enabled. These do not run slowly — they error out, so the
 * migration fails partway through unless the columnstore is unwound first.
 *
 * Production-context rule: silent without --database-url. Whether compression is
 * enabled is only knowable from the TimescaleDB catalog.
 */

import type { Rule, RuleContext, RuleViolation } from './engine.js';

/** ALTER subcommands TimescaleDB rejects on a columnstore-enabled hypertable. */
const BLOCKED_SUBTYPES = new Map<string, string>([
  ['AT_AlterColumnType', 'ALTER COLUMN ... TYPE'],
  ['AT_SetStorage', 'ALTER COLUMN ... SET STORAGE'],
  ['AT_EnableRowSecurity', 'ENABLE ROW LEVEL SECURITY'],
  ['AT_DisableRowSecurity', 'DISABLE ROW LEVEL SECURITY'],
  ['AT_ForceRowSecurity', 'FORCE ROW LEVEL SECURITY'],
  ['AT_NoForceRowSecurity', 'NO FORCE ROW LEVEL SECURITY'],
]);

export const warnTimescaleColumnstoreDdl: Rule = {
  id: 'MP111',
  name: 'warn-timescale-columnstore-ddl',
  severity: 'critical',
  description: 'TimescaleDB rejects this ALTER on a hypertable that has compression / columnstore enabled.',
  whyItMatters:
    'TimescaleDB blocks several ALTER forms on a hypertable whose chunks are in the columnstore, and ' +
    'answers with "operation not supported on hypertables that have columnstore enabled". This is not ' +
    'a slow path — the statement fails. Getting it through means stopping the columnstore policy, ' +
    'converting the chunks back to rowstore, disabling the columnstore, applying the change, then ' +
    'putting all of it back: a long, data-moving procedure that does not belong in the middle of an ' +
    'ordinary migration run.',
  docsUrl: 'https://migrationpilot.dev/rules/mp111',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    // Only fires with production context — compression state comes from the catalog
    if (!ctx.tableExtensions?.isHypertable) return null;
    if (ctx.tableExtensions.compressionEnabled !== true) return null;
    if (!('AlterTableStmt' in stmt)) return null;

    const alter = stmt.AlterTableStmt as {
      relation?: { relname?: string };
      cmds?: Array<{ AlterTableCmd?: { subtype?: string; name?: string } }>;
    };

    let blockedLabel: string | undefined;
    let column: string | undefined;
    for (const cmd of alter.cmds ?? []) {
      const label = cmd.AlterTableCmd?.subtype
        ? BLOCKED_SUBTYPES.get(cmd.AlterTableCmd.subtype)
        : undefined;
      if (label) {
        blockedLabel = label;
        column = cmd.AlterTableCmd?.name;
        break;
      }
    }
    if (!blockedLabel) return null;

    const tableName = alter.relation?.relname ?? ctx.tableExtensions.tableName;
    const target = column ? ` on "${column}"` : '';

    return {
      ruleId: 'MP111',
      ruleName: 'warn-timescale-columnstore-ddl',
      severity: 'critical',
      message: `${blockedLabel}${target} against "${tableName}", a hypertable with the columnstore enabled. TimescaleDB rejects this with "operation not supported on hypertables that have columnstore enabled" — the migration will fail here, not run slowly.`,
      line: ctx.line,
      safeAlternative: `-- Confirm the columnstore state first:
SELECT hypertable_name, compression_enabled, num_chunks
FROM timescaledb_information.hypertables
WHERE hypertable_name = '${tableName}';

-- Getting this change through means unwinding the columnstore and putting it back:
--   1. remove the columnstore policy for ${tableName}
--   2. convert the compressed chunks back to rowstore
--   3. disable the columnstore on the hypertable
--   4. run: ${ctx.originalSql}
--   5. re-enable the columnstore and restore the policy
--
-- Steps 2 and 5 move all of the hypertable's data, so schedule this as its own
-- maintenance operation rather than a step inside a migration run.`,
    };
  },
};
