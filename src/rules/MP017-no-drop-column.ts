/**
 * MP017: no-drop-column
 *
 * Dropping a column takes an ACCESS EXCLUSIVE lock for the duration of the
 * catalog update. On PG < 11 it can trigger a full table rewrite if the column
 * has a non-null default. Even on PG 11+, running application code may still
 * reference the column, causing errors.
 *
 * Safe alternative: Remove all application code references first, then drop
 * the column in a separate deployment with a short lock_timeout.
 */

import type { Rule, RuleContext, RuleViolation } from './engine.js';

export const noDropColumn: Rule = {
  id: 'MP017',
  name: 'no-drop-column',
  severity: 'warning',
  description: 'DROP COLUMN takes ACCESS EXCLUSIVE lock and may break running application code.',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (!('AlterTableStmt' in stmt)) return null;

    const alter = stmt.AlterTableStmt as {
      relation?: { relname?: string };
      cmds?: Array<{
        AlterTableCmd?: {
          subtype?: string;
          name?: string;
        };
      }>;
    };

    if (!alter.cmds) return null;

    const tableName = alter.relation?.relname || 'unknown';

    for (const cmd of alter.cmds) {
      const atCmd = cmd.AlterTableCmd;
      if (!atCmd || atCmd.subtype !== 'AT_DropColumn') continue;

      const columnName = atCmd.name || 'unknown';

      return {
        ruleId: 'MP017',
        ruleName: 'no-drop-column',
        severity: 'warning',
        message: `DROP COLUMN "${columnName}" on "${tableName}" takes ACCESS EXCLUSIVE lock. Running application code referencing this column will break immediately.`,
        line: ctx.line,
        safeAlternative: `-- Safe multi-deploy approach:
-- Deploy 1: Remove all application code references to "${columnName}"
-- Deploy 2: Drop the column with a short lock timeout
SET lock_timeout = '5s';
ALTER TABLE ${tableName} DROP COLUMN ${columnName};
RESET lock_timeout;`,
      };
    }

    return null;
  },
};
