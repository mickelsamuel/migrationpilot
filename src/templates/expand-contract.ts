/**
 * Expand-contract migration template generator.
 *
 * Generates 3-phase migration templates for common schema operations that
 * require zero-downtime deployments. The expand-contract pattern ensures
 * safe rollout by:
 *
 *   1. **Expand** — Add new structures alongside old ones.
 *   2. **Migrate** — Copy/transform data from old to new (in batches).
 *   3. **Contract** — Remove old structures once fully migrated.
 *
 * The SQL itself lives in `choreography.ts`, shared with `migrationpilot
 * plan-fix`, which renders the same steps as a numbered plan with lock notes
 * and deploy boundaries. This module is the phase-grouped view of it.
 *
 * Each phase uses proper lock_timeout, statement_timeout, and batch
 * processing to minimize production impact.
 */

import {
  addNotNullChoreography,
  changeTypeChoreography,
  renameColumnChoreography,
  batchedUpdateSql,
  renderPhase,
} from './choreography.js';
import type { Choreography } from './choreography.js';

export interface MigrationTemplate {
  /** Template name describing the operation. */
  name: string;
  /** Phase 1: Expand SQL — add new structures. */
  expand: string;
  /** Phase 2: Migrate SQL — copy/transform data. */
  migrate: string;
  /** Phase 3: Contract SQL — remove old structures. */
  contract: string;
  /** Human-readable description of the migration strategy. */
  description: string;
}

type OperationType =
  | 'rename-column'
  | 'change-type'
  | 'split-table'
  | 'add-not-null'
  | 'remove-column';

interface TemplateOpts {
  /** Target table name. */
  table: string;
  /** Column to operate on. */
  column?: string;
  /** New column name (for rename operations). */
  newName?: string;
  /** New column type (for type change operations). */
  newType?: string;
  /**
   * Type of the column being renamed. Defaults to TEXT, which is only right
   * when the source column is TEXT — the emitted SQL says so.
   */
  columnType?: string;
  /** Target PostgreSQL version. Changes the add-not-null strategy. */
  pgVersion?: number;
}

/**
 * Generate a 3-phase expand-contract migration template for the specified
 * operation. Each template includes proper timeouts, batch processing,
 * and safe DDL patterns.
 *
 * @param operation - The type of schema change to perform.
 * @param opts - Options specifying the table, column, and target values.
 * @returns A complete 3-phase migration template.
 */
export function generateTemplate(
  operation: OperationType,
  opts: TemplateOpts,
): MigrationTemplate {
  switch (operation) {
    case 'rename-column':
      return fromChoreography(renameColumnChoreography({
        table: opts.table,
        column: opts.column ?? 'old_column',
        newName: opts.newName ?? 'new_column',
        columnType: opts.columnType ?? 'TEXT',
        pgVersion: opts.pgVersion,
      }));
    case 'change-type':
      return fromChoreography(changeTypeChoreography({
        table: opts.table,
        column: opts.column ?? 'target_column',
        newType: opts.newType ?? 'bigint',
        pgVersion: opts.pgVersion,
        strategy: 'swap',
      }));
    case 'add-not-null':
      return fromChoreography(addNotNullChoreography({
        table: opts.table,
        column: opts.column ?? 'target_column',
        pgVersion: opts.pgVersion,
      }));
    case 'split-table':
      return generateSplitTable(opts);
    case 'remove-column':
      return generateRemoveColumn(opts);
  }
}

/** Group a choreography's steps into the three phases. */
function fromChoreography(choreography: Choreography): MigrationTemplate {
  return {
    name: choreography.name,
    description: choreography.description,
    expand: renderPhase(choreography, 'expand'),
    migrate: renderPhase(choreography, 'migrate'),
    contract: renderPhase(choreography, 'contract'),
  };
}

// ---------------------------------------------------------------------------
// Operations with no violation driving them, so no plan-fix counterpart yet
// ---------------------------------------------------------------------------

function generateSplitTable(opts: TemplateOpts): MigrationTemplate {
  const { table, column = 'data' } = opts;
  const newTable = `${table}_${column}`;

  return {
    name: `Split column ${table}.${column} into ${newTable}`,
    description: [
      `Safely splits "${column}" from table "${table}" into a new table "${newTable}".`,
      'Phase 1 creates the new table and a trigger to keep it populated.',
      'Phase 2 backfills the new table from existing rows.',
      'Phase 3 drops the original column once all queries use the new table.',
    ].join(' '),

    expand: [
      `-- Phase 1: Expand — Create new table and sync trigger`,
      `-- Deploy this BEFORE updating application code.`,
      ``,
      `SET lock_timeout = '5s';`,
      `SET statement_timeout = '30s';`,
      ``,
      `-- Create the new table.`,
      `-- Assumes ${table} has a bigint "id" primary key — adjust if it does not.`,
      `CREATE TABLE IF NOT EXISTS ${newTable} (`,
      `  ${table}_id BIGINT PRIMARY KEY REFERENCES ${table}(id) ON DELETE CASCADE,`,
      `  ${column} TEXT  -- match the type of ${table}.${column}`,
      `);`,
      ``,
      `-- Create trigger to auto-populate new table on insert/update`,
      `CREATE OR REPLACE FUNCTION ${table}_sync_${column}_split()`,
      `RETURNS TRIGGER AS $$`,
      `BEGIN`,
      `  INSERT INTO ${newTable} (${table}_id, ${column})`,
      `  VALUES (NEW.id, NEW.${column})`,
      `  ON CONFLICT (${table}_id)`,
      `  DO UPDATE SET ${column} = EXCLUDED.${column};`,
      `  RETURN NEW;`,
      `END;`,
      `$$ LANGUAGE plpgsql;`,
      ``,
      `CREATE TRIGGER trg_sync_${column}_split`,
      `  AFTER INSERT OR UPDATE ON ${table}`,
      `  FOR EACH ROW`,
      `  EXECUTE FUNCTION ${table}_sync_${column}_split();`,
    ].join('\n'),

    migrate: [
      `-- Phase 2: Migrate — Backfill new table in batches`,
      `-- Run this after deploying the expand phase.`,
      `-- Must not run inside a transaction block — the COMMIT below needs to be real.`,
      ``,
      `SET lock_timeout = '5s';`,
      ``,
      `DO $$`,
      `DECLARE`,
      `  batch_size CONSTANT int := 10000;`,
      `  rows_inserted int;`,
      `  last_id bigint := 0;`,
      `BEGIN`,
      `  LOOP`,
      `    INSERT INTO ${newTable} (${table}_id, ${column})`,
      `    SELECT id, ${column}`,
      `    FROM ${table}`,
      `    WHERE id > last_id`,
      `    ORDER BY id`,
      `    LIMIT batch_size`,
      `    ON CONFLICT (${table}_id) DO NOTHING;`,
      ``,
      `    GET DIAGNOSTICS rows_inserted = ROW_COUNT;`,
      `    EXIT WHEN rows_inserted = 0;`,
      ``,
      `    SELECT MAX(${table}_id) INTO last_id FROM ${newTable} WHERE ${table}_id > last_id;`,
      ``,
      `    -- Commit each batch, or the whole backfill is one transaction that`,
      `    -- holds its locks and WAL to the very end.`,
      `    COMMIT;`,
      `    PERFORM pg_sleep(0.1);`,
      `  END LOOP;`,
      `END $$;`,
    ].join('\n'),

    contract: [
      `-- Phase 3: Contract — Remove original column and trigger`,
      `-- Deploy this AFTER all application code reads from the new table.`,
      ``,
      `SET lock_timeout = '5s';`,
      `SET statement_timeout = '30s';`,
      ``,
      `-- Drop the sync trigger`,
      `DROP TRIGGER IF EXISTS trg_sync_${column}_split ON ${table};`,
      `DROP FUNCTION IF EXISTS ${table}_sync_${column}_split();`,
      ``,
      `-- Drop the original column`,
      `ALTER TABLE ${table} DROP COLUMN IF EXISTS ${column};`,
    ].join('\n'),
  };
}

function generateRemoveColumn(opts: TemplateOpts): MigrationTemplate {
  const { table, column = 'target_column' } = opts;
  const pgVersion = opts.pgVersion ?? 17;

  return {
    name: `Remove column ${table}.${column}`,
    description: [
      `Safely removes "${column}" from table "${table}" without downtime.`,
      'Phase 1 makes the column nullable and drops its default so new writes ignore it.',
      'Phase 2 updates application code to stop reading/writing the column (no SQL needed).',
      'Phase 3 drops the column from the table.',
    ].join(' '),

    expand: [
      `-- Phase 1: Expand — Make column optional`,
      `-- Deploy this BEFORE updating application code.`,
      `-- This ensures existing queries don't fail if the column has a NOT NULL constraint.`,
      ``,
      `SET lock_timeout = '5s';`,
      `SET statement_timeout = '30s';`,
      ``,
      `-- Remove NOT NULL constraint (if present)`,
      `ALTER TABLE ${table}`,
      `  ALTER COLUMN ${column} DROP NOT NULL;`,
      ``,
      `-- Remove default value (if present) so new rows don't populate it`,
      `ALTER TABLE ${table}`,
      `  ALTER COLUMN ${column} DROP DEFAULT;`,
    ].join('\n'),

    migrate: [
      `-- Phase 2: Migrate — Update application code`,
      `-- No SQL needed in this phase.`,
      `--`,
      `-- 1. Update all SELECT queries to stop reading "${column}".`,
      `-- 2. Update all INSERT/UPDATE queries to stop writing "${column}".`,
      `-- 3. Deploy the application changes.`,
      `-- 4. Monitor for any errors related to the column.`,
      `-- 5. Wait for at least one full deployment cycle before proceeding.`,
      ``,
      `-- Optional: Set column to NULL for all rows to reclaim TOAST storage`,
      `-- (Only needed if the column contains large values.)`,
      `/*`,
      batchedUpdateSql(table, `${column} = NULL`, `${column} IS NOT NULL`, pgVersion),
      `*/`,
    ].join('\n'),

    contract: [
      `-- Phase 3: Contract — Drop the column`,
      `-- Deploy this AFTER confirming no application code references the column.`,
      ``,
      `SET lock_timeout = '5s';`,
      `SET statement_timeout = '30s';`,
      ``,
      `ALTER TABLE ${table} DROP COLUMN IF EXISTS ${column};`,
    ].join('\n'),
  };
}
