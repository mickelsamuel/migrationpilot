import type { Rule, RuleContext, RuleViolation } from './engine.js';

/**
 * MP089: warn-collation-change-rewrite
 *
 * ALTER COLUMN ... TYPE ... COLLATE changes the sort order of the column,
 * which invalidates every btree index built on it — the index is ordered by
 * the old collation and PostgreSQL has to rebuild it under the same
 * ACCESS EXCLUSIVE lock as the rewrite.
 *
 * MP007 already flags the rewrite that any ALTER COLUMN TYPE causes. This
 * rule adds what is specific to collation: the index rebuilds, and the fact
 * that comparison semantics change for everything that reads the column.
 */

export const warnCollationChangeRewrite: Rule = {
  id: 'MP089',
  name: 'warn-collation-change-rewrite',
  severity: 'warning',
  description: 'Changing a column COLLATE reorders the column, forcing a table rewrite and a rebuild of every index on it.',
  whyItMatters:
    'A collation defines the sort order, so changing it changes where every value belongs. Any ' +
    'btree index on the column is now ordered wrongly and has to be rebuilt, and that happens ' +
    'inside the same ACCESS EXCLUSIVE lock as the table rewrite rather than as separate work you ' +
    'can schedule. The behavioural change outlasts the migration: comparisons, ORDER BY, LIKE ' +
    'prefix matching and range queries on the column all answer differently afterwards, so a ' +
    'unique index can start rejecting values it used to accept and queries can silently return ' +
    'rows in a different order.',
  docsUrl: 'https://migrationpilot.dev/rules/mp089',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (!('AlterTableStmt' in stmt)) return null;

    const alter = stmt.AlterTableStmt as {
      relation?: { relname?: string };
      cmds?: Array<{
        AlterTableCmd?: {
          subtype?: string;
          name?: string;
          def?: { ColumnDef?: { collClause?: { collname?: Array<{ String?: { sval?: string } }> } } };
        };
      }>;
    };

    if (!alter.cmds) return null;
    const tableName = alter.relation?.relname ?? 'unknown';

    for (const cmdWrapper of alter.cmds) {
      const cmd = cmdWrapper.AlterTableCmd;
      if (!cmd || cmd.subtype !== 'AT_AlterColumnType') continue;

      const collClause = cmd.def?.ColumnDef?.collClause;
      if (!collClause) continue;

      const collation = (collClause.collname ?? [])
        .map(n => n.String?.sval)
        .filter(Boolean)
        .join('.');
      const columnName = cmd.name ?? 'unknown';

      return {
        ruleId: 'MP089',
        ruleName: 'warn-collation-change-rewrite',
        severity: 'warning',
        message: `Changing "${tableName}"."${columnName}" to COLLATE "${collation}" reorders the column. The table is rewritten and every index on the column is rebuilt, all under ACCESS EXCLUSIVE, and comparison, ORDER BY and LIKE results change afterwards.`,
        line: ctx.line,
        safeAlternative: `-- Move the collation change off the critical path with expand-contract:
-- 1. Add the replacement column with the new collation
ALTER TABLE ${tableName} ADD COLUMN ${columnName}_new TEXT COLLATE "${collation}";
-- 2. Backfill in batches, then build its indexes without blocking
CREATE INDEX CONCURRENTLY idx_${tableName}_${columnName}_new ON ${tableName} (${columnName}_new);
-- 3. Swap the columns in a short transaction once the data is in place

-- If you must change it in place, bound the lock wait:
SET lock_timeout = '5s';`,
      };
    }

    return null;
  },
};
