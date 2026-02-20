import type { Rule, RuleContext, RuleViolation } from './engine.js';

export const requirePartitionKeyInPK: Rule = {
  id: 'MP049',
  name: 'require-partition-key-in-pk',
  severity: 'critical',
  description: 'Partitioned table primary key must include all partition key columns. PostgreSQL will reject it otherwise.',
  whyItMatters: 'PostgreSQL requires that the primary key (and all unique constraints) on a partitioned table include all partition key columns. If omitted, the CREATE TABLE will fail at runtime. This ensures uniqueness can be enforced per-partition.',
  docsUrl: 'https://migrationpilot.dev/rules/mp049',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (!('CreateStmt' in stmt)) return null;

    const create = stmt.CreateStmt as {
      relation?: { relname?: string };
      partspec?: {
        partParams?: Array<{
          PartitionElem?: { name?: string; expr?: unknown };
        }>;
      };
      tableElts?: Array<{
        ColumnDef?: {
          colname?: string;
          constraints?: Array<{ Constraint?: { contype: string; keys?: Array<{ String?: { sval?: string } }> } }>;
        };
        Constraint?: {
          contype: string;
          keys?: Array<{ String?: { sval?: string } }>;
        };
      }>;
    };

    // Only applies to partitioned tables
    if (!create.partspec?.partParams || create.partspec.partParams.length === 0) return null;
    if (!create.tableElts) return null;

    // Extract partition key column names
    const partitionKeys = create.partspec.partParams
      .map(p => p.PartitionElem?.name)
      .filter((n): n is string => !!n);

    if (partitionKeys.length === 0) return null;

    // Find all PK constraints
    const pkColumns: string[] = [];
    let hasPK = false;

    for (const elt of create.tableElts) {
      // Column-level PK
      if (elt.ColumnDef?.constraints) {
        for (const c of elt.ColumnDef.constraints) {
          if (c.Constraint?.contype === 'CONSTR_PRIMARY') {
            hasPK = true;
            if (elt.ColumnDef.colname) pkColumns.push(elt.ColumnDef.colname);
          }
        }
      }
      // Table-level PK
      if (elt.Constraint?.contype === 'CONSTR_PRIMARY') {
        hasPK = true;
        if (elt.Constraint.keys) {
          for (const k of elt.Constraint.keys) {
            const col = k.String?.sval;
            if (col) pkColumns.push(col);
          }
        }
      }
    }

    if (!hasPK) return null;

    const missingKeys = partitionKeys.filter(k => !pkColumns.includes(k));
    if (missingKeys.length === 0) return null;

    const tableName = create.relation?.relname ?? 'unknown';

    return {
      ruleId: 'MP049',
      ruleName: 'require-partition-key-in-pk',
      severity: 'critical',
      message: `Partitioned table "${tableName}" primary key does not include partition key column(s): ${missingKeys.join(', ')}. PostgreSQL requires all partition key columns in the primary key.`,
      line: ctx.line,
      safeAlternative: `-- Include partition key columns in the primary key:
-- PRIMARY KEY (id, ${missingKeys.join(', ')})`,
    };
  },
};
