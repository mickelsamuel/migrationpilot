/**
 * MP016: require-index-on-fk
 *
 * Foreign key columns without an index cause sequential scans on the referencing
 * table whenever the referenced table row is updated or deleted. On large tables
 * this means long-held SHARE locks and cascading slowdowns.
 *
 * Safe alternative: CREATE INDEX CONCURRENTLY on the FK column(s) before or
 * after adding the constraint.
 */

import type { Rule, RuleContext, RuleViolation } from './engine.js';

const AT_AddConstraint = 'AT_AddConstraint';

export const requireFKIndex: Rule = {
  id: 'MP016',
  name: 'require-index-on-fk',
  severity: 'warning',
  description: 'Foreign key columns should have an index to avoid sequential scans on cascading updates/deletes.',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (!('AlterTableStmt' in stmt)) return null;

    const alter = stmt.AlterTableStmt as {
      relation?: { relname?: string };
      cmds?: Array<{
        AlterTableCmd: {
          subtype: string;
          def?: {
            Constraint?: {
              contype?: string;
              conname?: string;
              fk_attrs?: Array<{ String?: { sval: string } }>;
              pktable?: { relname?: string };
            };
          };
        };
      }>;
    };

    if (!alter.cmds) return null;

    const tableName = alter.relation?.relname || 'unknown';

    for (const cmd of alter.cmds) {
      const atCmd = cmd.AlterTableCmd;
      if (atCmd.subtype !== AT_AddConstraint) continue;

      const constraint = atCmd.def?.Constraint;
      if (!constraint || constraint.contype !== 'CONSTR_FOREIGN') continue;

      const fkCols = constraint.fk_attrs
        ?.filter(a => a.String?.sval)
        .map(a => a.String!.sval) ?? [];

      if (fkCols.length === 0) continue;

      // Check if a CREATE INDEX on these columns exists in preceding/following statements
      const hasIndex = ctx.allStatements.some(s => {
        if (!('IndexStmt' in s.stmt)) return false;
        const indexStmt = s.stmt.IndexStmt as {
          relation?: { relname?: string };
          indexParams?: Array<{
            IndexElem?: { name?: string };
          }>;
        };
        if (indexStmt.relation?.relname !== tableName) return false;
        const indexedCols = indexStmt.indexParams
          ?.map(p => p.IndexElem?.name)
          .filter(Boolean) ?? [];
        // All FK columns must be covered by the index
        return fkCols.every(c => indexedCols.includes(c));
      });

      if (hasIndex) continue;

      const colList = fkCols.join(', ');
      const constraintName = constraint.conname ?? 'unnamed_fk';
      const refTable = constraint.pktable?.relname ?? 'unknown';
      const indexName = `idx_${tableName}_${fkCols.join('_')}`;

      return {
        ruleId: 'MP016',
        ruleName: 'require-index-on-fk',
        severity: 'warning',
        message: `FK constraint "${constraintName}" on "${tableName}"(${colList}) → "${refTable}" has no matching index. Without an index, cascading updates/deletes cause sequential scans.`,
        line: ctx.line,
        safeAlternative: `-- Create index on FK columns (CONCURRENTLY to avoid blocking)
CREATE INDEX CONCURRENTLY ${indexName} ON ${tableName} (${colList});`,
      };
    }

    return null;
  },
};
