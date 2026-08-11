/* ---
id: u22
category: unsafe
verdict: dangerous
hazards: [partition-detach]
handbook: MPH-019
lock: ACCESS EXCLUSIVE
description: A plain DETACH takes ACCESS EXCLUSIVE on the parent, which blocks reads and writes across every partition, not only the one being detached. PG 14+ has DETACH ... CONCURRENTLY.
--- */

SET lock_timeout = '5s';

ALTER TABLE events DETACH PARTITION events_2025_01;
