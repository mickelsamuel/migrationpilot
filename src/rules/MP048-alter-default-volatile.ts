import type { Rule, RuleContext, RuleViolation } from './engine.js';
import { findFunction } from './helpers.js';

const AT_ColumnDefault = 'AT_ColumnDefault';

/**
 * Defaults that produce a fresh value per row rather than a fixed one. The set
 * spans both PostgreSQL volatility classes on purpose: `now()` is STABLE, but
 * the confusion this rule is about — "I set the default, so the old rows are
 * filled in" — is identical either way.
 *
 * Membership is decided by walking the parsed default for a `FuncCall` or
 * `SQLValueFunction`, never by searching the serialised node for a substring.
 * That search reported `SET DEFAULT 'nowhere'` as a volatile default, because
 * the literal contains `now`.
 */
const GENERATED_DEFAULT_FUNCTIONS = new Set([
  'now', 'random', 'gen_random_uuid', 'uuid_generate_v4',
  'clock_timestamp', 'statement_timestamp', 'timeofday',
  'txid_current', 'nextval',
  // Spelled as SQL keywords rather than calls, and parsed as SQLValueFunction
  // rather than FuncCall. CURRENT_TIMESTAMP is now() under another name, so
  // flagging one and not the other would only depend on how it was typed.
  'current_timestamp', 'current_date', 'current_time',
  'localtimestamp', 'localtime',
]);

export const banAlterDefaultVolatile: Rule = {
  id: 'MP048',
  name: 'ban-alter-default-volatile-existing',
  severity: 'warning',
  description: 'Setting a volatile default (now(), random(), gen_random_uuid()) on an existing column has no effect on existing rows, which may cause confusion.',
  whyItMatters: 'ALTER TABLE ALTER COLUMN SET DEFAULT only affects future INSERTs. Existing rows are NOT updated. Setting a volatile function like now() or gen_random_uuid() as default may give the false impression that existing NULLs will be filled. You likely need a backfill UPDATE as well.',
  docsUrl: 'https://migrationpilot.dev/rules/mp048',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (!('AlterTableStmt' in stmt)) return null;

    const alter = stmt.AlterTableStmt as {
      relation?: { relname?: string };
      cmds?: Array<{ AlterTableCmd: { subtype: string; name?: string; def?: Record<string, unknown> } }>;
    };

    if (!alter.cmds) return null;

    for (const cmd of alter.cmds) {
      if (cmd.AlterTableCmd.subtype !== AT_ColumnDefault) continue;

      // DROP DEFAULT is the same subtype with no def at all.
      const def = cmd.AlterTableCmd.def;
      if (!def) continue;
      if (!findFunction(def, GENERATED_DEFAULT_FUNCTIONS)) continue;

      const tableName = alter.relation?.relname ?? 'unknown';
      const colName = cmd.AlterTableCmd.name ?? 'unknown';

      return {
        ruleId: 'MP048',
        ruleName: 'ban-alter-default-volatile-existing',
        severity: 'warning',
        message: `Setting volatile default on "${tableName}"."${colName}" only affects future INSERTs. Existing rows will NOT be updated. You may need a backfill UPDATE.`,
        line: ctx.line,
        safeAlternative: `-- SET DEFAULT only affects new rows. To backfill existing rows:
-- 1. ALTER TABLE ${tableName} ALTER COLUMN ${colName} SET DEFAULT <volatile_fn>;
-- 2. UPDATE ${tableName} SET ${colName} = DEFAULT WHERE ${colName} IS NULL;
-- (Run the UPDATE in batches for large tables)`,
      };
    }

    return null;
  },
};
