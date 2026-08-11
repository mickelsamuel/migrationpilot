/* ---
id: s16
category: safe
verdict: safe
hazards: []
handbook: MPH-002
counterpart: u03
description: The safest DDL there is. A nullable column with no default is a catalog write; the ACCESS EXCLUSIVE lock is held for a millisecond, and lock_timeout bounds the wait to acquire it. If a tool flags this, it is flagging the act of altering a table.
--- */

SET lock_timeout = '2s';
SET statement_timeout = '30s';

ALTER TABLE users ADD COLUMN last_seen_at timestamptz;
