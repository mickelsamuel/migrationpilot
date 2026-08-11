/* ---
id: s04
category: safe
verdict: safe
hazards: []
handbook: MPH-006
counterpart: u06
description: A non-volatile DEFAULT is evaluated once and stored in pg_attribute.attmissingval, then materialised on read. No heap pages are touched. Safe as written on PostgreSQL 11 and later, which the handbook states explicitly.
--- */

SET lock_timeout = '2s';
SET statement_timeout = '30s';

ALTER TABLE orders ADD COLUMN status text NOT NULL DEFAULT 'pending';
