import type { Rule } from './engine.js';

/**
 * MP066: warn-autovacuum-disabled
 *
 * CREATE TABLE ... WITH (autovacuum_enabled = false) or
 * ALTER TABLE ... SET (autovacuum_enabled = false) disables autovacuum.
 *
 * Without autovacuum:
 * - Dead tuples accumulate, causing table bloat
 * - Transaction ID wraparound can freeze the database
 * - Index bloat degrades query performance
 *
 * This is occasionally done for bulk load tables but is dangerous for
 * production tables and should be temporary with an explicit re-enable plan.
 */

function checkOptions(options: Array<{ DefElem?: { defname?: string; arg?: { String?: { sval?: string } } } }> | undefined): boolean {
  if (!options) return false;
  return options.some(opt => {
    const elem = opt.DefElem;
    return elem?.defname === 'autovacuum_enabled' &&
      elem?.arg?.String?.sval === 'false';
  });
}

export const warnAutovacuumDisabled: Rule = {
  id: 'MP066',
  name: 'warn-autovacuum-disabled',
  severity: 'warning',
  description: 'Disabling autovacuum causes table bloat and risks transaction ID wraparound.',
  whyItMatters:
    'Autovacuum prevents table bloat by reclaiming dead tuples, and prevents ' +
    'transaction ID wraparound — which can freeze the entire database. Disabling ' +
    'autovacuum is occasionally justified for temporary bulk-load staging tables, ' +
    'but is dangerous for any table that serves production traffic.',
  docsUrl: 'https://migrationpilot.dev/rules/mp066',
  check(stmt) {
    // CREATE TABLE ... WITH (autovacuum_enabled = false)
    const create = stmt.CreateStmt as {
      relation?: { relname?: string };
      options?: Array<{ DefElem?: { defname?: string; arg?: { String?: { sval?: string } } } }>;
    } | undefined;

    if (create?.relation?.relname && checkOptions(create.options)) {
      return {
        ruleId: 'MP066',
        ruleName: 'warn-autovacuum-disabled',
        severity: 'warning',
        message: `Table "${create.relation.relname}" has autovacuum disabled. This causes table bloat and risks transaction ID wraparound. Re-enable autovacuum after bulk loading.`,
        line: 1,
        statement: '',
      };
    }

    // ALTER TABLE ... SET (autovacuum_enabled = false)
    const alter = stmt.AlterTableStmt as {
      relation?: { relname?: string };
      cmds?: Array<{
        AlterTableCmd?: {
          subtype?: string;
          def?: {
            List?: {
              items?: Array<{ DefElem?: { defname?: string; arg?: { String?: { sval?: string } } } }>;
            };
          };
        };
      }>;
    } | undefined;

    if (!alter?.cmds || !alter.relation?.relname) return null;

    for (const cmdWrapper of alter.cmds) {
      const cmd = cmdWrapper.AlterTableCmd;
      if (cmd?.subtype !== 'AT_SetRelOptions') continue;

      const items = cmd.def?.List?.items;
      if (checkOptions(items)) {
        return {
          ruleId: 'MP066',
          ruleName: 'warn-autovacuum-disabled',
          severity: 'warning',
          message: `Autovacuum disabled on "${alter.relation.relname}". This causes table bloat and risks transaction ID wraparound. Re-enable autovacuum after bulk loading.`,
          line: 1,
          statement: '',
        };
      }
    }

    return null;
  },
};
