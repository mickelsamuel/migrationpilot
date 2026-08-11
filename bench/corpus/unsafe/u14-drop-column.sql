/* ---
id: u14
category: unsafe
verdict: dangerous
hazards: [drop-column]
handbook: MPH-013
lock: ACCESS EXCLUSIVE
description: The statement is instant. It breaks every pooled connection holding a cached plan for the table, and any view or SELECT * that still names the column.
--- */

SET lock_timeout = '2s';
SET statement_timeout = '30s';

ALTER TABLE users DROP COLUMN legacy_token;
