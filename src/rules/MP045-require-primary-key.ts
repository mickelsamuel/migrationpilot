import type { Rule, RuleContext, RuleViolation } from './engine.js';

export const requirePrimaryKey: Rule = {
  id: 'MP045',
  name: 'require-primary-key',
  severity: 'warning',
  description: 'Tables without a primary key cannot be efficiently replicated and make row identification ambiguous.',
  whyItMatters: 'Tables without a primary key cannot use logical replication (a requirement for zero-downtime upgrades), make UPDATE/DELETE operations ambiguous, prevent efficient foreign key references, and break many ORMs. Add a primary key to every table.',
  docsUrl: 'https://migrationpilot.dev/rules/mp045',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (!('CreateStmt' in stmt)) return null;

    const create = stmt.CreateStmt as {
      relation?: { relname?: string; relpersistence?: string };
      tableElts?: Array<{
        ColumnDef?: {
          colname?: string;
          constraints?: Array<{ Constraint?: { contype: string } }>;
        };
        Constraint?: { contype: string };
      }>;
      inhRelations?: unknown[];
    };

    // Skip temp tables
    if (create.relation?.relpersistence === 't') return null;

    // Skip tables inheriting from parent (partition children) — they inherit PK
    if (create.inhRelations && create.inhRelations.length > 0) return null;

    if (!create.tableElts) return null;

    // Check for PK in column constraints
    const hasPkInColumns = create.tableElts.some(elt => {
      return elt.ColumnDef?.constraints?.some(c =>
        c.Constraint?.contype === 'CONSTR_PRIMARY'
      );
    });

    // Check for PK in table-level constraints
    const hasPkInTable = create.tableElts.some(elt => {
      return elt.Constraint?.contype === 'CONSTR_PRIMARY';
    });

    if (hasPkInColumns || hasPkInTable) return null;

    const tableName = create.relation?.relname ?? 'unknown';

    return {
      ruleId: 'MP045',
      ruleName: 'require-primary-key',
      severity: 'warning',
      message: `CREATE TABLE "${tableName}" without a primary key. Tables without a PK cannot use logical replication and make row identification ambiguous.`,
      line: ctx.line,
      safeAlternative: `-- Add a primary key column:
-- CREATE TABLE ${tableName} (
--   id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
--   ...
-- );`,
    };
  },
};
