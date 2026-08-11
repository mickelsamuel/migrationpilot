-- Third file in this deploy to take a blocking lock on users (SQ002), and the
-- one that makes the deploy irreversible: the column's values are gone.
ALTER TABLE users DROP COLUMN legacy_notes;
