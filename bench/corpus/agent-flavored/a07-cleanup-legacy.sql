/* ---
id: a07
category: agent-flavored
verdict: dangerous
hazards: [drop-table-cascade, drop-column, rename-column-breakage]
handbook: MPH-014, MPH-013, MPH-015
description: A cleanup migration, the genre most likely to be written by an agent asked to "remove the old stuff". CASCADE takes out whatever depended on the table, the dropped column breaks cached plans, and the rename breaks every pod that has not been restarted.
--- */

-- Migration: clean up legacy tables and columns
--
-- The v1 API has been retired. This migration removes the tables and columns
-- that only it used, and renames one column to match the new naming
-- convention.

-- Remove the retired tables. CASCADE handles the dependent views for us.
DROP TABLE IF EXISTS legacy_sessions CASCADE;
DROP TABLE IF EXISTS legacy_api_keys CASCADE;

-- Remove columns that only the v1 API read.
ALTER TABLE users DROP COLUMN IF EXISTS api_v1_token;
ALTER TABLE users DROP COLUMN IF EXISTS api_v1_secret;

-- Rename for consistency with the new convention.
ALTER TABLE users RENAME COLUMN signup_source TO acquisition_channel;
