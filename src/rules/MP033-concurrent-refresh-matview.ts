import type { Rule, RuleContext, RuleViolation } from './engine.js';

export const requireConcurrentRefreshMatview: Rule = {
  id: 'MP033',
  name: 'require-concurrent-refresh-matview',
  severity: 'warning',
  description: 'REFRESH MATERIALIZED VIEW without CONCURRENTLY takes ACCESS EXCLUSIVE lock, blocking all reads. Use CONCURRENTLY to allow reads during refresh.',
  whyItMatters: 'REFRESH MATERIALIZED VIEW without CONCURRENTLY takes an ACCESS EXCLUSIVE lock for the entire refresh duration, blocking all queries against the view. REFRESH CONCURRENTLY allows reads to continue using the old data while the new data is being computed. Requires a UNIQUE index on the materialized view.',
  docsUrl: 'https://migrationpilot.dev/rules/mp033',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (!('RefreshMatViewStmt' in stmt)) return null;

    const refresh = stmt.RefreshMatViewStmt as {
      concurrent?: boolean;
      relation?: { relname?: string; schemaname?: string };
      skipData?: boolean;
    };

    // Already concurrent — safe
    if (refresh.concurrent) return null;

    // WITH NO DATA doesn't lock the view for long
    if (refresh.skipData) return null;

    const viewName = refresh.relation?.relname ?? 'unknown';

    return {
      ruleId: 'MP033',
      ruleName: 'require-concurrent-refresh-matview',
      severity: 'warning',
      message: `REFRESH MATERIALIZED VIEW "${viewName}" without CONCURRENTLY takes ACCESS EXCLUSIVE lock, blocking all reads for the entire refresh duration.`,
      line: ctx.line,
      safeAlternative: `-- Use CONCURRENTLY to allow reads during refresh (requires a UNIQUE index):
REFRESH MATERIALIZED VIEW CONCURRENTLY ${viewName};`,
    };
  },
};
