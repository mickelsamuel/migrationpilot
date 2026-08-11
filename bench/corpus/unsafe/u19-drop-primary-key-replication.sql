/* ---
id: u19
category: unsafe
verdict: dangerous
hazards: [replication-identity-break]
handbook: MPH-017
lock: ACCESS EXCLUSIVE
description: On a table in a publication, dropping the primary key leaves REPLICA IDENTITY DEFAULT pointing at nothing. Every subsequent UPDATE and DELETE fails. Replica identity has to be repointed first.
--- */

SET lock_timeout = '2s';

ALTER TABLE orders DROP CONSTRAINT orders_pkey;
