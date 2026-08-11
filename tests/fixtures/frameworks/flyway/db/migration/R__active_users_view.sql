CREATE OR REPLACE VIEW active_users AS
SELECT id, email FROM users WHERE last_login_at > now() - interval '30 days';
