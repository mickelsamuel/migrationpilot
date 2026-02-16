import type { Rule, RuleContext, RuleViolation } from './engine.js';

export const banCluster: Rule = {
  id: 'MP032',
  name: 'ban-cluster',
  severity: 'critical',
  description: 'CLUSTER rewrites the entire table under ACCESS EXCLUSIVE lock to match an index ordering. Use pg_repack instead.',
  whyItMatters: 'CLUSTER physically reorders all rows in the table to match an index, requiring a full table rewrite under ACCESS EXCLUSIVE lock. On large tables this can take hours, blocking all reads and writes. Use pg_repack for online table reorganization without blocking.',
  docsUrl: 'https://migrationpilot.dev/rules/mp032',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (!('ClusterStmt' in stmt)) return null;

    const cluster = stmt.ClusterStmt as {
      relation?: { relname?: string };
      indexname?: string;
    };

    const tableName = cluster.relation?.relname ?? 'unknown';
    const indexName = cluster.indexname;

    return {
      ruleId: 'MP032',
      ruleName: 'ban-cluster',
      severity: 'critical',
      message: `CLUSTER on "${tableName}"${indexName ? ` USING "${indexName}"` : ''} rewrites the entire table under ACCESS EXCLUSIVE lock. This blocks ALL reads and writes for the entire duration.`,
      line: ctx.line,
      safeAlternative: `-- Use pg_repack for online table reorganization (no ACCESS EXCLUSIVE lock):
-- Install: CREATE EXTENSION pg_repack;
-- Run: pg_repack --table ${tableName}${indexName ? ` --order-by ${indexName}` : ''} --no-superuser-check`,
    };
  },
};
