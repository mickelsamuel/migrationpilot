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
