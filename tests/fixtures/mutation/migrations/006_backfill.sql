SET lock_timeout = '5s';
SET statement_timeout = '30s';

UPDATE orders SET status = 'archived' WHERE created_at < '2020-01-01';
DELETE FROM order_events WHERE created_at < '2020-01-01';
