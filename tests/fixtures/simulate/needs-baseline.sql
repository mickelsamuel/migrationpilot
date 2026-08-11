-- Only runs against a database that already has `customers`. Without --schema
-- the first statement fails with "relation customers does not exist".
ALTER TABLE customers ADD COLUMN country_code text;

CREATE INDEX idx_customers_country_code ON customers (country_code);

UPDATE customers SET country_code = 'CA' WHERE country_code IS NULL;
