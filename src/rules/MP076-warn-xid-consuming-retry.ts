import type { Rule, RuleContext, RuleViolation } from './engine.js';

/**
 * MP076: warn-xid-consuming-retry
 *
 * SAVEPOINT creates a subtransaction that consumes a separate XID.
 * In migration files with retry loops using SAVEPOINT/ROLLBACK TO,
 * each retry consumes another XID. On high-throughput systems, this
 * can accelerate XID wraparound risk.
 *
 * SAVEPOINT is also expensive: each one allocates a new snapshot and
 * adds overhead to the transaction state machine.
 */

export const warnXidConsumingRetry: Rule = {
  id: 'MP076',
  name: 'warn-xid-consuming-retry',
  severity: 'warning',
  description: 'SAVEPOINT creates subtransactions that consume XIDs and accelerate wraparound risk.',
  whyItMatters:
    'Each SAVEPOINT allocates a new transaction ID (XID). In retry loops, every SAVEPOINT/ROLLBACK TO ' +
    'consumes another XID without the previous one being freed. On systems processing millions of ' +
    'transactions, subtransaction XID consumption can push the database toward XID wraparound — which ' +
    'forces a complete database freeze for maintenance. PostgreSQL 14+ improved subtransaction handling, ' +
    'but the XID cost remains.',
  docsUrl: 'https://migrationpilot.dev/rules/mp076',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    // Detect SAVEPOINT statements
    const txn = stmt.TransactionStmt as {
      kind?: string | number;
      savepoint_name?: string;
    } | undefined;

    if (!txn) return null;

    // libpg-query returns kind as string 'TRANS_STMT_SAVEPOINT'
    if (txn.kind !== 'TRANS_STMT_SAVEPOINT' && txn.kind !== 3) return null;

    const name = txn.savepoint_name ?? 'unnamed';

    return {
      ruleId: 'MP076',
      ruleName: 'warn-xid-consuming-retry',
      severity: 'warning',
      message: `SAVEPOINT "${name}" creates a subtransaction that consumes a separate XID. In retry loops, this accelerates XID wraparound risk.`,
      line: ctx.line,
      safeAlternative: `-- Consider restructuring to avoid subtransactions:
-- 1. Use separate transactions instead of SAVEPOINT/ROLLBACK TO
-- 2. Use advisory locks for coordination instead of subtransactions
-- 3. If retries are needed, retry the entire transaction, not a subtransaction`,
    };
  },
};
