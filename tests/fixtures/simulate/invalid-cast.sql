-- integer -> uuid is not a cast PostgreSQL knows how to make. Nothing about the
-- statement is syntactically wrong, so only running it finds this.
CREATE TABLE payments (
  id serial PRIMARY KEY,
  reference integer NOT NULL
);

ALTER TABLE payments ALTER COLUMN reference TYPE uuid USING reference::uuid;

CREATE INDEX idx_payments_reference ON payments (reference);
