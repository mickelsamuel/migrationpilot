import type { Rule } from './engine.js';

/**
 * MP061: suboptimal-column-order
 *
 * PostgreSQL stores tuple data in column declaration order.
 * Fixed-size types (int, bigint, bool, timestamp, uuid) should come
 * before variable-length types (text, varchar, jsonb, bytea) to reduce
 * alignment padding waste.
 *
 * A table with (text, int, text, bigint) wastes ~8 bytes per row
 * from padding vs. (bigint, int, text, text).
 */

const FIXED_SIZE_TYPES = new Set([
  'bool', 'boolean',
  'int2', 'smallint',
  'int4', 'integer', 'int',
  'int8', 'bigint',
  'float4', 'real',
  'float8', 'double precision',
  'numeric', 'decimal',
  'date',
  'time', 'timetz',
  'timestamp', 'timestamptz',
  'interval',
  'uuid',
  'oid',
  'money',
  'inet', 'cidr', 'macaddr', 'macaddr8',
  'point', 'line', 'lseg', 'box', 'path', 'polygon', 'circle',
]);

function isFixedSize(typeName: string): boolean {
  return FIXED_SIZE_TYPES.has(typeName.toLowerCase());
}

function extractTypeName(typeNames: unknown): string {
  if (!Array.isArray(typeNames)) return '';
  const parts = typeNames
    .filter((n): n is { String: { sval: string } } =>
      n != null && typeof n === 'object' && 'String' in n
    )
    .map(n => n.String.sval);
  // Use last part — PostgreSQL AST stores types as pg_catalog.int4, etc.
  const name = parts[parts.length - 1];
  return name ? name.toLowerCase() : '';
}

export const suboptimalColumnOrder: Rule = {
  id: 'MP061',
  name: 'suboptimal-column-order',
  severity: 'warning',
  description: 'CREATE TABLE has variable-length columns before fixed-size columns, wasting alignment padding.',
  whyItMatters:
    'PostgreSQL stores columns in declaration order. Fixed-size types (int, bigint, timestamp, uuid) ' +
    'before variable-length types (text, jsonb, bytea) reduces alignment padding waste — saving ' +
    '4-16 bytes per row on tables with mixed types.',
  docsUrl: 'https://migrationpilot.dev/rules/mp061',
  check(stmt) {
    const create = stmt.CreateStmt as {
      relation?: { relname?: string };
      tableElts?: Array<{ ColumnDef?: { colname?: string; typeName?: { names?: unknown[] } } }>;
    } | undefined;

    if (!create?.tableElts || !create.relation?.relname) return null;

    const columns = create.tableElts
      .filter((e): e is { ColumnDef: { colname: string; typeName?: { names?: unknown[] } } } =>
        e.ColumnDef != null && e.ColumnDef.colname != null
      )
      .map(e => ({
        name: e.ColumnDef.colname,
        typeName: extractTypeName(e.ColumnDef.typeName?.names),
        fixed: isFixedSize(extractTypeName(e.ColumnDef.typeName?.names)),
      }));

    if (columns.length < 3) return null; // Too few columns to matter

    // Check if any variable-length column comes before a fixed-size column
    let lastVarIdx = -1;
    let firstFixedAfterVar = -1;

    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      if (!col) continue;
      if (!col.fixed && col.typeName !== '') {
        lastVarIdx = i;
      }
      if (col.fixed && lastVarIdx >= 0 && firstFixedAfterVar < 0) {
        firstFixedAfterVar = i;
      }
    }

    if (firstFixedAfterVar < 0) return null; // Already optimal or no mix

    const varCols = columns.filter(c => !c.fixed && c.typeName !== '').map(c => c.name);
    const fixedCols = columns.filter(c => c.fixed).map(c => c.name);

    if (varCols.length === 0 || fixedCols.length === 0) return null;

    return {
      ruleId: 'MP061',
      ruleName: 'suboptimal-column-order',
      severity: 'warning',
      message: `Table "${create.relation.relname}": place fixed-size columns (${fixedCols.join(', ')}) before variable-length columns (${varCols.join(', ')}) to reduce alignment padding.`,
      line: 1,
      statement: '',
    };
  },
};
