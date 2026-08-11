/* ---
id: s12
category: safe
verdict: safe
hazards: []
handbook: MPH-019
counterpart: u22
description: The handbook's safe form for MPH-019 on PostgreSQL 14 and later. CONCURRENTLY avoids the ACCESS EXCLUSIVE on the parent that would otherwise block reads and writes across every partition. Runs outside a transaction block.
--- */

-- Transaction wrapper disabled: DETACH ... CONCURRENTLY cannot run inside one.

SET lock_timeout = '5s';

ALTER TABLE events DETACH PARTITION events_2025_01 CONCURRENTLY;
