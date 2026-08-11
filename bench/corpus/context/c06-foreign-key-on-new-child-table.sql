/* ---
id: c06
category: context
verdict: context-dependent
hazards: [fk-without-not-valid]
handbook: MPH-008
safe_at: empty
description: A foreign key added without NOT VALID to a table created in the same migration. The validation scan reads zero rows, so the SHARE ROW EXCLUSIVE on both tables is instant. The parent side is still locked, which on a very hot parent table is not free even briefly.
--- */

SET lock_timeout = '2s';

CREATE TABLE order_refunds (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id    bigint      NOT NULL,
  amount_cents bigint     NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE order_refunds
  ADD CONSTRAINT order_refunds_order_id_fkey
  FOREIGN KEY (order_id) REFERENCES orders (id);
