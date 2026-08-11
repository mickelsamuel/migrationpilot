/* ---
id: s08
category: safe
verdict: safe
hazards: []
handbook: MPH-018
counterpart: u21
description: The handbook's safe form for MPH-018. One bounded batch, run repeatedly by the driver loop until it reports zero rows. Each execution is its own short transaction, so locks are brief, WAL is bounded and a failure is resumable. The partial index makes finding the next batch cheap.
--- */

SET lock_timeout = '2s';
SET statement_timeout = '30s';

UPDATE orders SET region = lookup_region(country_code)
WHERE id IN (
  SELECT id FROM orders
  WHERE region IS NULL
  ORDER BY id
  LIMIT 5000
);
