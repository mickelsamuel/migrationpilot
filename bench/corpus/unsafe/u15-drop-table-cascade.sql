/* ---
id: u15
category: unsafe
verdict: dangerous
hazards: [drop-table-cascade]
handbook: MPH-014
lock: ACCESS EXCLUSIVE
description: CASCADE destroys every view, foreign key and trigger that depended on the table, and reports what it destroyed only in NOTICE output that most migration runners discard.
--- */

SET lock_timeout = '2s';

DROP TABLE orders CASCADE;
