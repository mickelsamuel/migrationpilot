import type { Rule, RuleContext, RuleViolation } from './engine.js';

const AT_AddColumn = 'AT_AddColumn';

const VOLATILE_FUNCTIONS = [
  'now', 'random', 'nextval', 'clock_timestamp',
  'statement_timestamp', 'timeofday', 'txid_current',
  'gen_random_uuid', 'uuid_generate_v4', 'uuid_generate_v1',
];

export const volatileDefaultRewrite: Rule = {
  id: 'MP003',
  name: 'volatile-default-table-rewrite',
  severity: 'critical',
  description: 'ADD COLUMN with a volatile DEFAULT (e.g., now(), random()) causes a full table rewrite on PG < 11, and still evaluates per-row on PG 11+.',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (!('AlterTableStmt' in stmt)) return null;

    const alter = stmt.AlterTableStmt as {
      relation?: { relname?: string };
      cmds?: Array<{ AlterTableCmd: { subtype: string; def?: Record<string, unknown> } }>;
    };

    if (!alter.cmds) return null;

    for (const cmd of alter.cmds) {
      if (cmd.AlterTableCmd.subtype !== AT_AddColumn) continue;
      if (!cmd.AlterTableCmd.def) continue;

      const defJson = JSON.stringify(cmd.AlterTableCmd.def).toLowerCase();
      const hasDefault = defJson.includes('constr_default');

      if (!hasDefault) continue;

      const volatileMatch = VOLATILE_FUNCTIONS.find(fn => defJson.includes(fn));
      if (!volatileMatch) continue;

      const tableName = alter.relation?.relname ?? 'unknown';

      if (ctx.pgVersion < 11) {
        return {
          ruleId: 'MP003',
          ruleName: 'volatile-default-table-rewrite',
          severity: 'critical',
          message: `ADD COLUMN with volatile default "${volatileMatch}()" on "${tableName}" causes a full table rewrite on PostgreSQL ${ctx.pgVersion}. This locks the table under ACCESS EXCLUSIVE for the entire rewrite duration.`,
          line: ctx.line,
          safeAlternative: `-- Add column without default, then backfill in batches:
ALTER TABLE ${tableName} ADD COLUMN new_column <type>;
-- Backfill in batches of 10,000:
UPDATE ${tableName} SET new_column = ${volatileMatch}() WHERE id IN (SELECT id FROM ${tableName} WHERE new_column IS NULL LIMIT 10000);`,
        };
      }

      // PG 11+ — volatile defaults still evaluate per-row but don't rewrite
      return {
        ruleId: 'MP003',
        ruleName: 'volatile-default-table-rewrite',
        severity: 'warning',
        message: `ADD COLUMN with volatile default "${volatileMatch}()" on "${tableName}". On PG ${ctx.pgVersion}, this evaluates per-row at read time (no rewrite), but may cause unexpected behavior for existing rows.`,
        line: ctx.line,
      };
    }

    return null;
  },
};
