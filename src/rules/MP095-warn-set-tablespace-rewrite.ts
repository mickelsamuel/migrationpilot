import type { Rule, RuleContext, RuleViolation } from './engine.js';

/**
 * MP095: warn-set-tablespace-rewrite
 *
 * SET TABLESPACE physically copies every file belonging to the relation to
 * the new location, holding ACCESS EXCLUSIVE for the entire copy. Duration is
 * a function of table size and disk throughput, and the table is unavailable
 * for reads and writes the whole time.
 *
 * It also needs enough free space to hold both copies at once, since the old
 * files are not removed until the move commits.
 */

export const warnSetTablespaceRewrite: Rule = {
  id: 'MP095',
  name: 'warn-set-tablespace-rewrite',
  severity: 'warning',
  description: 'SET TABLESPACE copies the entire relation to new storage under ACCESS EXCLUSIVE, blocking all access for the duration.',
  whyItMatters:
    'This is a physical file copy, not a catalog update. PostgreSQL holds ACCESS EXCLUSIVE from the ' +
    'first byte to the last, so the table is unavailable for reads and writes for as long as the ' +
    'copy takes — on a 500 GB table over ordinary disks, hours. Both copies exist until the move ' +
    'commits, so the destination needs the full size free and the source cannot be reclaimed early. ' +
    'A migration is the wrong place for it: there is no way to pause, resume, or bound the work, and ' +
    'cancelling midway rolls the whole copy back and leaves you where you started.',
  docsUrl: 'https://migrationpilot.dev/rules/mp095',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (!('AlterTableStmt' in stmt)) return null;

    const alter = stmt.AlterTableStmt as {
      relation?: { relname?: string };
      objtype?: string;
      cmds?: Array<{ AlterTableCmd?: { subtype?: string; name?: string } }>;
    };

    if (!alter.cmds) return null;

    for (const cmdWrapper of alter.cmds) {
      const cmd = cmdWrapper.AlterTableCmd;
      if (!cmd || cmd.subtype !== 'AT_SetTableSpace') continue;

      const objectName = alter.relation?.relname ?? 'unknown';
      const tablespace = cmd.name ?? 'the new tablespace';
      const kind = alter.objtype === 'OBJECT_INDEX' ? 'Index' : 'Table';

      return {
        ruleId: 'MP095',
        ruleName: 'warn-set-tablespace-rewrite',
        severity: 'warning',
        message: `${kind} "${objectName}" is being moved to tablespace "${tablespace}". This copies every file under ACCESS EXCLUSIVE — "${objectName}" is unavailable for reads and writes until the copy finishes, and both copies occupy disk until it commits.`,
        line: ctx.line,
        safeAlternative: `-- Move storage outside the migration, during a planned window, with a
-- bounded lock wait so it fails fast instead of queueing behind traffic:
SET lock_timeout = '5s';
ALTER ${alter.objtype === 'OBJECT_INDEX' ? 'INDEX' : 'TABLE'} ${objectName} SET TABLESPACE ${tablespace};
RESET lock_timeout;

-- For an index, rebuilding on the target tablespace keeps the old one
-- serving queries until the new index is ready:
-- CREATE INDEX CONCURRENTLY ${objectName}_new ON <table> (<columns>) TABLESPACE ${tablespace};
-- DROP INDEX CONCURRENTLY ${objectName};

-- Check free space on the destination before starting — both copies coexist.`,
      };
    }

    return null;
  },
};
