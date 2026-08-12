SET lock_timeout = '5s';

DROP INDEX CONCURRENTLY IF EXISTS idx_order_notes_order_id;
CREATE INDEX CONCURRENTLY idx_order_notes_order_id ON order_notes (order_id);
ALTER TABLE order_notes ADD CONSTRAINT fk_order_notes_order
  FOREIGN KEY (order_id) REFERENCES orders (id)
  DEFERRABLE INITIALLY DEFERRED NOT VALID;
