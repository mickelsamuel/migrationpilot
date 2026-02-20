/**
 * Schema drift detection — compares two PostgreSQL schemas via information_schema.
 *
 * Usage: migrationpilot drift --source <url1> --target <url2>
 *
 * Compares tables, columns, indexes, constraints, and sequences between
 * two databases. Reports additions, removals, and modifications.
 *
 * SAFETY: Only reads from information_schema and pg_catalog. Never modifies data.
 */

import pg from 'pg';

const { Pool } = pg;

export interface SchemaDiff {
  tables: {
    added: string[];
    removed: string[];
    modified: TableDiff[];
  };
  indexes: {
    added: IndexInfo[];
    removed: IndexInfo[];
  };
  sequences: {
    added: string[];
    removed: string[];
  };
}

export interface TableDiff {
  table: string;
  columns: {
    added: ColumnInfo[];
    removed: ColumnInfo[];
    modified: ColumnChange[];
  };
  constraints: {
    added: ConstraintInfo[];
    removed: ConstraintInfo[];
  };
}

export interface ColumnInfo {
  name: string;
  dataType: string;
  nullable: boolean;
  defaultValue: string | null;
}

export interface ColumnChange {
  name: string;
  changes: string[];
}

export interface IndexInfo {
  name: string;
  table: string;
  definition: string;
}

export interface ConstraintInfo {
  name: string;
  table: string;
  type: string;
  definition: string;
}

interface SchemaSnapshot {
  tables: Map<string, ColumnInfo[]>;
  indexes: Map<string, IndexInfo>;
  constraints: Map<string, ConstraintInfo>;
  sequences: Set<string>;
}

async function fetchSchema(connectionString: string, schemaName = 'public'): Promise<SchemaSnapshot> {
  const pool = new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 5000,
    statement_timeout: 10000,
  });

  try {
    // Fetch tables and columns
    const colResult = await pool.query<{
      table_name: string;
      column_name: string;
      data_type: string;
      udt_name: string;
      is_nullable: string;
      column_default: string | null;
    }>(`
      SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = $1
      ORDER BY table_name, ordinal_position
    `, [schemaName]);

    const tables = new Map<string, ColumnInfo[]>();
    for (const row of colResult.rows) {
      const cols = tables.get(row.table_name) ?? [];
      cols.push({
        name: row.column_name,
        dataType: row.udt_name || row.data_type,
        nullable: row.is_nullable === 'YES',
        defaultValue: row.column_default,
      });
      tables.set(row.table_name, cols);
    }

    // Fetch indexes
    const idxResult = await pool.query<{
      indexname: string;
      tablename: string;
      indexdef: string;
    }>(`
      SELECT indexname, tablename, indexdef
      FROM pg_indexes
      WHERE schemaname = $1
    `, [schemaName]);

    const indexes = new Map<string, IndexInfo>();
    for (const row of idxResult.rows) {
      indexes.set(row.indexname, {
        name: row.indexname,
        table: row.tablename,
        definition: row.indexdef,
      });
    }

    // Fetch constraints
    const conResult = await pool.query<{
      constraint_name: string;
      table_name: string;
      constraint_type: string;
      check_clause: string | null;
    }>(`
      SELECT tc.constraint_name, tc.table_name, tc.constraint_type,
             cc.check_clause
      FROM information_schema.table_constraints tc
      LEFT JOIN information_schema.check_constraints cc
        ON tc.constraint_name = cc.constraint_name
        AND tc.constraint_schema = cc.constraint_schema
      WHERE tc.table_schema = $1
    `, [schemaName]);

    const constraints = new Map<string, ConstraintInfo>();
    for (const row of conResult.rows) {
      constraints.set(row.constraint_name, {
        name: row.constraint_name,
        table: row.table_name,
        type: row.constraint_type,
        definition: row.check_clause ?? row.constraint_type,
      });
    }

    // Fetch sequences
    const seqResult = await pool.query<{ sequence_name: string }>(`
      SELECT sequence_name
      FROM information_schema.sequences
      WHERE sequence_schema = $1
    `, [schemaName]);

    const sequences = new Set(seqResult.rows.map(r => r.sequence_name));

    return { tables, indexes, constraints, sequences };
  } finally {
    await pool.end();
  }
}

/**
 * Compare two database schemas and return the differences.
 */
export async function compareSchemas(
  sourceUrl: string,
  targetUrl: string,
  schema = 'public',
): Promise<SchemaDiff> {
  const [source, target] = await Promise.all([
    fetchSchema(sourceUrl, schema),
    fetchSchema(targetUrl, schema),
  ]);

  return diffSchemas(source, target);
}

/**
 * Compare two schema snapshots (pure function, no I/O).
 * Exported for testing.
 */
export function diffSchemas(source: SchemaSnapshot, target: SchemaSnapshot): SchemaDiff {
  // Tables
  const sourceTableNames = new Set(source.tables.keys());
  const targetTableNames = new Set(target.tables.keys());

  const addedTables = [...targetTableNames].filter(t => !sourceTableNames.has(t));
  const removedTables = [...sourceTableNames].filter(t => !targetTableNames.has(t));

  // Modified tables (present in both)
  const commonTables = [...sourceTableNames].filter(t => targetTableNames.has(t));
  const modifiedTables: TableDiff[] = [];

  for (const table of commonTables) {
    const srcCols = source.tables.get(table) ?? [];
    const tgtCols = target.tables.get(table) ?? [];
    const srcColMap = new Map(srcCols.map(c => [c.name, c]));
    const tgtColMap = new Map(tgtCols.map(c => [c.name, c]));

    const addedCols = tgtCols.filter(c => !srcColMap.has(c.name));
    const removedCols = srcCols.filter(c => !tgtColMap.has(c.name));
    const modifiedCols: ColumnChange[] = [];

    for (const [name, srcCol] of srcColMap) {
      const tgtCol = tgtColMap.get(name);
      if (!tgtCol) continue;

      const changes: string[] = [];
      if (srcCol.dataType !== tgtCol.dataType) {
        changes.push(`type: ${srcCol.dataType} → ${tgtCol.dataType}`);
      }
      if (srcCol.nullable !== tgtCol.nullable) {
        changes.push(`nullable: ${srcCol.nullable} → ${tgtCol.nullable}`);
      }
      if (srcCol.defaultValue !== tgtCol.defaultValue) {
        changes.push(`default: ${srcCol.defaultValue ?? 'none'} → ${tgtCol.defaultValue ?? 'none'}`);
      }
      if (changes.length > 0) {
        modifiedCols.push({ name, changes });
      }
    }

    // Constraints for this table
    const srcConstraints = [...source.constraints.values()].filter(c => c.table === table);
    const tgtConstraints = [...target.constraints.values()].filter(c => c.table === table);
    const srcConNames = new Set(srcConstraints.map(c => c.name));
    const tgtConNames = new Set(tgtConstraints.map(c => c.name));

    const addedConstraints = tgtConstraints.filter(c => !srcConNames.has(c.name));
    const removedConstraints = srcConstraints.filter(c => !tgtConNames.has(c.name));

    if (addedCols.length > 0 || removedCols.length > 0 || modifiedCols.length > 0 ||
        addedConstraints.length > 0 || removedConstraints.length > 0) {
      modifiedTables.push({
        table,
        columns: { added: addedCols, removed: removedCols, modified: modifiedCols },
        constraints: { added: addedConstraints, removed: removedConstraints },
      });
    }
  }

  // Indexes
  const srcIdxNames = new Set(source.indexes.keys());
  const tgtIdxNames = new Set(target.indexes.keys());
  const addedIndexes = [...tgtIdxNames]
    .filter(n => !srcIdxNames.has(n))
    .map(n => target.indexes.get(n)!)
    .filter(Boolean);
  const removedIndexes = [...srcIdxNames]
    .filter(n => !tgtIdxNames.has(n))
    .map(n => source.indexes.get(n)!)
    .filter(Boolean);

  // Sequences
  const addedSequences = [...target.sequences].filter(s => !source.sequences.has(s));
  const removedSequences = [...source.sequences].filter(s => !target.sequences.has(s));

  return {
    tables: { added: addedTables, removed: removedTables, modified: modifiedTables },
    indexes: { added: addedIndexes, removed: removedIndexes },
    sequences: { added: addedSequences, removed: removedSequences },
  };
}

/**
 * Format drift report as a readable string.
 */
export function formatDriftReport(diff: SchemaDiff): string {
  const lines: string[] = [];
  let changeCount = 0;

  lines.push('Schema Drift Report');
  lines.push('===================');
  lines.push('');

  // Tables
  if (diff.tables.added.length > 0) {
    lines.push(`Tables added (${diff.tables.added.length}):`);
    for (const t of diff.tables.added) {
      lines.push(`  + ${t}`);
      changeCount++;
    }
    lines.push('');
  }

  if (diff.tables.removed.length > 0) {
    lines.push(`Tables removed (${diff.tables.removed.length}):`);
    for (const t of diff.tables.removed) {
      lines.push(`  - ${t}`);
      changeCount++;
    }
    lines.push('');
  }

  for (const mod of diff.tables.modified) {
    lines.push(`Table "${mod.table}" modified:`);

    for (const col of mod.columns.added) {
      lines.push(`  + column "${col.name}" ${col.dataType}${col.nullable ? '' : ' NOT NULL'}${col.defaultValue ? ` DEFAULT ${col.defaultValue}` : ''}`);
      changeCount++;
    }
    for (const col of mod.columns.removed) {
      lines.push(`  - column "${col.name}" ${col.dataType}`);
      changeCount++;
    }
    for (const col of mod.columns.modified) {
      lines.push(`  ~ column "${col.name}": ${col.changes.join(', ')}`);
      changeCount++;
    }
    for (const con of mod.constraints.added) {
      lines.push(`  + constraint "${con.name}" (${con.type})`);
      changeCount++;
    }
    for (const con of mod.constraints.removed) {
      lines.push(`  - constraint "${con.name}" (${con.type})`);
      changeCount++;
    }
    lines.push('');
  }

  // Indexes
  if (diff.indexes.added.length > 0) {
    lines.push(`Indexes added (${diff.indexes.added.length}):`);
    for (const idx of diff.indexes.added) {
      lines.push(`  + ${idx.name} on ${idx.table}`);
      changeCount++;
    }
    lines.push('');
  }

  if (diff.indexes.removed.length > 0) {
    lines.push(`Indexes removed (${diff.indexes.removed.length}):`);
    for (const idx of diff.indexes.removed) {
      lines.push(`  - ${idx.name} on ${idx.table}`);
      changeCount++;
    }
    lines.push('');
  }

  // Sequences
  if (diff.sequences.added.length > 0) {
    lines.push(`Sequences added (${diff.sequences.added.length}):`);
    for (const s of diff.sequences.added) lines.push(`  + ${s}`);
    changeCount += diff.sequences.added.length;
    lines.push('');
  }

  if (diff.sequences.removed.length > 0) {
    lines.push(`Sequences removed (${diff.sequences.removed.length}):`);
    for (const s of diff.sequences.removed) lines.push(`  - ${s}`);
    changeCount += diff.sequences.removed.length;
    lines.push('');
  }

  if (changeCount === 0) {
    lines.push('No drift detected. Schemas are identical.');
  } else {
    lines.push(`Total: ${changeCount} difference(s) found.`);
  }

  return lines.join('\n');
}
