/* ---
id: s03
category: safe
verdict: safe
hazards: []
handbook: MPH-005
counterpart: u04
pg_version: "18"
description: PostgreSQL 18's two-phase NOT NULL. The constraint row is written with convalidated=false under a brief ACCESS EXCLUSIVE and enforced against new rows immediately; VALIDATE then reads existing rows under SHARE UPDATE EXCLUSIVE. NOT VALID attaches to ADD CONSTRAINT, never to SET NOT NULL.
--- */

SET lock_timeout = '2s';
ALTER TABLE orders
  ADD CONSTRAINT orders_customer_id_nn NOT NULL customer_id NOT VALID;

ALTER TABLE orders VALIDATE CONSTRAINT orders_customer_id_nn;
