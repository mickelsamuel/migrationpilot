import type { Rule, RuleContext, RuleViolation } from './engine.js';

/**
 * MP090: warn-trigger-on-hot-table
 *
 * CREATE TRIGGER takes a SHARE ROW EXCLUSIVE lock on the table, which does
 * not block reads but does block writes and every concurrent DDL statement
 * for as long as it waits in the lock queue.
 *
 * The lasting cost is the row-level trigger itself: it runs once per affected
 * row, inside the writing transaction, so its function body becomes part of
 * the latency of every INSERT, UPDATE or DELETE on the table from then on.
 *
 * Statement-level triggers (FOR EACH STATEMENT) fire once per statement and
 * are not flagged.
 *
 * Neither is the sync trigger of an expand/contract migration. When a migration
 * adds a column to a table and then puts a row-level trigger on that same table
 * to keep the new column in step with the old one, the trigger *is* the safe
 * pattern — it is what lets old and new code run against the table at the same
 * time, and it is deliberately temporary, dropped by the contract step. Warning
 * about the per-write cost of the thing that avoids the outage is advice
 * pointing the wrong way, and MPH-007 and MPH-015 both prescribe it.
 */

const TRIGGER_EVENT_INSERT = 1 << 2;
const TRIGGER_EVENT_DELETE = 1 << 3;
const TRIGGER_EVENT_UPDATE = 1 << 4;
const TRIGGER_EVENT_TRUNCATE = 1 << 5;

export const warnTriggerOnHotTable: Rule = {
  id: 'MP090',
  name: 'warn-trigger-on-hot-table',
  severity: 'warning',
  description: 'CREATE TRIGGER ... FOR EACH ROW locks out writes to add code that then runs on every row written.',
  whyItMatters:
    'Creating the trigger takes a SHARE ROW EXCLUSIVE lock, so writes queue behind it and, on a ' +
    'busy table, behind whatever long transaction is already holding a conflicting lock. That part ' +
    'is brief. The part that lasts is the trigger body: a row-level trigger executes once per ' +
    'affected row inside the writing transaction, so it is now on the critical path of every write ' +
    'to the table. A function that takes a millisecond turns a 10,000-row UPDATE into an extra ten ' +
    'seconds of held locks, and anything the trigger writes to is now part of that transaction too.',
  docsUrl: 'https://migrationpilot.dev/rules/mp090',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (!('CreateTrigStmt' in stmt)) return null;

    const trigger = stmt.CreateTrigStmt as {
      trigname?: string;
      relation?: { relname?: string };
      funcname?: Array<{ String?: { sval?: string } }>;
      row?: boolean;
      events?: number;
      isconstraint?: boolean;
    };

    // Statement-level triggers fire once per statement, not per row.
    if (trigger.row !== true) return null;

    const triggerName = trigger.trigname ?? 'unnamed trigger';
    const tableName = trigger.relation?.relname ?? 'unknown';
    const funcName = (trigger.funcname ?? [])
      .map(n => n.String?.sval)
      .filter(Boolean)
      .join('.') || 'the trigger function';
    const events = describeEvents(trigger.events);

    if (isExpandContractSyncTrigger(ctx, tableName, trigger)) return null;

    return {
      ruleId: 'MP090',
      ruleName: 'warn-trigger-on-hot-table',
      severity: 'warning',
      message: `CREATE TRIGGER "${triggerName}" on "${tableName}" is FOR EACH ROW${events ? ` on ${events}` : ''}. Creating it takes SHARE ROW EXCLUSIVE (writes block), and ${funcName}() then runs once per affected row inside every writing transaction on "${tableName}".`,
      line: ctx.line,
      safeAlternative: `-- Bound the wait so the trigger creation cannot sit at the head of the
-- write queue behind a long-running transaction:
SET lock_timeout = '5s';
CREATE TRIGGER ${triggerName} ...;
RESET lock_timeout;

-- If the trigger only needs to see the change as a whole, a statement-level
-- trigger with transition tables runs once instead of once per row:
CREATE TRIGGER ${triggerName}
  AFTER UPDATE ON ${tableName}
  REFERENCING NEW TABLE AS changed
  FOR EACH STATEMENT EXECUTE FUNCTION ${funcName}();`,
    };
  },
};

interface TriggerNode {
  funcname?: Array<{ String?: { sval?: string } }>;
  events?: number;
}

/**
 * Is this the sync trigger of an expand/contract migration on the same table?
 *
 * Three things have to line up, and all three are visible in the file:
 *
 * 1. The same migration adds a column to the table the trigger is on. That is
 *    the expand step; without it there is nothing to keep in sync.
 * 2. The trigger fires on writes — INSERT and UPDATE — which is what a sync
 *    trigger has to do. An AFTER DELETE audit trigger is not this pattern.
 * 3. The trigger's own function is defined in this migration and mentions the
 *    added column, or the migration backfills that column afterwards. This is
 *    what separates "keeps the new column in step" from "some trigger that
 *    happens to land in the same file".
 *
 * A trigger on an unrelated table, or one whose function was written elsewhere,
 * matches none of it and is still reported.
 */
function isExpandContractSyncTrigger(
  ctx: RuleContext,
  tableName: string,
  trigger: TriggerNode,
): boolean {
  const events = trigger.events ?? 0;
  const syncsWrites = (events & TRIGGER_EVENT_INSERT) !== 0 && (events & TRIGGER_EVENT_UPDATE) !== 0;
  if (!syncsWrites) return false;

  const addedColumns = columnsAddedTo(ctx, tableName);
  if (addedColumns.length === 0) return false;

  const funcName = (trigger.funcname ?? [])
    .map(n => n.String?.sval)
    .filter((s): s is string => typeof s === 'string')
    .join('.')
    .toLowerCase();

  const body = functionBodyInMigration(ctx, funcName);
  if (body && addedColumns.some(col => body.includes(col))) return true;

  return addedColumns.some(col => backfilled(ctx, tableName, col));
}

/** Columns this migration adds to `tableName` before the current statement. */
function columnsAddedTo(ctx: RuleContext, tableName: string): string[] {
  const columns: string[] = [];

  for (let i = 0; i < ctx.statementIndex; i++) {
    const entry = ctx.allStatements[i];
    if (!entry || !('AlterTableStmt' in entry.stmt)) continue;

    const alter = entry.stmt.AlterTableStmt as {
      relation?: { relname?: string };
      cmds?: Array<{ AlterTableCmd?: { subtype?: string; def?: { ColumnDef?: { colname?: string } } } }>;
    };
    if (alter.relation?.relname !== tableName) continue;

    for (const wrapper of alter.cmds ?? []) {
      const cmd = wrapper.AlterTableCmd;
      if (cmd?.subtype !== 'AT_AddColumn') continue;
      const colname = cmd.def?.ColumnDef?.colname;
      if (colname) columns.push(colname.toLowerCase());
    }
  }

  return columns;
}

/** Text of a function this migration defines, so its body can be read. */
function functionBodyInMigration(ctx: RuleContext, funcName: string): string | null {
  if (!funcName) return null;
  const bare = funcName.split('.').pop() ?? funcName;

  for (const entry of ctx.allStatements) {
    if (!('CreateFunctionStmt' in entry.stmt)) continue;
    const fn = entry.stmt.CreateFunctionStmt as {
      funcname?: Array<{ String?: { sval?: string } }>;
    };
    const defined = (fn.funcname ?? [])
      .map(n => n.String?.sval)
      .filter(Boolean)
      .pop()
      ?.toLowerCase();
    if (defined === bare) return entry.originalSql.toLowerCase();
  }

  return null;
}

/** Does the migration write `column` on `table` after the trigger goes up? */
function backfilled(ctx: RuleContext, table: string, column: string): boolean {
  for (let i = ctx.statementIndex + 1; i < ctx.allStatements.length; i++) {
    const entry = ctx.allStatements[i];
    if (!entry || !('UpdateStmt' in entry.stmt)) continue;
    const update = entry.stmt.UpdateStmt as { relation?: { relname?: string } };
    if (update.relation?.relname !== table) continue;
    if (entry.originalSql.toLowerCase().includes(column)) return true;
  }
  return false;
}

/** Decode the bitmask PostgreSQL uses for trigger events. */
function describeEvents(events: number | undefined): string {
  if (typeof events !== 'number') return '';
  const names: string[] = [];
  if (events & TRIGGER_EVENT_INSERT) names.push('INSERT');
  if (events & TRIGGER_EVENT_DELETE) names.push('DELETE');
  if (events & TRIGGER_EVENT_UPDATE) names.push('UPDATE');
  if (events & TRIGGER_EVENT_TRUNCATE) names.push('TRUNCATE');
  return names.join('/');
}
