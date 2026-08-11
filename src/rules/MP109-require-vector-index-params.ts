/**
 * MP109: require-vector-index-params
 *
 * A pgvector HNSW or IVFFlat index created without tuning parameters. Both
 * access methods have build-time parameters that decide recall, and both are
 * expensive to rebuild once the table is large — the defaults are a starting
 * point, not a choice.
 *
 * Static rule: works from the migration file alone. When production context is
 * available it also computes the row-count-derived starting value for IVFFlat.
 */

import type { Rule, RuleContext, RuleViolation } from './engine.js';

export const requireVectorIndexParams: Rule = {
  id: 'MP109',
  name: 'require-vector-index-params',
  severity: 'warning',
  description: 'pgvector HNSW or IVFFlat index created without explicit build parameters.',
  whyItMatters:
    'pgvector index parameters are build-time decisions. For HNSW, m and ef_construction set the shape ' +
    'of the graph and therefore the recall ceiling; the defaults (m = 16, ef_construction = 64) are ' +
    'conservative and are frequently too low for production recall targets. For IVFFlat, lists decides ' +
    'how the vectors are clustered, and pgvector ties the right value to the row count — rows / 1000 up ' +
    'to a million rows, sqrt(rows) beyond that. Changing any of them later means rebuilding the whole ' +
    'index, which on a vector table is one of the most expensive builds in PostgreSQL.',
  docsUrl: 'https://migrationpilot.dev/rules/mp109',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (!('IndexStmt' in stmt)) return null;

    const idx = stmt.IndexStmt as {
      idxname?: string;
      accessMethod?: string;
      relation?: { relname?: string };
      options?: Array<{ DefElem?: { defname?: string } }>;
    };

    const method = idx.accessMethod?.toLowerCase();
    if (method !== 'hnsw' && method !== 'ivfflat') return null;

    const provided = new Set(
      (idx.options ?? [])
        .map(opt => opt.DefElem?.defname?.toLowerCase())
        .filter((name): name is string => !!name)
    );

    const expected = method === 'hnsw' ? ['m', 'ef_construction'] : ['lists'];
    const missing = expected.filter(name => !provided.has(name));
    if (missing.length === 0) return null;

    const indexName = idx.idxname ?? 'unnamed';
    const tableName = idx.relation?.relname ?? 'unknown';

    if (method === 'hnsw') {
      return {
        ruleId: 'MP109',
        ruleName: 'require-vector-index-params',
        severity: 'warning',
        message: `HNSW index "${indexName}" on "${tableName}" sets no ${missing.join(' or ')}, so it builds with pgvector's defaults (m = 16, ef_construction = 64). Those choose the graph's recall ceiling, and changing them later means a full rebuild.`,
        line: ctx.line,
        safeAlternative: `-- Set the graph parameters deliberately:
CREATE INDEX ${indexName === 'unnamed' ? 'idx_name' : indexName} ON ${tableName}
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 128);

-- Higher ef_construction means better recall for a slower build; m raises both
-- recall and index size. Measure recall against a known-good result set before
-- committing to the values, because changing them means rebuilding.

-- ef_search is a query-time knob, not a build one — tune it separately:
SET hnsw.ef_search = 100;`,
      };
    }

    const rows = ctx.tableStats?.rowCount;
    const suggested = rows && rows > 0
      ? rows <= 1_000_000
        ? Math.max(1, Math.round(rows / 1000))
        : Math.max(1, Math.round(Math.sqrt(rows)))
      : undefined;

    const sizing = suggested !== undefined
      ? ` This table holds ${rows!.toLocaleString()} rows, which puts the starting value at about ${suggested.toLocaleString()}.`
      : ` pgvector's guidance is rows / 1000 up to 1M rows, and sqrt(rows) above that.`;

    return {
      ruleId: 'MP109',
      ruleName: 'require-vector-index-params',
      severity: 'warning',
      message: `IVFFlat index "${indexName}" on "${tableName}" sets no lists, so the clustering is left to the default rather than sized to the data.${sizing}`,
      line: ctx.line,
      safeAlternative: `-- Size lists to the row count:
CREATE INDEX ${indexName === 'unnamed' ? 'idx_name' : indexName} ON ${tableName}
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = ${suggested ?? 1000});

-- IVFFlat clusters at build time, so the index must be built on representative
-- data and rebuilt as the distribution changes. HNSW avoids that entirely (MP050).

-- probes is the query-time counterpart to lists:
SET ivfflat.probes = 10;`,
    };
  },
};
