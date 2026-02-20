import type { Rule } from './engine.js';

/**
 * MP064: ban-disable-trigger
 *
 * ALTER TABLE ... DISABLE TRIGGER ALL/USER disables all triggers on the table.
 * This is extremely dangerous in production:
 * - Breaks logical replication (which relies on triggers)
 * - Bypasses audit triggers
 * - Skips foreign key enforcement
 * - If the session crashes, triggers remain disabled
 */

export const banDisableTrigger: Rule = {
  id: 'MP064',
  name: 'ban-disable-trigger',
  severity: 'critical',
  description: 'DISABLE TRIGGER breaks replication, audit logs, and FK enforcement.',
  whyItMatters:
    'ALTER TABLE DISABLE TRIGGER ALL/USER turns off all triggers on the table. ' +
    'This breaks logical replication (which uses triggers internally), disables audit ' +
    'logging triggers, and bypasses foreign key enforcement. If the session crashes ' +
    'before re-enabling triggers, they remain disabled permanently.',
  docsUrl: 'https://migrationpilot.dev/rules/mp064',
  check(stmt) {
    const alter = stmt.AlterTableStmt as {
      relation?: { relname?: string };
      cmds?: Array<{
        AlterTableCmd?: {
          subtype?: string;
        };
      }>;
    } | undefined;

    if (!alter?.cmds || !alter.relation?.relname) return null;

    for (const cmdWrapper of alter.cmds) {
      const cmd = cmdWrapper.AlterTableCmd;
      if (!cmd) continue;

      if (cmd.subtype === 'AT_DisableTrigAll' || cmd.subtype === 'AT_DisableTrigUser') {
        const scope = cmd.subtype === 'AT_DisableTrigAll' ? 'ALL' : 'USER';
        return {
          ruleId: 'MP064',
          ruleName: 'ban-disable-trigger',
          severity: 'critical',
          message: `DISABLE TRIGGER ${scope} on "${alter.relation.relname}" breaks replication, audit logs, and FK enforcement. Use targeted trigger disabling or restructure the migration.`,
          line: 1,
          statement: '',
        };
      }
    }

    return null;
  },
};
