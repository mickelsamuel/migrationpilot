import type { Rule } from './engine.js';

/**
 * MP065: ban-lock-table
 *
 * LOCK TABLE in migration files acquires explicit locks that block other queries.
 * LOCK TABLE IN ACCESS EXCLUSIVE MODE is the most dangerous — it blocks all
 * operations including reads. Even weaker modes can cause deadlocks.
 *
 * In most cases, PostgreSQL automatically acquires the appropriate lock for DDL
 * statements. Explicit LOCK TABLE is almost never needed and often indicates
 * a migration anti-pattern.
 */

const LOCK_MODE_NAMES: Record<number, string> = {
  1: 'ACCESS SHARE',
  2: 'ROW SHARE',
  3: 'ROW EXCLUSIVE',
  4: 'SHARE UPDATE EXCLUSIVE',
  5: 'SHARE',
  6: 'SHARE ROW EXCLUSIVE',
  7: 'EXCLUSIVE',
  8: 'ACCESS EXCLUSIVE',
};

export const banLockTable: Rule = {
  id: 'MP065',
  name: 'ban-lock-table',
  severity: 'critical',
  description: 'Explicit LOCK TABLE in migrations blocks queries and can cause deadlocks.',
  whyItMatters:
    'LOCK TABLE acquires an explicit lock that can block reads and writes. ' +
    'PostgreSQL DDL statements automatically acquire the correct lock — explicit ' +
    'LOCK TABLE is rarely needed and often indicates a flawed migration strategy. ' +
    'High lock modes (EXCLUSIVE, ACCESS EXCLUSIVE) block all other operations.',
  docsUrl: 'https://migrationpilot.dev/rules/mp065',
  check(stmt) {
    const lockStmt = stmt.LockStmt as {
      relations?: Array<{
        RangeVar?: { relname?: string };
      }>;
      mode?: number;
    } | undefined;

    if (!lockStmt?.relations) return null;

    const tables = lockStmt.relations
      .map(r => r.RangeVar?.relname)
      .filter(Boolean)
      .join(', ');

    const mode = lockStmt.mode !== undefined ? (LOCK_MODE_NAMES[lockStmt.mode] ?? `mode ${lockStmt.mode}`) : 'ACCESS EXCLUSIVE';

    return {
      ruleId: 'MP065',
      ruleName: 'ban-lock-table',
      severity: 'critical',
      message: `Explicit LOCK TABLE on ${tables || 'table'} in ${mode} mode. PostgreSQL DDL acquires locks automatically — remove the explicit lock or restructure the migration.`,
      line: 1,
      statement: '',
    };
  },
};
