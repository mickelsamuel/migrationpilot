/**
 * MP100: warn-redundant-index
 *
 * A new index whose key columns are already the leading columns of an index that
 * exists in production. PostgreSQL can use the existing index for those queries,
 * so the new one costs build time, disk, and write amplification for nothing.
 *
 * Production-context rule: silent without --database-url, because the comparison
 * is against the live catalog.
 */

import type { Rule, RuleContext, RuleViolation } from './engine.js';
import type { ExistingIndex } from '../production/catalog.js';
import { indexKeyColumns, normalizeKey } from './catalog-helpers.js';

export const warnRedundantIndex: Rule = {
  id: 'MP100',
  name: 'warn-redundant-index',
  severity: 'warning',
  description: 'The new index duplicates the leading columns of an index that already exists on the table.',
  whyItMatters:
    'A B-tree index on (a) is already covered by an existing index on (a, b): PostgreSQL can use the ' +
    'leading columns of a composite index on their own. Creating the narrower index buys nothing and ' +
    'costs a full build, permanent disk, and extra work on every INSERT, UPDATE, and DELETE. Redundant ' +
    'indexes also slow down planning, since the planner considers each one.',
  docsUrl: 'https://migrationpilot.dev/rules/mp100',
  requiresDatabaseUrl: true,

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    // Only fires with production context — the comparison needs the live catalog
    if (!ctx.existingIndexes || ctx.existingIndexes.length === 0) return null;
    if (!('IndexStmt' in stmt)) return null;

    const idx = stmt.IndexStmt as {
      idxname?: string;
      accessMethod?: string;
      unique?: boolean;
      relation?: { relname?: string };
      whereClause?: Record<string, unknown>;
      indexParams?: Array<{ IndexElem?: { name?: string; expr?: unknown } }>;
    };

    // A partial index is not interchangeable with a full one — stay quiet
    if (idx.whereClause) return null;

    const newColumns = indexKeyColumns(idx);
    if (!newColumns) return null;

    const method = (idx.accessMethod ?? 'btree').toLowerCase();
    const normalized = newColumns.map(normalizeKey);

    const covering = ctx.existingIndexes.find(existing =>
      covers(existing, method, normalized, idx.unique === true)
    );
    if (!covering) return null;

    const indexName = idx.idxname ?? 'the new index';
    const tableName = idx.relation?.relname ?? covering.tableName;
    const existingRole = covering.isPrimary
      ? 'the primary key index'
      : covering.isUnique
        ? 'unique index'
        : 'index';

    return {
      ruleId: 'MP100',
      ruleName: 'warn-redundant-index',
      severity: 'warning',
      message: `"${indexName}" on "${tableName}" indexes (${newColumns.join(', ')}), which is already the leading column${normalized.length > 1 ? 's' : ''} of existing ${existingRole} "${covering.indexName}" (${covering.keyColumns.join(', ')}). PostgreSQL can serve those lookups from "${covering.indexName}". The new index adds build time, disk, and write overhead without adding a lookup path.`,
      line: ctx.line,
      safeAlternative: `-- "${covering.indexName}" already covers (${newColumns.join(', ')}):
-- ${covering.definition}

-- Confirm the planner agrees before adding another index:
EXPLAIN (BUFFERS) SELECT * FROM ${tableName} WHERE ${newColumns[0]} = $1;

-- Keep the new index only if it differs in a way that matters: a smaller index
-- for a hot lookup, a different access method, or a different sort order.`,
    };
  },
};

/**
 * True when `existing` already provides everything the new index would.
 *
 * Requires the same access method and the new keys to be a prefix of the
 * existing keys. A new UNIQUE index needs an exact match: uniqueness on (a) is a
 * stronger constraint than uniqueness on (a, b), so a wider unique index does
 * not cover it, and a non-unique index never does.
 */
function covers(
  existing: ExistingIndex,
  method: string,
  newColumns: string[],
  newIsUnique: boolean
): boolean {
  if (existing.isPartial) return false;
  if (existing.method.toLowerCase() !== method) return false;
  if (newIsUnique && (!existing.isUnique || existing.keyColumns.length !== newColumns.length)) {
    return false;
  }
  if (existing.keyColumns.length < newColumns.length) return false;

  return newColumns.every((col, i) => normalizeKey(existing.keyColumns[i] ?? '') === col);
}
