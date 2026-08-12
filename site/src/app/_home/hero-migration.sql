ALTER TABLE orders
  ADD CONSTRAINT orders_amount_positive CHECK (amount > 0);

CREATE INDEX idx_orders_customer_id
  ON orders (customer_id);

ALTER TABLE users
  ALTER COLUMN email TYPE varchar(255);
