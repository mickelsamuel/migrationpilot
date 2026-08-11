/* ---
id: s13
category: safe
verdict: safe
hazards: []
handbook: MPH-020
counterpart: u24
description: The handbook's safe form for MPH-020. Subcommands are combined because they touch the same table, so this is one lock acquisition on one table, held for one metadata update. Both columns are nullable with no default, so there is no scan and no rewrite.
--- */

SET lock_timeout = '2s';
SET statement_timeout = '30s';

ALTER TABLE orders ADD COLUMN channel text, ADD COLUMN source text;
