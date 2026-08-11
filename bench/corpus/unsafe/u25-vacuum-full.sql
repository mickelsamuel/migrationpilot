/* ---
id: u25
category: unsafe
verdict: dangerous
hazards: [access-exclusive-maintenance]
handbook: MPH-002
lock: ACCESS EXCLUSIVE
description: VACUUM FULL rewrites the table into a fresh relfilenode under ACCESS EXCLUSIVE, so the table is unavailable for the whole rewrite. Named in the handbook alongside TRUNCATE, REINDEX and CLUSTER as ACCESS EXCLUSIVE takers.
--- */

VACUUM FULL orders;
