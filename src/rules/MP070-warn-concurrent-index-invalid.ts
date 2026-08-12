import type { Rule, RuleContext, RuleViolation } from './engine.js';
import { adoptedLaterInMigration, constraintOwning } from './index-ownership.js';

/**
 * MP070: warn-concurrent-index-invalid
 *
 * CREATE INDEX CONCURRENTLY can fail and leave an INVALID index behind.
 * Before retrying, you must DROP the invalid index. Without a preceding
 * DROP INDEX IF EXISTS, a retry will fail with "index already exists".
 *
 * Best practice: always include DROP INDEX IF EXISTS before
 * CREATE INDEX CONCURRENTLY to handle retries cleanly.
 *
 * IF NOT EXISTS is not a substitute and this rule used to accept it as one.
 * It matches by name, and an invalid index has the name — so the statement
 * skips the build, returns the `CREATE INDEX` success tag, and the migration
 * runner marks the migration applied over an index that will never answer a
 * query. There is no error and nothing in the deploy log. MPH-012 verifies it
 * on PostgreSQL 17.10, and `bench/corpus/unsafe/u13` is the benchmark case
 * this exemption made MigrationPilot miss.
 *
 * With one exception, which MPH-012 spells out and this rule used to walk
 * straight into: an index owned by a UNIQUE or PRIMARY KEY constraint cannot be
 * dropped at all. `DROP INDEX CONCURRENTLY IF EXISTS` on one is rejected with
 * "cannot drop index ... because constraint ... requires it" — verified on
 * PostgreSQL 18.3 — so demanding the drop there asks for a migration that
 * cannot run, and MP097 objects to the result. The repair path for a
 * constraint-backed index is REINDEX INDEX CONCURRENTLY instead.
 */

export const warnConcurrentIndexInvalid: Rule = {
  id: 'MP070',
  name: 'warn-concurrent-index-invalid',
  severity: 'warning',
  description: 'CREATE INDEX CONCURRENTLY can leave an invalid index on failure. Add DROP INDEX IF EXISTS before retrying.',
  whyItMatters:
    'If CREATE INDEX CONCURRENTLY fails (due to deadlock, unique violation, or timeout), it leaves ' +
    'behind an INVALID index that is never used for queries but still slows down writes. Retrying ' +
    'without first dropping the invalid index fails with "relation already exists" — or worse, ' +
    'with IF NOT EXISTS, silently succeeds without rebuilding it. Always precede ' +
    'CONCURRENTLY index creation with DROP INDEX IF EXISTS to handle retries safely. The exception ' +
    'is an index a UNIQUE or PRIMARY KEY constraint owns: PostgreSQL refuses to drop that one at ' +
    'all, so its retry path is REINDEX INDEX CONCURRENTLY, or dropping the constraint first.',
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

    // A constraint owns this index, or is about to. Asking for the drop would be
    // asking for a statement PostgreSQL rejects, so stand down and leave the
    // REINDEX path to the docs — MPH-012.
    const owner = adoptedLaterInMigration(ctx, indexName) ?? constraintOwning(ctx, indexName);
    if (owner) return null;

    const message = idx.if_not_exists
      ? `CREATE INDEX CONCURRENTLY IF NOT EXISTS "${indexName}" on "${tableName}" without a preceding DROP INDEX IF EXISTS. IF NOT EXISTS is not the guard here: it matches an index a failed build left INVALID, skips the build and reports success, so the migration is marked applied over an index that never answers a query.`
      : `CREATE INDEX CONCURRENTLY "${indexName}" on "${tableName}" without a preceding DROP INDEX IF EXISTS. If this fails and is retried, the stale invalid index will block creation.`;

    return {
      ruleId: 'MP070',
      ruleName: 'warn-concurrent-index-invalid',
      severity: 'warning',
      message,
      line: ctx.line,
      safeAlternative: `-- Drop any stale invalid index before creating:
DROP INDEX CONCURRENTLY IF EXISTS ${indexName};
CREATE INDEX CONCURRENTLY ${indexName} ON ${tableName} (...);

-- If a UNIQUE or PRIMARY KEY constraint owns ${indexName}, the drop is refused
-- outright. Rebuild it in place instead:
-- REINDEX INDEX CONCURRENTLY ${indexName};`,
    };
  },
};
