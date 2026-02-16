import type { Rule, RuleContext, RuleViolation } from './engine.js';

export const requireConcurrentReindex: Rule = {
  id: 'MP021',
  name: 'require-concurrent-reindex',
  severity: 'warning',
  description: 'REINDEX without CONCURRENTLY acquires ACCESS EXCLUSIVE lock (table) or SHARE lock (index), blocking queries. Use REINDEX CONCURRENTLY on PG 12+.',
  whyItMatters: 'REINDEX without CONCURRENTLY acquires ACCESS EXCLUSIVE (table) or SHARE (index) locks, blocking all queries for the duration. REINDEX CONCURRENTLY (PG 12+) builds the new index without blocking reads or writes.',
  docsUrl: 'https://migrationpilot.dev/rules/mp021',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (!('ReindexStmt' in stmt)) return null;

    const reindex = stmt.ReindexStmt as {
      kind?: string;
      relation?: { relname?: string };
      name?: string;
      params?: Array<{ DefElem?: { defname: string } }>;
    };

    // REINDEX CONCURRENTLY was added in PG 12
    if (ctx.pgVersion < 12) return null;

    // REINDEX SYSTEM does not support CONCURRENTLY
    if (reindex.kind === 'REINDEX_OBJECT_SYSTEM') return null;

    // Check if already concurrent (stored in params DefElem)
    const isConcurrent = reindex.params?.some(
      p => p.DefElem?.defname === 'concurrently'
    ) ?? false;
    if (isConcurrent) return null;

    const target = reindex.relation?.relname ?? reindex.name ?? 'unknown';
    const kindLabel = reindex.kind?.replace('REINDEX_OBJECT_', '').toLowerCase() ?? 'object';

    return {
      ruleId: 'MP021',
      ruleName: 'require-concurrent-reindex',
      severity: 'warning',
      message: `REINDEX ${kindLabel.toUpperCase()} "${target}" without CONCURRENTLY blocks all writes (or reads for tables). On PostgreSQL ${ctx.pgVersion}, use REINDEX CONCURRENTLY instead.`,
      line: ctx.line,
      safeAlternative: ctx.originalSql.replace(
        /REINDEX\s+(TABLE|INDEX|SCHEMA|DATABASE)/i,
        'REINDEX $1 CONCURRENTLY'
      ),
    };
  },
};
