import type { Rule, RuleContext, RuleViolation } from './engine.js';

const HIGH_TRAFFIC_THRESHOLD = 10_000; // calls per stat window

export const highTrafficTableDDL: Rule = {
  id: 'MP013',
  name: 'high-traffic-table-ddl',
  severity: 'warning',
  description: 'DDL on a table with high query traffic. Lock acquisition may be slow and cause cascading timeouts.',
  whyItMatters: 'Running DDL on tables with high query volume amplifies the blast radius. Even brief locks cause significant query queuing when thousands of queries per second hit the table, leading to cascading timeouts across dependent services.',
  docsUrl: 'https://migrationpilot.dev/rules/mp013',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    // Only fire when production context is available (paid tier)
    if (!ctx.affectedQueries || ctx.affectedQueries.length === 0) return null;

    // Only check DDL statements that acquire significant locks
    if (!isDDL(stmt)) return null;
    if (ctx.lock.lockType === 'ACCESS SHARE') return null;

    const totalCalls = ctx.affectedQueries.reduce((sum, q) => sum + q.calls, 0);
    if (totalCalls < HIGH_TRAFFIC_THRESHOLD) return null;

    const topQuery = ctx.affectedQueries[0];
    if (!topQuery) return null;
    const services = [...new Set(ctx.affectedQueries.map(q => q.serviceName).filter(Boolean))];

    return {
      ruleId: 'MP013',
      ruleName: 'high-traffic-table-ddl',
      severity: 'warning',
      message: `DDL acquires ${ctx.lock.lockType} lock on a table with ${totalCalls.toLocaleString()} queries${services.length > 0 ? ` from ${services.join(', ')}` : ''}. Top query: "${topQuery.normalizedQuery.slice(0, 60)}..." (${topQuery.calls.toLocaleString()} calls, ${topQuery.meanExecTime.toFixed(1)}ms avg).`,
      line: ctx.line,
      safeAlternative: `-- Set a short lock_timeout to fail fast instead of blocking queries:
SET lock_timeout = '3s';
${ctx.originalSql}
RESET lock_timeout;

-- Consider running during low-traffic hours.
-- If lock acquisition fails, retry with exponential backoff.`,
    };
  },
};

function isDDL(stmt: Record<string, unknown>): boolean {
  const ddlKeys = [
    'AlterTableStmt', 'IndexStmt', 'CreateStmt', 'DropStmt',
    'RenameStmt', 'VacuumStmt', 'ClusterStmt', 'ReindexStmt',
  ];
  return ddlKeys.some(key => key in stmt);
}
