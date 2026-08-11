/* ---
id: u03
category: unsafe
verdict: dangerous
hazards: [missing-lock-timeout]
handbook: MPH-002
lock: ACCESS EXCLUSIVE
description: The DDL itself is instant. With no lock_timeout it parks at the head of the lock queue behind any running query and every later query queues behind it.
--- */

ALTER TABLE users ADD COLUMN age integer;
