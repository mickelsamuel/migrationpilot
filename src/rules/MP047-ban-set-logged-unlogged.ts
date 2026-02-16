import type { Rule, RuleContext, RuleViolation } from './engine.js';

const AT_SetLogged = 'AT_SetLogged';
const AT_SetUnLogged = 'AT_SetUnLogged';

export const banSetLoggedUnlogged: Rule = {
  id: 'MP047',
  name: 'ban-set-logged-unlogged',
  severity: 'critical',
  description: 'SET LOGGED/UNLOGGED rewrites the entire table under ACCESS EXCLUSIVE lock. This blocks all reads and writes for the duration.',
  whyItMatters: 'Changing a table between LOGGED and UNLOGGED requires a full table rewrite while holding ACCESS EXCLUSIVE lock. On large tables this can take hours, blocking all queries. UNLOGGED tables also do not survive crash recovery — all data is lost on restart.',
  docsUrl: 'https://migrationpilot.dev/rules/mp047',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (!('AlterTableStmt' in stmt)) return null;

    const alter = stmt.AlterTableStmt as {
      relation?: { relname?: string };
      cmds?: Array<{ AlterTableCmd: { subtype: string } }>;
    };

    if (!alter.cmds) return null;

    for (const cmd of alter.cmds) {
      const subtype = cmd.AlterTableCmd.subtype;
      if (subtype !== AT_SetLogged && subtype !== AT_SetUnLogged) continue;

      const tableName = alter.relation?.relname ?? 'unknown';
      const direction = subtype === AT_SetLogged ? 'LOGGED' : 'UNLOGGED';

      return {
        ruleId: 'MP047',
        ruleName: 'ban-set-logged-unlogged',
        severity: 'critical',
        message: `SET ${direction} on "${tableName}" rewrites the entire table under ACCESS EXCLUSIVE lock. This blocks all reads and writes for the full duration.${direction === 'UNLOGGED' ? ' UNLOGGED tables lose all data on crash.' : ''}`,
        line: ctx.line,
        safeAlternative: `-- Changing LOGGED/UNLOGGED requires a full table rewrite.
-- Consider performing this during a maintenance window.
-- For LOGGED→UNLOGGED: ensure you have backups, data will be lost on crash.
-- For UNLOGGED→LOGGED: consider creating a new LOGGED table and migrating data.`,
      };
    }

    return null;
  },
};
