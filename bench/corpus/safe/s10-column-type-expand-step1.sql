/* ---
id: s10
category: safe
verdict: safe
hazards: []
handbook: MPH-007
counterpart: u08
description: The expand half of the int-to-bigint shuffle. New column beside the old one (metadata only), a trigger keeping new writes in sync, and the replacement unique index built concurrently. No rewrite, no swap yet.
--- */

SET lock_timeout = '2s';
ALTER TABLE events ADD COLUMN id_new bigint;

CREATE OR REPLACE FUNCTION events_sync_id_new() RETURNS trigger AS $$
BEGIN
  NEW.id_new := NEW.id;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

SET lock_timeout = '2s';
CREATE TRIGGER events_sync_id_new
  BEFORE INSERT OR UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION events_sync_id_new();

SET lock_timeout = '5s';
DROP INDEX CONCURRENTLY IF EXISTS events_pkey_new;
CREATE UNIQUE INDEX CONCURRENTLY events_pkey_new ON events (id_new);
