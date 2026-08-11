-- Uses audit_log, which this deploy does not create until 004 (SQ004).
ALTER TABLE audit_log ADD COLUMN request_id text;
