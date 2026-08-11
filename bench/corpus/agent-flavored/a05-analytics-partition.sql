/* ---
id: a05
category: agent-flavored
verdict: dangerous
hazards: [partition-attach, non-concurrent-index]
handbook: MPH-019, MPH-001
description: Monthly partition rollover written by an agent. The partition is created and populated, then attached without a pre-validated CHECK, so ATTACH scans it under ACCESS EXCLUSIVE on the parent and the default partition. Indexes are then built inline.
--- */

-- Migration: create the September 2026 events partition
--
-- Creates next month's partition, moves the rows that landed in the default
-- partition into it, attaches it, and adds the standard indexes.

CREATE TABLE IF NOT EXISTS events_2026_09 (LIKE events INCLUDING DEFAULTS INCLUDING CONSTRAINTS);

-- Move the misfiled rows out of the default partition.
INSERT INTO events_2026_09
SELECT * FROM events_default
WHERE created_at >= '2026-09-01' AND created_at < '2026-10-01';

DELETE FROM events_default
WHERE created_at >= '2026-09-01' AND created_at < '2026-10-01';

-- Attach it to the parent.
ALTER TABLE events ATTACH PARTITION events_2026_09
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');

-- Standard indexes for this partition.
CREATE INDEX IF NOT EXISTS idx_events_2026_09_account ON events_2026_09 (account_id);
CREATE INDEX IF NOT EXISTS idx_events_2026_09_type    ON events_2026_09 (event_type, created_at);
