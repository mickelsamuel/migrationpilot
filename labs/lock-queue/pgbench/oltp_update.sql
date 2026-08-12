-- Single-row write by primary key: the "record a login" update.
\set uid random(1, :range)
UPDATE users SET last_seen_at = now(), login_count = login_count + 1 WHERE id = :uid;
