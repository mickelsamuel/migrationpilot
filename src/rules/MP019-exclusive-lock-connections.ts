/**
 * MP019: no-exclusive-lock-high-connections
 *
 * Taking an ACCESS EXCLUSIVE lock when the table has many active connections
 * means those connections will queue up waiting, causing cascading timeouts
 * across the application. This is a production-context rule (paid tier).
 *
 * Safe alternative: Run during low-traffic windows, set a short lock_timeout,
 * and retry with exponential backoff.
 */

import type { Rule, RuleContext, RuleViolation } from './engine.js';

const HIGH_CONNECTIONS_THRESHOLD = 20;

export const noExclusiveLockHighConnections: Rule = {
  id: 'MP019',
  name: 'no-exclusive-lock-high-connections',
  severity: 'warning',
  description: 'ACCESS EXCLUSIVE lock on a table with many active connections causes cascading timeouts.',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    // Only fire when production context is available (paid tier)
    if (ctx.activeConnections === undefined) return null;
    if (ctx.activeConnections < HIGH_CONNECTIONS_THRESHOLD) return null;

    // Only check statements that acquire ACCESS EXCLUSIVE
    if (ctx.lock.lockType !== 'ACCESS EXCLUSIVE') return null;

    // Skip CREATE TABLE — new tables don't have existing connections
    if ('CreateStmt' in stmt) return null;

    const tableName = getTableName(stmt);

    return {
      ruleId: 'MP019',
      ruleName: 'no-exclusive-lock-high-connections',
      severity: 'warning',
      message: `ACCESS EXCLUSIVE lock on "${tableName}" while ${ctx.activeConnections} active connections exist. All ${ctx.activeConnections} connections will queue, causing cascading timeouts.`,
      line: ctx.line,
      safeAlternative: `-- Run during a low-traffic window and use a short lock_timeout:
SET lock_timeout = '3s';
${ctx.originalSql}
RESET lock_timeout;

-- If lock acquisition fails, retry with exponential backoff.
-- Consider: is there a non-locking alternative? (e.g., CONCURRENTLY for indexes)`,
    };
  },
};

function getTableName(stmt: Record<string, unknown>): string {
  if ('AlterTableStmt' in stmt) {
    const alter = stmt.AlterTableStmt as { relation?: { relname?: string } };
    return alter.relation?.relname || 'unknown';
  }
  if ('IndexStmt' in stmt) {
    const idx = stmt.IndexStmt as { relation?: { relname?: string } };
    return idx.relation?.relname || 'unknown';
  }
  if ('DropStmt' in stmt) {
    return 'unknown';
  }
  if ('RenameStmt' in stmt) {
    const rename = stmt.RenameStmt as { relation?: { relname?: string } };
    return rename.relation?.relname || 'unknown';
  }
  return 'unknown';
}
