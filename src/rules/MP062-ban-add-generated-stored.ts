import type { Rule } from './engine.js';

/**
 * MP062: ban-add-generated-stored-column
 *
 * ALTER TABLE ... ADD COLUMN ... GENERATED ALWAYS AS (...) STORED
 * causes a full table rewrite under ACCESS EXCLUSIVE lock.
 *
 * On large tables this means significant downtime. Use a regular
 * column + trigger-based computation, or a virtual (non-stored)
 * generated column (PG 17+) instead.
 */

export const banAddGeneratedStored: Rule = {
  id: 'MP062',
  name: 'ban-add-generated-stored-column',
  severity: 'critical',
  description: 'Adding a stored generated column causes a full table rewrite under ACCESS EXCLUSIVE lock.',
  whyItMatters:
    'ALTER TABLE ADD COLUMN with GENERATED ALWAYS AS ... STORED rewrites every row ' +
    'to compute and store the expression. On tables with millions of rows, this holds an ' +
    'ACCESS EXCLUSIVE lock for the entire rewrite — blocking all reads and writes.',
  docsUrl: 'https://migrationpilot.dev/rules/mp062',
  check(stmt) {
    const alter = stmt.AlterTableStmt as {
      relation?: { relname?: string };
      cmds?: Array<{
        AlterTableCmd?: {
          subtype?: string;
          def?: {
            ColumnDef?: {
              colname?: string;
              constraints?: Array<{
                Constraint?: { contype?: string };
              }>;
            };
          };
        };
      }>;
    } | undefined;

    if (!alter?.cmds || !alter.relation?.relname) return null;

    for (const cmdWrapper of alter.cmds) {
      const cmd = cmdWrapper.AlterTableCmd;
      if (!cmd || cmd.subtype !== 'AT_AddColumn') continue;

      const colDef = cmd.def?.ColumnDef;
      if (!colDef?.colname) continue;

      const hasStoredGenerated = colDef.constraints?.some(
        c => c.Constraint?.contype === 'CONSTR_GENERATED',
      );

      if (hasStoredGenerated) {
        return {
          ruleId: 'MP062',
          ruleName: 'ban-add-generated-stored-column',
          severity: 'critical',
          message: `Adding stored generated column "${colDef.colname}" to "${alter.relation.relname}" causes a full table rewrite. Use a regular column with a trigger, or a virtual generated column (PG 17+).`,
          line: 1,
          statement: '',
        };
      }
    }

    return null;
  },
};
