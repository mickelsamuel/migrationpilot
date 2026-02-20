import type { Rule, RuleContext, RuleViolation } from './engine.js';

const SPATIAL_TYPES = new Set([
  'geometry', 'geography', 'point', 'line', 'lseg', 'box', 'path', 'polygon', 'circle',
]);

export const requireSpatialIndex: Rule = {
  id: 'MP051',
  name: 'require-spatial-index',
  severity: 'warning',
  description: 'Spatial/geometry columns without a GIST or SP-GIST index will cause full sequential scans on spatial queries.',
  whyItMatters: 'PostGIS geometry and geography columns need a GIST or SP-GIST index for efficient spatial queries (ST_Contains, ST_DWithin, etc.). Without one, every spatial query triggers a full sequential scan. Adding the index at table creation time avoids the need for a later lock-heavy ALTER.',
  docsUrl: 'https://migrationpilot.dev/rules/mp051',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (!('CreateStmt' in stmt)) return null;

    const create = stmt.CreateStmt as {
      relation?: { relname?: string };
      tableElts?: Array<{
        ColumnDef?: {
          colname?: string;
          typeName?: {
            names?: Array<{ String?: { sval?: string } }>;
          };
        };
      }>;
    };

    if (!create.tableElts) return null;

    const spatialColumns: string[] = [];

    for (const elt of create.tableElts) {
      if (!elt.ColumnDef?.typeName?.names) continue;

      const typeNames = elt.ColumnDef.typeName.names
        .map(n => n.String?.sval)
        .filter((n): n is string => !!n);

      const hasSpatialType = typeNames.some(t => SPATIAL_TYPES.has(t.toLowerCase()));
      if (hasSpatialType && elt.ColumnDef.colname) {
        spatialColumns.push(elt.ColumnDef.colname);
      }
    }

    if (spatialColumns.length === 0) return null;

    // Check if subsequent statements create a GIST/SP-GIST index on these columns
    for (let i = ctx.statementIndex + 1; i < ctx.allStatements.length; i++) {
      const nextStmt = ctx.allStatements[i];
      if (!nextStmt) continue;
      const sql = nextStmt.originalSql.toUpperCase();
      if ((sql.includes('USING GIST') || sql.includes('USING SPGIST')) &&
          spatialColumns.some(c => nextStmt.originalSql.includes(c))) {
        return null;
      }
    }

    const tableName = create.relation?.relname ?? 'unknown';

    return {
      ruleId: 'MP051',
      ruleName: 'require-spatial-index',
      severity: 'warning',
      message: `Table "${tableName}" has spatial column(s) (${spatialColumns.join(', ')}) without a GIST index. Spatial queries will require full sequential scans.`,
      line: ctx.line,
      safeAlternative: `-- Add a GIST index for efficient spatial queries:
CREATE INDEX CONCURRENTLY idx_${tableName}_${spatialColumns[0]} ON ${tableName} USING GIST (${spatialColumns[0]});`,
    };
  },
};
