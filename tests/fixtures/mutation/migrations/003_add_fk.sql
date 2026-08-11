SET lock_timeout = '5s';
SET statement_timeout = '30s';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_notes_order_id ON order_notes (order_id);
ALTER TABLE order_notes ADD CONSTRAINT fk_order_notes_order
  FOREIGN KEY (order_id) REFERENCES orders (id)
  DEFERRABLE INITIALLY DEFERRED NOT VALID;
