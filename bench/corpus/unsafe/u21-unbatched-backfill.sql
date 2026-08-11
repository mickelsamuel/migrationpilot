/* ---
id: u21
category: unsafe
verdict: dangerous
hazards: [unbatched-backfill]
handbook: MPH-018
lock: ROW EXCLUSIVE
description: One transaction over every row. Unbounded WAL, replicas fall behind, autovacuum cannot reclaim anything until it commits, and if it dies at 90 percent there is no progress to resume from.
--- */

SET statement_timeout = '0';

UPDATE orders SET region = lookup_region(country_code);
