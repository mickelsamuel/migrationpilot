/* ---
id: a08
category: agent-flavored
verdict: safe
hazards: []
handbook: MPH-001, MPH-002, MPH-004
description: The same verbose agent voice, but the migration is correct. Timeouts are set, the index is concurrent and outside a transaction, the constraint is NOT VALID then validated separately, and the backfill is bounded. This is false-positive bait dressed in the style that usually signals trouble.
--- */

-- Migration: add a searchable slug to projects
--
-- This migration is deliberately split so that no statement holds a strong
-- lock while doing real work. The transaction wrapper is disabled because
-- CREATE INDEX CONCURRENTLY cannot run inside a transaction block.
--
-- Rails:   disable_ddl_transactions!
-- Django:  atomic = False
-- Alembic: with op.get_context().autocommit_block():

SET lock_timeout = '2s';
SET statement_timeout = '30s';

-- 1. Nullable column, no default. Catalog write only, no rewrite.
ALTER TABLE projects ADD COLUMN slug text;

-- 2. New rows get a value from the application; existing rows are filled in
--    by the batched backfill below, run repeatedly until it reports 0 rows.
UPDATE projects SET slug = lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'))
WHERE id IN (
  SELECT id FROM projects WHERE slug IS NULL ORDER BY id LIMIT 5000
);

-- 3. Declare the constraint without a scan. Enforced for new rows immediately.
ALTER TABLE projects
  ADD CONSTRAINT projects_slug_not_null CHECK (slug IS NOT NULL) NOT VALID;

-- 4. Verify existing rows under SHARE UPDATE EXCLUSIVE. Traffic continues.
ALTER TABLE projects VALIDATE CONSTRAINT projects_slug_not_null;

-- 5. Build the uniqueness index without blocking writes.
SET lock_timeout = '5s';
SET statement_timeout = '0';
DROP INDEX CONCURRENTLY IF EXISTS projects_slug_key;
CREATE UNIQUE INDEX CONCURRENTLY projects_slug_key ON projects (slug);
