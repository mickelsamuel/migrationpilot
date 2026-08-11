/* ---
id: u17
category: unsafe
verdict: dangerous
hazards: [rename-table-breakage]
handbook: MPH-015
lock: ACCESS EXCLUSIVE
description: Same class as a column rename, one level up. Every query naming the old table starts failing the instant this commits, including queries in pods that have not been restarted yet.
--- */

SET lock_timeout = '2s';

ALTER TABLE invoices RENAME TO billing_documents;
