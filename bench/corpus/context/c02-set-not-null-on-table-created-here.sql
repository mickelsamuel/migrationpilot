/* ---
id: c02
category: context
verdict: context-dependent
hazards: [set-not-null-scan]
handbook: MPH-003
safe_at: empty
description: SET NOT NULL on a table created three statements earlier. The scan is over zero rows, so the ACCESS EXCLUSIVE lock is held for microseconds and no other session can be waiting on a relation that did not exist when the transaction began. Detecting this requires tracking table creation within the file.
--- */

SET lock_timeout = '2s';

CREATE TABLE feature_flags (
  id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  key     text NOT NULL,
  enabled boolean
);

ALTER TABLE feature_flags ALTER COLUMN enabled SET NOT NULL;
