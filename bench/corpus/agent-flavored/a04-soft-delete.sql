/* ---
id: a04
category: agent-flavored
verdict: dangerous
hazards: [ddl-plus-backfill-same-txn, unbatched-backfill, set-not-null-scan]
handbook: MPH-016, MPH-018, MPH-003
description: The add-column / backfill / SET NOT NULL trio in one transaction. The ALTER takes ACCESS EXCLUSIVE, the UPDATE holds it across every row, and the SET NOT NULL scans the table again before COMMIT finally releases it.
--- */

-- Migration: add soft-delete support to documents
--
-- Adds a deleted_at column, backfills it for rows that were previously
-- hard-flagged via the is_deleted boolean, and then makes the new
-- is_archived column mandatory.

BEGIN;

ALTER TABLE documents ADD COLUMN deleted_at timestamptz;
ALTER TABLE documents ADD COLUMN is_archived boolean DEFAULT false;

-- Backfill from the legacy flag.
UPDATE documents
SET deleted_at = updated_at
WHERE is_deleted = true;

UPDATE documents
SET is_archived = false
WHERE is_archived IS NULL;

-- Now that every row has a value, make the column mandatory.
ALTER TABLE documents ALTER COLUMN is_archived SET NOT NULL;

COMMIT;
