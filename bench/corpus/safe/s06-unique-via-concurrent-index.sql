/* ---
id: s06
category: safe
verdict: safe
hazards: []
handbook: MPH-009
counterpart: u10
description: The handbook's safe form for MPH-009. Build the unique index without blocking writes, then adopt it as a named constraint. The ADD CONSTRAINT still takes ACCESS EXCLUSIVE but performs no scan, so it is a metadata update rather than an outage.
--- */

SET lock_timeout = '5s';
SET statement_timeout = '0';

DROP INDEX CONCURRENTLY IF EXISTS users_email_key;
CREATE UNIQUE INDEX CONCURRENTLY users_email_key ON users (email);

SET lock_timeout = '2s';
ALTER TABLE users
  ADD CONSTRAINT users_email_key UNIQUE USING INDEX users_email_key;
