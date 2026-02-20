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
 * Each phase uses proper lock_timeout, statement_timeout, and batch
 * processing to minimize production impact.
 */

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
      return generateRenameColumn(opts);
    case 'change-type':
      return generateChangeType(opts);
    case 'split-table':
      return generateSplitTable(opts);
    case 'add-not-null':
      return generateAddNotNull(opts);
    case 'remove-column':
      return generateRemoveColumn(opts);
  }
}

// ---------------------------------------------------------------------------
// Template generators
// ---------------------------------------------------------------------------

function generateRenameColumn(opts: TemplateOpts): MigrationTemplate {
  const { table, column = 'old_column', newName = 'new_column' } = opts;

  return {
    name: `Rename column ${table}.${column} to ${newName}`,
    description: [
      `Safely renames "${column}" to "${newName}" on table "${table}" without downtime.`,
      'Phase 1 adds the new column and a trigger to keep both in sync.',
      'Phase 2 backfills existing rows in batches.',
      'Phase 3 drops the old column and trigger once all application code uses the new name.',
    ].join(' '),

    expand: [
      `-- Phase 1: Expand — Add new column and sync trigger`,
      `-- Deploy this BEFORE updating application code.`,
      ``,
      `SET lock_timeout = '5s';`,
      `SET statement_timeout = '30s';`,
      ``,
      `-- Add new column (nullable, no default — instant on PG 11+)`,
      `ALTER TABLE ${table} ADD COLUMN ${newName} TEXT;`,
      ``,
      `-- Create trigger to keep new column in sync with old column`,
      `CREATE OR REPLACE FUNCTION ${table}_sync_${column}_to_${newName}()`,
      `RETURNS TRIGGER AS $$`,
      `BEGIN`,
      `  NEW.${newName} := NEW.${column};`,
      `  RETURN NEW;`,
      `END;`,
      `$$ LANGUAGE plpgsql;`,
      ``,
      `CREATE TRIGGER trg_sync_${column}_to_${newName}`,
      `  BEFORE INSERT OR UPDATE ON ${table}`,
      `  FOR EACH ROW`,
      `  EXECUTE FUNCTION ${table}_sync_${column}_to_${newName}();`,
    ].join('\n'),

    migrate: [
      `-- Phase 2: Migrate — Backfill existing data in batches`,
      `-- Run this after deploying the expand phase.`,
      ``,
      `SET statement_timeout = '0';  -- Batch updates may take a while`,
      ``,
      `DO $$`,
      `DECLARE`,
      `  batch_size INT := 10000;`,
      `  rows_updated INT;`,
      `BEGIN`,
      `  LOOP`,
      `    UPDATE ${table}`,
      `    SET ${newName} = ${column}`,
      `    WHERE ${newName} IS NULL`,
      `      AND ctid IN (`,
      `        SELECT ctid FROM ${table}`,
      `        WHERE ${newName} IS NULL`,
      `        LIMIT batch_size`,
      `      );`,
      ``,
      `    GET DIAGNOSTICS rows_updated = ROW_COUNT;`,
      `    EXIT WHEN rows_updated = 0;`,
      ``,
      `    -- Brief pause to let other queries through`,
      `    PERFORM pg_sleep(0.1);`,
      ``,
      `    RAISE NOTICE 'Backfilled % rows', rows_updated;`,
      `  END LOOP;`,
      `END $$;`,
    ].join('\n'),

    contract: [
      `-- Phase 3: Contract — Remove old column and sync trigger`,
      `-- Deploy this AFTER all application code uses the new column name.`,
      ``,
      `SET lock_timeout = '5s';`,
      `SET statement_timeout = '30s';`,
      ``,
      `-- Drop the sync trigger`,
      `DROP TRIGGER IF EXISTS trg_sync_${column}_to_${newName} ON ${table};`,
      `DROP FUNCTION IF EXISTS ${table}_sync_${column}_to_${newName}();`,
      ``,
      `-- Drop old column`,
      `ALTER TABLE ${table} DROP COLUMN IF EXISTS ${column};`,
    ].join('\n'),
  };
}

function generateChangeType(opts: TemplateOpts): MigrationTemplate {
  const { table, column = 'target_column', newType = 'bigint' } = opts;
  const tempColumn = `${column}_new`;

  return {
    name: `Change type of ${table}.${column} to ${newType}`,
    description: [
      `Safely changes the type of "${column}" from its current type to "${newType}" on table "${table}".`,
      'Phase 1 adds a new column with the target type and a sync trigger.',
      'Phase 2 backfills the new column by casting existing values in batches.',
      'Phase 3 swaps the columns and drops the old one.',
    ].join(' '),

    expand: [
      `-- Phase 1: Expand — Add new column with target type`,
      `-- Deploy this BEFORE updating application code.`,
      ``,
      `SET lock_timeout = '5s';`,
      `SET statement_timeout = '30s';`,
      ``,
      `-- Add new column with target type`,
      `ALTER TABLE ${table} ADD COLUMN ${tempColumn} ${newType};`,
      ``,
      `-- Create trigger to keep new column in sync`,
      `CREATE OR REPLACE FUNCTION ${table}_sync_${column}_type()`,
      `RETURNS TRIGGER AS $$`,
      `BEGIN`,
      `  NEW.${tempColumn} := NEW.${column}::${newType};`,
      `  RETURN NEW;`,
      `END;`,
      `$$ LANGUAGE plpgsql;`,
      ``,
      `CREATE TRIGGER trg_sync_${column}_type`,
      `  BEFORE INSERT OR UPDATE ON ${table}`,
      `  FOR EACH ROW`,
      `  EXECUTE FUNCTION ${table}_sync_${column}_type();`,
    ].join('\n'),

    migrate: [
      `-- Phase 2: Migrate — Backfill with type cast in batches`,
      `-- Run this after deploying the expand phase.`,
      ``,
      `SET statement_timeout = '0';`,
      ``,
      `DO $$`,
      `DECLARE`,
      `  batch_size INT := 10000;`,
      `  rows_updated INT;`,
      `BEGIN`,
      `  LOOP`,
      `    UPDATE ${table}`,
      `    SET ${tempColumn} = ${column}::${newType}`,
      `    WHERE ${tempColumn} IS NULL`,
      `      AND ${column} IS NOT NULL`,
      `      AND ctid IN (`,
      `        SELECT ctid FROM ${table}`,
      `        WHERE ${tempColumn} IS NULL AND ${column} IS NOT NULL`,
      `        LIMIT batch_size`,
      `      );`,
      ``,
      `    GET DIAGNOSTICS rows_updated = ROW_COUNT;`,
      `    EXIT WHEN rows_updated = 0;`,
      ``,
      `    PERFORM pg_sleep(0.1);`,
      `    RAISE NOTICE 'Backfilled % rows', rows_updated;`,
      `  END LOOP;`,
      `END $$;`,
    ].join('\n'),

    contract: [
      `-- Phase 3: Contract — Swap columns and clean up`,
      `-- Deploy this AFTER all application code reads from the new column.`,
      ``,
      `SET lock_timeout = '5s';`,
      `SET statement_timeout = '30s';`,
      ``,
      `-- Drop the sync trigger`,
      `DROP TRIGGER IF EXISTS trg_sync_${column}_type ON ${table};`,
      `DROP FUNCTION IF EXISTS ${table}_sync_${column}_type();`,
      ``,
      `-- Drop old column and rename new one`,
      `ALTER TABLE ${table} DROP COLUMN ${column};`,
      `ALTER TABLE ${table} RENAME COLUMN ${tempColumn} TO ${column};`,
    ].join('\n'),
  };
}

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
      `-- Create the new table`,
      `CREATE TABLE IF NOT EXISTS ${newTable} (`,
      `  ${table}_id BIGINT PRIMARY KEY REFERENCES ${table}(id) ON DELETE CASCADE,`,
      `  ${column} TEXT`,
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
      ``,
      `SET statement_timeout = '0';`,
      ``,
      `DO $$`,
      `DECLARE`,
      `  batch_size INT := 10000;`,
      `  rows_inserted INT;`,
      `  last_id BIGINT := 0;`,
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
      `    PERFORM pg_sleep(0.1);`,
      `    RAISE NOTICE 'Migrated % rows (last_id=%)', rows_inserted, last_id;`,
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

function generateAddNotNull(opts: TemplateOpts): MigrationTemplate {
  const { table, column = 'target_column' } = opts;

  return {
    name: `Add NOT NULL constraint to ${table}.${column}`,
    description: [
      `Safely adds a NOT NULL constraint to "${column}" on table "${table}".`,
      'Phase 1 adds a CHECK constraint with NOT VALID to avoid a full table scan lock.',
      'Phase 2 validates the constraint (requires SHARE UPDATE EXCLUSIVE, not ACCESS EXCLUSIVE).',
      'Phase 3 sets NOT NULL using the validated constraint (instant on PG 12+) and cleans up.',
    ].join(' '),

    expand: [
      `-- Phase 1: Expand — Add NOT VALID check constraint`,
      `-- This only acquires a brief ACCESS EXCLUSIVE lock (no table scan).`,
      ``,
      `SET lock_timeout = '5s';`,
      `SET statement_timeout = '30s';`,
      ``,
      `ALTER TABLE ${table}`,
      `  ADD CONSTRAINT ${table}_${column}_not_null`,
      `  CHECK (${column} IS NOT NULL)`,
      `  NOT VALID;`,
    ].join('\n'),

    migrate: [
      `-- Phase 2: Migrate — Validate the constraint`,
      `-- This acquires SHARE UPDATE EXCLUSIVE (allows reads AND writes).`,
      `-- It performs a full table scan but does not block normal operations.`,
      ``,
      `SET statement_timeout = '0';  -- Validation may take time on large tables`,
      ``,
      `ALTER TABLE ${table}`,
      `  VALIDATE CONSTRAINT ${table}_${column}_not_null;`,
    ].join('\n'),

    contract: [
      `-- Phase 3: Contract — Set NOT NULL and remove check constraint`,
      `-- On PG 12+, SET NOT NULL is instant when a valid CHECK exists.`,
      ``,
      `SET lock_timeout = '5s';`,
      `SET statement_timeout = '30s';`,
      ``,
      `-- Set NOT NULL (instant with validated CHECK constraint on PG 12+)`,
      `ALTER TABLE ${table}`,
      `  ALTER COLUMN ${column} SET NOT NULL;`,
      ``,
      `-- Remove the now-redundant CHECK constraint`,
      `ALTER TABLE ${table}`,
      `  DROP CONSTRAINT ${table}_${column}_not_null;`,
    ].join('\n'),
  };
}

function generateRemoveColumn(opts: TemplateOpts): MigrationTemplate {
  const { table, column = 'target_column' } = opts;

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
      `-- (Only needed if the column contains large values)`,
      `/*`,
      `DO $$`,
      `DECLARE`,
      `  batch_size INT := 10000;`,
      `  rows_updated INT;`,
      `BEGIN`,
      `  LOOP`,
      `    UPDATE ${table}`,
      `    SET ${column} = NULL`,
      `    WHERE ${column} IS NOT NULL`,
      `      AND ctid IN (`,
      `        SELECT ctid FROM ${table}`,
      `        WHERE ${column} IS NOT NULL`,
      `        LIMIT batch_size`,
      `      );`,
      ``,
      `    GET DIAGNOSTICS rows_updated = ROW_COUNT;`,
      `    EXIT WHEN rows_updated = 0;`,
      ``,
      `    PERFORM pg_sleep(0.1);`,
      `    RAISE NOTICE 'Nullified % rows', rows_updated;`,
      `  END LOOP;`,
      `END $$;`,
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
