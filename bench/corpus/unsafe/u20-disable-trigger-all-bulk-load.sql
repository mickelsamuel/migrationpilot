/* ---
id: u20
category: unsafe
verdict: dangerous
hazards: [disable-trigger-all]
handbook: MPH-017
lock: ACCESS EXCLUSIVE
description: TRIGGER ALL disables the internal triggers that enforce foreign keys, not just user triggers. The load can insert referentially invalid rows and nothing re-checks them afterwards. DISABLE TRIGGER USER is the narrow form.
--- */

SET lock_timeout = '2s';

ALTER TABLE orders DISABLE TRIGGER ALL;

COPY orders FROM '/tmp/bulk.csv' WITH (FORMAT csv, HEADER true);

ALTER TABLE orders ENABLE TRIGGER ALL;
