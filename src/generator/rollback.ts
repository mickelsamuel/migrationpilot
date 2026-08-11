/**
 * Generates reverse (rollback) SQL for migration statements.
 *
 * Given a parsed migration, produces the inverse DDL operations
 * that would undo each change. Statements are reversed in order
 * (last-applied first) to respect dependencies.
 *
 * Every reversal also carries a `reversibility` verdict — how faithfully the
 * generated SQL puts the database back. That verdict is the single source of
 * truth for the reversibility grade surfaced by `analyze`/`check`
 * (see src/generator/grade.ts); the grader aggregates, it does not re-classify.
 */

import type { ParsedStatement } from '../parser/parse.js';

/**
 * How faithfully a statement can be undone.
 *
 * - `clean` — the reverse SQL restores the previous state exactly.
 * - `care` — reversible, but the reverse loses something recoverable from
 *   elsewhere: an index definition, a default expression, a constraint body.
 * - `irreversible` — undoing it destroys or cannot restore row data.
 */
export type Reversibility = 'clean' | 'care' | 'irreversible';

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
  /** How faithfully this statement can be undone */
  reversibility: Reversibility;
  /** Why the reversal is imperfect — set for `care` and `irreversible` */
  reason?: string;
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
      if (isSkippable(originalSql)) continue;
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

  // DROP DATABASE → gone, with everything in it
  if ('DropdbStmt' in stmt) {
    const db = (stmt.DropdbStmt as { dbname?: string }).dbname ?? 'unknown';
    return {
      sql: `-- WARNING: Cannot recreate a dropped database.\n-- Original: ${originalSql.trim()}`,
      originalDescription: `DROP DATABASE ${db}`,
      reversibility: 'irreversible',
      reason: `DROP DATABASE "${db}" destroys every table in it. Only a backup brings it back.`,
    };
  }

  // TRUNCATE / DELETE / UPDATE / INSERT — data, not schema
  if ('TruncateStmt' in stmt || 'DeleteStmt' in stmt || 'UpdateStmt' in stmt || 'InsertStmt' in stmt) {
    return reverseDataStatement(stmt, originalSql);
  }

  return null;
}

/**
 * Classify a single statement's reversibility without generating SQL.
 *
 * Delegates to the same reversal logic `generateRollback` uses, so the grade
 * and the generated down-migration can never disagree.
 */
export function assessReversibility(
  stmt: Record<string, unknown>,
  originalSql: string,
): { reversibility: Reversibility; reason?: string } {
  if (isSkippable(originalSql)) {
    return { reversibility: 'clean' };
  }

  const reversed = reverseStatement(stmt, originalSql);
  if (!reversed) {
    return {
      reversibility: 'care',
      reason: 'No reverse statement could be generated automatically — write the down migration by hand.',
    };
  }

  return reversed.reason
    ? { reversibility: reversed.reversibility, reason: reversed.reason }
    : { reversibility: reversed.reversibility };
}

/** Session settings and transaction control carry nothing to undo. */
function isSkippable(originalSql: string): boolean {
  return /^(SET |RESET |BEGIN|COMMIT|ROLLBACK|START TRANSACTION)/.test(originalSql.toUpperCase().trim());
}

// --- Reverse implementations ---

function reverseCreateTable(stmt: Record<string, unknown>): RollbackStatement | null {
  const create = stmt.CreateStmt as { relation?: { relname?: string; schemaname?: string } };
  const table = qualifiedName(create.relation?.schemaname, create.relation?.relname);
  if (!table) return null;
  return {
    sql: `DROP TABLE IF EXISTS ${table};`,
    originalDescription: `CREATE TABLE ${table}`,
    reversibility: 'clean',
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
        reversibility: 'clean',
      };
    }
    return null;
  }
  const concurrent = idx.concurrent ? ' CONCURRENTLY' : '';
  return {
    sql: `DROP INDEX${concurrent} IF EXISTS ${name};`,
    originalDescription: `CREATE INDEX ${name}`,
    reversibility: 'clean',
  };
}

/**
 * Object classes whose DROP takes row data with it. Everything else a DROP can
 * name (index, view, sequence, trigger, type, function, policy, …) is a
 * definition that can be written again from source control.
 */
const DATA_BEARING_DROPS = new Set([
  'OBJECT_TABLE',
  'OBJECT_MATVIEW',
  'OBJECT_SCHEMA',
  'OBJECT_FOREIGN_TABLE',
]);

/**
 * Object classes whose CASCADE reaches columns. Dropping a type or domain with
 * CASCADE drops every column declared with it — that is row data, not just a
 * definition. CASCADE on a view or index only takes other definitions.
 */
const CASCADE_DROPS_COLUMNS = new Set(['OBJECT_TYPE', 'OBJECT_DOMAIN']);

function reverseDropStmt(stmt: Record<string, unknown>, originalSql: string): RollbackStatement | null {
  const drop = stmt.DropStmt as { removeType?: string; behavior?: string };
  const removeType = drop.removeType ?? '';
  const objectLabel = removeType.replace(/^OBJECT_/, '').replace(/_/g, ' ').toLowerCase() || 'object';
  const cascadesToColumns = drop.behavior === 'DROP_CASCADE' && CASCADE_DROPS_COLUMNS.has(removeType);
  const destroysData = DATA_BEARING_DROPS.has(removeType) || cascadesToColumns;

  return {
    sql: `-- WARNING: Cannot auto-generate CREATE for dropped object.\n-- Original: ${originalSql.trim()}`,
    originalDescription: originalSql.slice(0, 60),
    reversibility: destroysData ? 'irreversible' : 'care',
    reason: destroysData
      ? cascadesToColumns
        ? `DROP ${objectLabel.toUpperCase()} ... CASCADE drops every column declared with it, and their values go too.`
        : `Dropping a ${objectLabel} destroys its rows. A down migration can recreate the shape, never the data.`
      : `The ${objectLabel} definition is not recorded anywhere in this migration — recreate it from source control.`,
  };
}

/**
 * DML in a migration: TRUNCATE, DELETE, UPDATE, INSERT.
 *
 * Nothing here has a generated inverse — the point is the verdict, so the
 * grade can tell "backfills a new column" apart from "deletes rows".
 */
function reverseDataStatement(stmt: Record<string, unknown>, originalSql: string): RollbackStatement {
  const warn = (reversibility: Reversibility, description: string, reason: string): RollbackStatement => ({
    sql: `-- WARNING: Data statement — no reverse SQL is generated.\n-- Original: ${originalSql.trim()}`,
    originalDescription: description,
    reversibility,
    reason,
  });

  if ('TruncateStmt' in stmt) {
    const truncate = stmt.TruncateStmt as { relations?: Array<{ RangeVar?: { relname?: string } }> };
    const tables = (truncate.relations ?? [])
      .map(r => r.RangeVar?.relname)
      .filter((n): n is string => !!n);
    const target = tables.length > 0 ? tables.join(', ') : 'table';
    return warn('irreversible', `TRUNCATE ${target}`, `TRUNCATE empties ${target}. The rows are gone and no down migration brings them back.`);
  }

  if ('DeleteStmt' in stmt) {
    const del = stmt.DeleteStmt as { relation?: { relname?: string }; whereClause?: unknown };
    const table = del.relation?.relname ?? 'table';
    const unfiltered = del.whereClause == null;
    return warn(
      'irreversible',
      `DELETE FROM ${table}`,
      unfiltered
        ? `DELETE without a WHERE clause empties ${table}. The deleted rows cannot be restored by a down migration.`
        : `Deleted rows from ${table} cannot be restored by a down migration.`,
    );
  }

  if ('UpdateStmt' in stmt) {
    const update = stmt.UpdateStmt as { relation?: { relname?: string } };
    const table = update.relation?.relname ?? 'table';
    return warn(
      'care',
      `UPDATE ${table}`,
      `UPDATE overwrites values in ${table}. Backfilling a new column is undone by dropping it; overwriting an existing column is not.`,
    );
  }

  const insert = stmt.InsertStmt as { relation?: { relname?: string } };
  const table = insert.relation?.relname ?? 'table';
  return warn(
    'care',
    `INSERT INTO ${table}`,
    `Rows inserted into ${table} have to be deleted by hand — the down migration needs a WHERE clause you write.`,
  );
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
          reversibility: 'clean',
        };
      }
      break;
    }

    case 'AT_DropColumn': {
      const col = cmd.name;
      return {
        sql: `-- WARNING: Cannot auto-recreate dropped column.\n-- Original: ALTER TABLE ${table} DROP COLUMN ${col ?? 'unknown'};`,
        originalDescription: `DROP COLUMN ${col ?? 'unknown'} on ${table}`,
        reversibility: 'irreversible',
        reason: `Dropping ${table}.${col ?? 'unknown'} destroys that column's values. Re-adding the column gives you NULLs, not the data.`,
      };
    }

    case 'AT_SetNotNull': {
      const col = cmd.name;
      if (col) {
        return {
          sql: `ALTER TABLE ${table} ALTER COLUMN ${col} DROP NOT NULL;`,
          originalDescription: `SET NOT NULL on ${table}.${col}`,
          reversibility: 'clean',
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
          reversibility: 'care',
          reason: `Re-applying NOT NULL on ${table}.${col} fails if any row went NULL while the constraint was off.`,
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
            reversibility: 'clean',
          };
        }
        return {
          sql: `-- WARNING: Cannot auto-restore original DEFAULT value.\n-- Original: ALTER TABLE ${table} ALTER COLUMN ${col} DROP DEFAULT;`,
          originalDescription: `DROP DEFAULT on ${table}.${col}`,
          reversibility: 'care',
          reason: `The previous DEFAULT on ${table}.${col} is not recorded in this migration — read it out of the schema before you drop it.`,
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
          reversibility: 'clean',
        };
      }
      break;
    }

    case 'AT_DropConstraint': {
      const constraintName = cmd.name;
      return {
        sql: `-- WARNING: Cannot auto-recreate dropped constraint.\n-- Original: ALTER TABLE ${table} DROP CONSTRAINT ${constraintName ?? 'unknown'};`,
        originalDescription: `DROP CONSTRAINT ${constraintName ?? 'unknown'} on ${table}`,
        reversibility: 'care',
        reason: `The definition of ${constraintName ?? 'the constraint'} is not in this migration, and re-adding it fails if rows violating it were written meanwhile.`,
      };
    }

    case 'AT_AlterColumnType': {
      const col = cmd.name;
      const narrowedTo = narrowingTargetType(cmd.def);
      return {
        sql: `-- WARNING: Cannot auto-reverse column type change (original type unknown).\n-- Original: ALTER TABLE ${table} ALTER COLUMN ${col ?? 'unknown'} TYPE ...;`,
        originalDescription: `ALTER COLUMN TYPE on ${table}.${col ?? 'unknown'}`,
        reversibility: narrowedTo ? 'irreversible' : 'care',
        reason: narrowedTo
          ? `Narrowing ${table}.${col ?? 'unknown'} to ${narrowedTo} truncates values that no longer fit, and the original values are unrecoverable. See MP044.`
          : `The original type of ${table}.${col ?? 'unknown'} is not recorded in this migration, so the reverse cast has to be written by hand.`,
      };
    }
  }

  // Fallback: check SQL text for common patterns
  const upper = originalSql.toUpperCase();
  if (upper.includes('ENABLE ROW LEVEL SECURITY')) {
    return {
      sql: `ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY;`,
      originalDescription: `ENABLE ROW LEVEL SECURITY on ${table}`,
      reversibility: 'clean',
    };
  }
  if (upper.includes('DISABLE ROW LEVEL SECURITY')) {
    return {
      sql: `ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`,
      originalDescription: `DISABLE ROW LEVEL SECURITY on ${table}`,
      reversibility: 'clean',
    };
  }

  return null;
}

/**
 * Narrower target types for ALTER COLUMN TYPE.
 *
 * Same signal MP044 reports at statement level: the AST only carries the new
 * type, so a small integer/float target is treated as a narrowing. A length-
 * capped character type is the other common truncating target.
 * Returns the display name of the target type, or null when it is not narrowing.
 */
function narrowingTargetType(def: Record<string, unknown> | undefined): string | null {
  const colDef = def?.ColumnDef as {
    typeName?: { names?: Array<{ String?: { sval: string } }>; typmods?: unknown[] };
  } | undefined;
  const names = colDef?.typeName?.names;
  if (!names) return null;

  const typeNames = names
    .map(n => n.String?.sval)
    .filter((n): n is string => !!n && n !== 'pg_catalog');

  const narrow = typeNames.find(n =>
    ['int2', 'smallint', 'int4', 'integer', 'float4', 'real'].includes(n),
  );
  if (narrow) return narrow.toUpperCase();

  // varchar(n) / char(n) — a length cap truncates on the way in
  const capped = typeNames.find(n => ['varchar', 'bpchar'].includes(n));
  if (capped && (colDef?.typeName?.typmods?.length ?? 0) > 0) {
    return capped === 'bpchar' ? 'CHAR(n)' : 'VARCHAR(n)';
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
      reversibility: 'clean',
    };
  }

  // RENAME COLUMN
  if (upper.includes('RENAME COLUMN') || (rename.subname && rename.newname)) {
    const table = qualifiedName(rename.relation?.schemaname, rename.relation?.relname);
    if (table) {
      return {
        sql: `ALTER TABLE ${table} RENAME COLUMN ${newName} TO ${oldName};`,
        originalDescription: `RENAME COLUMN ${oldName} → ${newName} on ${table}`,
        reversibility: 'clean',
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
    reversibility: 'clean',
  };
}

function reverseAlterEnum(originalSql: string): RollbackStatement | null {
  const upper = originalSql.toUpperCase();
  if (upper.includes('ADD VALUE')) {
    return {
      sql: `-- WARNING: PostgreSQL does not support removing enum values.\n-- Original: ${originalSql.trim()}\n-- Manual intervention required: create new type without the value, migrate data, drop old type.`,
      originalDescription: 'ALTER TYPE ADD VALUE',
      reversibility: 'care',
      reason: 'PostgreSQL cannot remove an enum value. Undoing it means creating a new type without the value, migrating every column, and dropping the old type.',
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
        reversibility: 'clean',
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
    reversibility: 'clean',
  };
}

function reverseCreateSchema(stmt: Record<string, unknown>): RollbackStatement | null {
  const schema = stmt.CreateSchemaStmt as { schemaname?: string };
  if (!schema.schemaname) return null;
  return {
    sql: `DROP SCHEMA IF EXISTS ${schema.schemaname};`,
    originalDescription: `CREATE SCHEMA ${schema.schemaname}`,
    reversibility: 'clean',
  };
}

function reverseCreateSequence(stmt: Record<string, unknown>): RollbackStatement | null {
  const seq = stmt.CreateSeqStmt as { sequence?: { relname?: string; schemaname?: string } };
  const name = qualifiedName(seq.sequence?.schemaname, seq.sequence?.relname);
  if (!name) return null;
  return {
    sql: `DROP SEQUENCE IF EXISTS ${name};`,
    originalDescription: `CREATE SEQUENCE ${name}`,
    reversibility: 'clean',
  };
}

function reverseCreateView(stmt: Record<string, unknown>): RollbackStatement | null {
  const view = stmt.ViewStmt as { view?: { relname?: string; schemaname?: string } };
  const name = qualifiedName(view.view?.schemaname, view.view?.relname);
  if (!name) return null;
  return {
    sql: `DROP VIEW IF EXISTS ${name};`,
    originalDescription: `CREATE VIEW ${name}`,
    reversibility: 'clean',
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
