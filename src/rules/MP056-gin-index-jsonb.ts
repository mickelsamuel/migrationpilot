import type { Rule, RuleContext, RuleViolation } from './engine.js';

export const ginIndexJsonb: Rule = {
  id: 'MP056',
  name: 'gin-index-on-jsonb-without-expression',
  severity: 'warning',
  description: 'A plain GIN index on a JSONB column only supports containment operators (@>, ?, ?|, ?&), not the common ->> extraction operator used by ORMs.',
  whyItMatters: 'A GIN index with default jsonb_ops on a bare JSONB column does NOT speed up queries using ->> or ->. Most ORMs (Prisma, TypeORM, Knex) generate WHERE metadata->>\'key\' = \'value\' queries, which will still do a sequential scan. Use an expression B-tree index on the specific path instead, or use jsonb_path_ops if you only use @> containment queries.',
  docsUrl: 'https://migrationpilot.dev/rules/mp056',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (!('IndexStmt' in stmt)) return null;

    const index = stmt.IndexStmt as {
      idxname?: string;
      relation?: { relname?: string };
      accessMethod?: string;
      indexParams?: Array<{
        IndexElem?: {
          name?: string;
          expr?: unknown;
        };
      }>;
      indexIncludingParams?: unknown[];
    };

    // Only check GIN indexes
    if (index.accessMethod?.toLowerCase() !== 'gin') return null;

    const table = index.relation?.relname ?? 'unknown';
    const idxName = index.idxname ?? 'unnamed';

    // Check if any index param is a bare column reference (no expression)
    const params = index.indexParams ?? [];
    const bareColumns = params.filter(p =>
      p.IndexElem?.name && !p.IndexElem?.expr
    );

    if (bareColumns.length === 0) return null;

    // Check the SQL for jsonb_path_ops (which is fine for @> queries)
    const sql = ctx.originalSql.toLowerCase();
    if (sql.includes('jsonb_path_ops')) return null;

    const colNames = bareColumns.map(p => p.IndexElem!.name).join(', ');

    return {
      ruleId: 'MP056',
      ruleName: 'gin-index-on-jsonb-without-expression',
      severity: 'warning',
      message: `GIN index "${idxName}" on "${table}"(${colNames}) uses bare column reference. This index won't speed up ->> or -> queries — only @>, ?, ?|, ?& containment operators.`,
      line: ctx.line,
      safeAlternative: `-- For ->> queries, use an expression B-tree index instead:
-- CREATE INDEX CONCURRENTLY ${idxName} ON ${table} ((${colNames}->>'key'));
-- For @> containment queries, add jsonb_path_ops:
-- CREATE INDEX CONCURRENTLY ${idxName} ON ${table} USING GIN (${colNames} jsonb_path_ops);`,
    };
  },
};
