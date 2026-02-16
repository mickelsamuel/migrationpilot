export interface ExtractedTarget {
  tableName: string;
  schemaName?: string;
  columns?: string[];
  operation: string;
}

/**
 * Extracts target tables and columns from a parsed DDL statement.
 * Handles: AlterTableStmt, IndexStmt, CreateStmt, DropStmt,
 *          RenameStmt, CreateTrigStmt, VacuumStmt
 */
export function extractTargets(stmt: Record<string, unknown>): ExtractedTarget[] {
  const targets: ExtractedTarget[] = [];

  if (hasKey(stmt, 'AlterTableStmt')) {
    const alter = stmt.AlterTableStmt as AlterTableNode;
    const tableName = alter.relation?.relname;
    const schemaName = alter.relation?.schemaname;
    if (tableName) {
      const columns = extractColumnsFromAlter(alter);
      targets.push({ tableName, schemaName, columns, operation: 'ALTER TABLE' });
    }
  }

  if (hasKey(stmt, 'IndexStmt')) {
    const idx = stmt.IndexStmt as IndexNode;
    const tableName = idx.relation?.relname;
    const schemaName = idx.relation?.schemaname;
    if (tableName) {
      targets.push({
        tableName,
        schemaName,
        operation: idx.concurrent ? 'CREATE INDEX CONCURRENTLY' : 'CREATE INDEX',
      });
    }
  }

  if (hasKey(stmt, 'CreateStmt')) {
    const create = stmt.CreateStmt as CreateNode;
    const tableName = create.relation?.relname;
    const schemaName = create.relation?.schemaname;
    if (tableName) {
      targets.push({ tableName, schemaName, operation: 'CREATE TABLE' });
    }
  }

  if (hasKey(stmt, 'DropStmt')) {
    const drop = stmt.DropStmt as DropNode;
    if (drop.objects) {
      for (const obj of drop.objects) {
        const parts = extractNameFromDropObject(obj);
        if (parts) {
          targets.push({ ...parts, operation: 'DROP' });
        }
      }
    }
  }

  if (hasKey(stmt, 'VacuumStmt')) {
    const vacuum = stmt.VacuumStmt as VacuumNode;
    if (vacuum.rels) {
      for (const rel of vacuum.rels) {
        const relation = (rel as { relation?: RelationNode }).relation;
        if (relation?.relname) {
          targets.push({
            tableName: relation.relname,
            schemaName: relation.schemaname,
            operation: 'VACUUM',
          });
        }
      }
    }
  }

  if (hasKey(stmt, 'RefreshMatViewStmt')) {
    const refresh = stmt.RefreshMatViewStmt as { relation?: RelationNode; concurrent?: boolean };
    const tableName = refresh.relation?.relname;
    const schemaName = refresh.relation?.schemaname;
    if (tableName) {
      targets.push({
        tableName,
        schemaName,
        operation: refresh.concurrent ? 'REFRESH MATERIALIZED VIEW CONCURRENTLY' : 'REFRESH MATERIALIZED VIEW',
      });
    }
  }

  if (hasKey(stmt, 'TruncateStmt')) {
    const truncate = stmt.TruncateStmt as { relations?: Array<{ RangeVar?: RelationNode }> };
    if (truncate.relations) {
      for (const rel of truncate.relations) {
        const tableName = rel.RangeVar?.relname ?? (rel as unknown as RelationNode).relname;
        if (tableName) {
          targets.push({
            tableName,
            schemaName: rel.RangeVar?.schemaname ?? (rel as unknown as RelationNode).schemaname,
            operation: 'TRUNCATE',
          });
        }
      }
    }
  }

  return targets;
}

// --- Internal helpers & types ---

interface RelationNode {
  relname: string;
  schemaname?: string;
}

interface AlterTableNode {
  relation: RelationNode;
  cmds?: AlterTableCmd[];
}

interface AlterTableCmd {
  AlterTableCmd: {
    subtype: number;
    name?: string;
    def?: Record<string, unknown>;
  };
}

interface IndexNode {
  relation: RelationNode;
  concurrent?: boolean;
}

interface CreateNode {
  relation: RelationNode;
}

interface DropNode {
  objects?: unknown[];
}

interface VacuumNode {
  rels?: unknown[];
  options?: number;
}

function hasKey(obj: Record<string, unknown>, key: string): boolean {
  return key in obj && obj[key] != null;
}

function extractColumnsFromAlter(alter: AlterTableNode): string[] {
  const columns: string[] = [];
  if (alter.cmds) {
    for (const cmd of alter.cmds) {
      // Column name can be in AlterTableCmd.name (for ALTER COLUMN ops)
      // or in AlterTableCmd.def.ColumnDef.colname (for ADD COLUMN)
      const name = cmd.AlterTableCmd?.name;
      if (name) {
        columns.push(name);
        continue;
      }
      const def = cmd.AlterTableCmd?.def as { ColumnDef?: { colname?: string } } | undefined;
      const colname = def?.ColumnDef?.colname;
      if (colname) columns.push(colname);
    }
  }
  return columns;
}

function extractNameFromDropObject(obj: unknown): { tableName: string; schemaName?: string } | null {
  if (Array.isArray(obj)) {
    const parts = obj
      .filter((item): item is { str: string } => item != null && typeof item === 'object' && 'str' in item)
      .map(item => item.str);
    if (parts.length === 1 && parts[0]) return { tableName: parts[0] };
    if (parts.length === 2 && parts[0] && parts[1]) return { schemaName: parts[0], tableName: parts[1] };
  }
  if (obj && typeof obj === 'object' && 'List' in obj) {
    const list = (obj as { List: { items: unknown[] } }).List;
    return extractNameFromDropObject(list.items);
  }
  return null;
}
