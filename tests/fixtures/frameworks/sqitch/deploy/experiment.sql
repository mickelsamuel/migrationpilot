-- Deploy app:experiment to pg
-- Never added to sqitch.plan, so Sqitch will not deploy it.

BEGIN;

DROP TABLE app.users;

COMMIT;
