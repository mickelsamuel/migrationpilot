import type { Rule, RuleContext, RuleViolation } from './engine.js';

export const preferHnswOverIvfflat: Rule = {
  id: 'MP050',
  name: 'prefer-hnsw-over-ivfflat',
  severity: 'warning',
  description: 'IVFFlat indexes require training data and periodic reindexing. HNSW provides better recall and does not need retraining.',
  whyItMatters: 'pgvector IVFFlat indexes need enough representative data at creation time to build good clusters. As data distribution changes, recall degrades and you must REINDEX. HNSW indexes build incrementally, have consistently better recall, and never need retraining. Prefer HNSW unless you have a specific reason to use IVFFlat.',
  docsUrl: 'https://migrationpilot.dev/rules/mp050',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (!('IndexStmt' in stmt)) return null;

    const idx = stmt.IndexStmt as {
      accessMethod?: string;
      idxname?: string;
      relation?: { relname?: string };
    };

    if (idx.accessMethod !== 'ivfflat') return null;

    const indexName = idx.idxname ?? 'unnamed';
    const tableName = idx.relation?.relname ?? 'unknown';

    return {
      ruleId: 'MP050',
      ruleName: 'prefer-hnsw-over-ivfflat',
      severity: 'warning',
      message: `Index "${indexName}" on "${tableName}" uses IVFFlat. HNSW provides better recall without needing training data or periodic reindexing.`,
      line: ctx.line,
      safeAlternative: `-- Use HNSW instead of IVFFlat for better recall:
-- CREATE INDEX ${indexName} ON ${tableName} USING hnsw (embedding vector_cosine_ops);`,
    };
  },
};
