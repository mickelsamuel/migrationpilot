/* ---
id: u23
category: unsafe
verdict: dangerous
hazards: [partition-attach]
handbook: MPH-019
lock: ACCESS EXCLUSIVE
description: ATTACH scans the incoming partition to prove every row satisfies the bound, holding ACCESS EXCLUSIVE on it and on the default partition. A pre-validated CHECK matching the bound lets PostgreSQL skip the scan.
--- */

SET lock_timeout = '5s';

ALTER TABLE events ATTACH PARTITION events_2026_09
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
