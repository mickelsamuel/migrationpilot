/**
 * Generates reverse (rollback) SQL for migration statements.
 *
 * Given a parsed migration, produces the inverse DDL operations
 * that would undo each change. Statements are reversed in order
 * (last-applied first) to respect dependencies.
 */

import type { ParsedStatement } from '../parser/parse.js';

export interface RollbackResult {
  /** Reversed SQL statements in correct undo order */
  statements: RollbackStatement[];
  /** Statements that could not be auto-reversed */
  warnings: string[];
}

export interface RollbackStatement {
  /** The reverse SQL */
  sql: string;
  /** What the original statement did */
  originalDescription: string;
}

/**
 * Generate rollback SQL for a list of parsed statements.
 * Returns statements in reverse order (undo last change first).
 */
export function generateRollback(stmts: ParsedStatement[]): RollbackResult {
  const statements: RollbackStatement[] = [];
  const warnings: string[] = [];

  // Process in reverse order for correct rollback sequence
  for (let i = stmts.length - 1; i >= 0; i--) {
    const parsed = stmts[i];
    if (!parsed) continue;
    const { stmt, originalSql } = parsed;
    const result = reverseStatement(stmt, originalSql);

    if (result) {
      statements.push(result);
    } else {
      // Skip SET/RESET and transaction control — not meaningful to reverse
      const upper = originalSql.toUpperCase().trim();
      if (/^(SET |RESET |BEGIN|COMMIT|ROLLBACK)/.test(upper)) continue;
      warnings.push(`Cannot auto-reverse: ${originalSql.slice(0, 80)}${originalSql.length > 80 ? '...' : ''}`);
    }
  }

  return { statements, warnings };
}

function reverseStatement(
  stmt: Record<string, unknown>,
  originalSql: string,
): RollbackStatement | null {
  // CREATE TABLE → DROP TABLE
  if ('CreateStmt' in stmt) {
    return reverseCreateTable(stmt);
  }

  // CREATE INDEX → DROP INDEX
  if ('IndexStmt' in stmt) {
    return reverseCreateIndex(stmt, originalSql);
  }

  // DROP STMT → cannot fully reverse (data lost)
  if ('DropStmt' in stmt) {
    return reverseDropStmt(stmt, originalSql);
  }

  // ALTER TABLE → reverse individual sub-commands
  if ('AlterTableStmt' in stmt) {
    return reverseAlterTable(stmt, originalSql);
  }

  // RENAME → reverse rename
  if ('RenameStmt' in stmt) {
    return reverseRename(stmt, originalSql);
  }

  // CREATE TRIGGER → DROP TRIGGER
  if ('CreateTrigStmt' in stmt) {
    return reverseCreateTrigger(stmt);
  }

  // ALTER ENUM → limited reversal
  if ('AlterEnumStmt' in stmt) {
    return reverseAlterEnum(originalSql);
  }

  // CREATE EXTENSION → DROP EXTENSION
  if ('CreateExtensionStmt' in stmt) {
    return reverseCreateExtension(stmt);
  }

  // CREATE SCHEMA → DROP SCHEMA
  if ('CreateSchemaStmt' in stmt) {
    return reverseCreateSchema(stmt);
  }

  // CREATE SEQUENCE → DROP SEQUENCE
  if ('CreateSeqStmt' in stmt) {
    return reverseCreateSequence(stmt);
  }

  // CREATE VIEW → DROP VIEW
  if ('ViewStmt' in stmt) {
    return reverseCreateView(stmt);
  }

  return null;
}

// --- Reverse implementations ---

function reverseCreateTable(stmt: Record<string, unknown>): RollbackStatement | null {
  const create = stmt.CreateStmt as { relation?: { relname?: string; schemaname?: string } };
  const table = qualifiedName(create.relation?.schemaname, create.relation?.relname);
  if (!table) return null;
  return {
    sql: `DROP TABLE IF EXISTS ${table};`,
    originalDescription: `CREATE TABLE ${table}`,
  };
}

function reverseCreateIndex(stmt: Record<string, unknown>, originalSql: string): RollbackStatement | null {
  const idx = stmt.IndexStmt as { idxname?: string; concurrent?: boolean };
  const name = idx.idxname;
  if (!name) {
    // Try to extract from SQL
    const match = originalSql.match(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i);
    if (match?.[1]) {
      const concurrent = idx.concurrent ? ' CONCURRENTLY' : '';
      return {
        sql: `DROP INDEX${concurrent} IF EXISTS ${match[1]};`,
        originalDescription: `CREATE INDEX ${match[1]}`,
      };
    }
    return null;
  }
  const concurrent = idx.concurrent ? ' CONCURRENTLY' : '';
  return {
    sql: `DROP INDEX${concurrent} IF EXISTS ${name};`,
    originalDescription: `CREATE INDEX ${name}`,
  };
}

function reverseDropStmt(_stmt: Record<string, unknown>, originalSql: string): RollbackStatement | null {
  // We can't recreate dropped objects, but we can warn
  const upper = originalSql.toUpperCase();
  if (upper.includes('IF EXISTS')) {
    return {
      sql: `-- WARNING: Cannot auto-generate CREATE for dropped object.\n-- Original: ${originalSql.trim()}`,
      originalDescription: originalSql.slice(0, 60),
    };
  }
  return {
    sql: `-- WARNING: Cannot auto-generate CREATE for dropped object.\n-- Original: ${originalSql.trim()}`,
    originalDescription: originalSql.slice(0, 60),
  };
}

function reverseAlterTable(stmt: Record<string, unknown>, originalSql: string): RollbackStatement | null {
  const alter = stmt.AlterTableStmt as {
    relation?: { relname?: string; schemaname?: string };
    cmds?: Array<{ AlterTableCmd: { subtype: number; name?: string; def?: Record<string, unknown> } }>;
  };

  const table = qualifiedName(alter.relation?.schemaname, alter.relation?.relname);
  if (!table) return null;

  const cmd = alter.cmds?.[0]?.AlterTableCmd;
  if (!cmd) return null;

  // libpg-query returns subtype as string enum names
  const subtype = String(cmd.subtype);

  switch (subtype) {
    case 'AT_AddColumn': {
      const colDef = cmd.def as { ColumnDef?: { colname?: string } } | undefined;
      const col = colDef?.ColumnDef?.colname ?? cmd.name;
      if (col) {
        return {
          sql: `ALTER TABLE ${table} DROP COLUMN IF EXISTS ${col};`,
          originalDescription: `ADD COLUMN ${col} on ${table}`,
        };
      }
      break;
    }

    case 'AT_DropColumn': {
      const col = cmd.name;
      return {
        sql: `-- WARNING: Cannot auto-recreate dropped column.\n-- Original: ALTER TABLE ${table} DROP COLUMN ${col ?? 'unknown'};`,
        originalDescription: `DROP COLUMN ${col ?? 'unknown'} on ${table}`,
      };
    }

    case 'AT_SetNotNull': {
      const col = cmd.name;
      if (col) {
        return {
          sql: `ALTER TABLE ${table} ALTER COLUMN ${col} DROP NOT NULL;`,
          originalDescription: `SET NOT NULL on ${table}.${col}`,
        };
      }
      break;
    }

    case 'AT_DropNotNull': {
      const col = cmd.name;
      if (col) {
        return {
          sql: `ALTER TABLE ${table} ALTER COLUMN ${col} SET NOT NULL;`,
          originalDescription: `DROP NOT NULL on ${table}.${col}`,
        };
      }
      break;
    }

    case 'AT_ColumnDefault': {
      const col = cmd.name;
      if (col) {
        // If there's a def, it's a SET DEFAULT; if no def, it's DROP DEFAULT
        if (cmd.def) {
          return {
            sql: `ALTER TABLE ${table} ALTER COLUMN ${col} DROP DEFAULT;`,
            originalDescription: `SET DEFAULT on ${table}.${col}`,
          };
        }
        return {
          sql: `-- WARNING: Cannot auto-restore original DEFAULT value.\n-- Original: ALTER TABLE ${table} ALTER COLUMN ${col} DROP DEFAULT;`,
          originalDescription: `DROP DEFAULT on ${table}.${col}`,
        };
      }
      break;
    }

    case 'AT_AddConstraint': {
      // Extract constraint name from SQL since it's buried in the AST
      const nameMatch = originalSql.match(/ADD\s+CONSTRAINT\s+(\w+)/i);
      const constraintName = nameMatch?.[1];
      if (constraintName) {
        return {
          sql: `ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${constraintName};`,
          originalDescription: `ADD CONSTRAINT ${constraintName} on ${table}`,
        };
      }
      break;
    }

    case 'AT_DropConstraint': {
      const constraintName = cmd.name;
      return {
        sql: `-- WARNING: Cannot auto-recreate dropped constraint.\n-- Original: ALTER TABLE ${table} DROP CONSTRAINT ${constraintName ?? 'unknown'};`,
        originalDescription: `DROP CONSTRAINT ${constraintName ?? 'unknown'} on ${table}`,
      };
    }

    case 'AT_AlterColumnType': {
      const col = cmd.name;
      return {
        sql: `-- WARNING: Cannot auto-reverse column type change (original type unknown).\n-- Original: ALTER TABLE ${table} ALTER COLUMN ${col ?? 'unknown'} TYPE ...;`,
        originalDescription: `ALTER COLUMN TYPE on ${table}.${col ?? 'unknown'}`,
      };
    }
  }

  // Fallback: check SQL text for common patterns
  const upper = originalSql.toUpperCase();
  if (upper.includes('ENABLE ROW LEVEL SECURITY')) {
    return {
      sql: `ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY;`,
      originalDescription: `ENABLE ROW LEVEL SECURITY on ${table}`,
    };
  }
  if (upper.includes('DISABLE ROW LEVEL SECURITY')) {
    return {
      sql: `ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`,
      originalDescription: `DISABLE ROW LEVEL SECURITY on ${table}`,
    };
  }

  return null;
}

function reverseRename(stmt: Record<string, unknown>, originalSql: string): RollbackStatement | null {
  const rename = stmt.RenameStmt as {
    renameType?: number;
    relation?: { relname?: string; schemaname?: string };
    subname?: string;
    newname?: string;
  };

  const newName = rename.newname;
  const oldName = rename.subname ?? rename.relation?.relname;

  if (!newName) return null;

  const upper = originalSql.toUpperCase();

  // RENAME TABLE
  if (upper.includes('RENAME TO') && !upper.includes('RENAME COLUMN')) {
    const schema = rename.relation?.schemaname;
    const qualOld = qualifiedName(schema, oldName);
    return {
      sql: `ALTER TABLE ${qualifiedName(schema, newName)} RENAME TO ${oldName};`,
      originalDescription: `RENAME TABLE ${qualOld ?? oldName} → ${newName}`,
    };
  }

  // RENAME COLUMN
  if (upper.includes('RENAME COLUMN') || (rename.subname && rename.newname)) {
    const table = qualifiedName(rename.relation?.schemaname, rename.relation?.relname);
    if (table) {
      return {
        sql: `ALTER TABLE ${table} RENAME COLUMN ${newName} TO ${oldName};`,
        originalDescription: `RENAME COLUMN ${oldName} → ${newName} on ${table}`,
      };
    }
  }

  return null;
}

function reverseCreateTrigger(stmt: Record<string, unknown>): RollbackStatement | null {
  const trigger = stmt.CreateTrigStmt as {
    trigname?: string;
    relation?: { relname?: string; schemaname?: string };
  };

  const name = trigger.trigname;
  const table = qualifiedName(trigger.relation?.schemaname, trigger.relation?.relname);
  if (!name || !table) return null;

  return {
    sql: `DROP TRIGGER IF EXISTS ${name} ON ${table};`,
    originalDescription: `CREATE TRIGGER ${name} on ${table}`,
  };
}

function reverseAlterEnum(originalSql: string): RollbackStatement | null {
  const upper = originalSql.toUpperCase();
  if (upper.includes('ADD VALUE')) {
    return {
      sql: `-- WARNING: PostgreSQL does not support removing enum values.\n-- Original: ${originalSql.trim()}\n-- Manual intervention required: create new type without the value, migrate data, drop old type.`,
      originalDescription: 'ALTER TYPE ADD VALUE',
    };
  }
  if (upper.includes('RENAME VALUE')) {
    // Extract old and new names
    const match = originalSql.match(/RENAME\s+VALUE\s+'([^']+)'\s+TO\s+'([^']+)'/i);
    if (match?.[1] && match[2]) {
      const typeName = originalSql.match(/ALTER\s+TYPE\s+(\w+)/i)?.[1] ?? 'type_name';
      return {
        sql: `ALTER TYPE ${typeName} RENAME VALUE '${match[2]}' TO '${match[1]}';`,
        originalDescription: `RENAME VALUE '${match[1]}' → '${match[2]}'`,
      };
    }
  }
  return null;
}

function reverseCreateExtension(stmt: Record<string, unknown>): RollbackStatement | null {
  const ext = stmt.CreateExtensionStmt as { extname?: string };
  if (!ext.extname) return null;
  return {
    sql: `DROP EXTENSION IF EXISTS ${ext.extname};`,
    originalDescription: `CREATE EXTENSION ${ext.extname}`,
  };
}

function reverseCreateSchema(stmt: Record<string, unknown>): RollbackStatement | null {
  const schema = stmt.CreateSchemaStmt as { schemaname?: string };
  if (!schema.schemaname) return null;
  return {
    sql: `DROP SCHEMA IF EXISTS ${schema.schemaname};`,
    originalDescription: `CREATE SCHEMA ${schema.schemaname}`,
  };
}

function reverseCreateSequence(stmt: Record<string, unknown>): RollbackStatement | null {
  const seq = stmt.CreateSeqStmt as { sequence?: { relname?: string; schemaname?: string } };
  const name = qualifiedName(seq.sequence?.schemaname, seq.sequence?.relname);
  if (!name) return null;
  return {
    sql: `DROP SEQUENCE IF EXISTS ${name};`,
    originalDescription: `CREATE SEQUENCE ${name}`,
  };
}

function reverseCreateView(stmt: Record<string, unknown>): RollbackStatement | null {
  const view = stmt.ViewStmt as { view?: { relname?: string; schemaname?: string } };
  const name = qualifiedName(view.view?.schemaname, view.view?.relname);
  if (!name) return null;
  return {
    sql: `DROP VIEW IF EXISTS ${name};`,
    originalDescription: `CREATE VIEW ${name}`,
  };
}

// --- Helpers ---

function qualifiedName(schema?: string, name?: string): string | null {
  if (!name) return null;
  return schema ? `${schema}.${name}` : name;
}

/**
 * Format rollback SQL as a complete migration file.
 */
export function formatRollbackSql(result: RollbackResult): string {
  const lines: string[] = [];
  lines.push('-- Rollback migration generated by MigrationPilot');
  lines.push(`-- Generated: ${new Date().toISOString().slice(0, 10)}`);
  lines.push('');

  if (result.warnings.length > 0) {
    lines.push('-- WARNINGS:');
    for (const w of result.warnings) {
      lines.push(`--   ${w}`);
    }
    lines.push('');
  }

  for (const stmt of result.statements) {
    lines.push(`-- Undo: ${stmt.originalDescription}`);
    lines.push(stmt.sql);
    lines.push('');
  }

  return lines.join('\n');
}
