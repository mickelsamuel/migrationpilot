-- Point lookup by primary key. The bread-and-butter read of any users table.
\set uid random(1, :range)
SELECT id, email, display_name, status, last_seen_at FROM users WHERE id = :uid;
