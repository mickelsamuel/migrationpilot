/* ---
id: u26
category: unsafe
verdict: dangerous
hazards: [truncate-cascade]
handbook: MPH-014
lock: ACCESS EXCLUSIVE
description: TRUNCATE takes ACCESS EXCLUSIVE, and CASCADE silently truncates every table with a foreign key pointing at this one. The blast radius is reported in NOTICE output the migration runner throws away.
--- */

SET lock_timeout = '2s';

TRUNCATE TABLE sessions CASCADE;
