/* ---
id: c03
category: context
verdict: context-dependent
hazards: [column-type-rewrite]
handbook: MPH-007
safe_at: any
description: Increasing a varchar length does not rewrite the table; PostgreSQL 9.2 and later recognise that the existing values still fit and only update the catalog. The statement shape is identical to the int-to-bigint rewrite in u08, so a tool that matches on ALTER COLUMN TYPE alone will flag it. Still ACCESS EXCLUSIVE, still briefly.
--- */

SET lock_timeout = '2s';

ALTER TABLE customers ALTER COLUMN company_name TYPE varchar(255);
