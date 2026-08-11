-- Starting schema for --schema. Stands in for whatever production already has.
CREATE TABLE customers (
  id serial PRIMARY KEY,
  email text NOT NULL
);

CREATE UNIQUE INDEX idx_customers_email ON customers (email);
