import type { Rule, RuleContext, RuleViolation } from './engine.js';

/**
 * MP070: warn-concurrent-index-invalid
 *
 * CREATE INDEX CONCURRENTLY can fail and leave an INVALID index behind.
 * Before retrying, you must DROP the invalid index. Without a preceding
 * DROP INDEX IF EXISTS, a retry will fail with "index already exists".
 *
 * Best practice: always include DROP INDEX IF EXISTS before
 * CREATE INDEX CONCURRENTLY to handle retries cleanly.
 */

export const warnConcurrentIndexInvalid: Rule = {
  id: 'MP070',
  name: 'warn-concurrent-index-invalid',
  severity: 'warning',
  description: 'CREATE INDEX CONCURRENTLY can leave an invalid index on failure. Add DROP INDEX IF EXISTS before retrying.',
  whyItMatters:
    'If CREATE INDEX CONCURRENTLY fails (due to deadlock, unique violation, or timeout), it leaves ' +
    'behind an INVALID index that is never used for queries but still slows down writes. Retrying ' +
    'without first dropping the invalid index fails with "relation already exists". Always precede ' +
    'CONCURRENTLY index creation with DROP INDEX IF EXISTS to handle retries safely.',
  docsUrl: 'https://migrationpilot.dev/rules/mp070',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (!('IndexStmt' in stmt)) return null;

    const idx = stmt.IndexStmt as {
      concurrent?: boolean;
      idxname?: string;
      if_not_exists?: boolean;
      relation?: { relname?: string };
    };

    if (!idx.concurrent || !idx.idxname) return null;

    // IF NOT EXISTS handles the retry case gracefully
    if (idx.if_not_exists) return null;

    const indexName = idx.idxname;
    const tableName = idx.relation?.relname ?? 'unknown';

    // Check if there's a DROP INDEX IF EXISTS for this index in preceding statements
    const hasDropBefore = ctx.allStatements.some((s, i) => {
      if (i >= ctx.statementIndex) return false;
      const sql = s.originalSql.toLowerCase();
      return sql.includes('drop index') &&
        sql.includes('if exists') &&
        sql.includes(indexName.toLowerCase());
    });

    if (hasDropBefore) return null;

    return {
      ruleId: 'MP070',
      ruleName: 'warn-concurrent-index-invalid',
      severity: 'warning',
      message: `CREATE INDEX CONCURRENTLY "${indexName}" on "${tableName}" without a preceding DROP INDEX IF EXISTS. If this fails and is retried, the stale invalid index will block creation.`,
      line: ctx.line,
      safeAlternative: `-- Drop any stale invalid index before creating:
DROP INDEX IF EXISTS ${indexName};
CREATE INDEX CONCURRENTLY ${indexName} ON ${tableName} (...);`,
    };
  },
};
