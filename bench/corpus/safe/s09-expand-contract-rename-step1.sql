/* ---
id: s09
category: safe
verdict: safe
hazards: []
handbook: MPH-015
counterpart: u16
description: The expand half of the expand/contract rename. A nullable column is added (metadata only) and a trigger keeps both names in sync in both directions, so old pods writing "email" and new pods writing "email_address" both work. No rename happens here.
--- */

SET lock_timeout = '2s';
ALTER TABLE users ADD COLUMN email_address text;

CREATE OR REPLACE FUNCTION users_sync_email() RETURNS trigger AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    NEW.email_address := NEW.email;
  ELSIF NEW.email_address IS DISTINCT FROM OLD.email_address THEN
    NEW.email := NEW.email_address;
  ELSE
    NEW.email_address := COALESCE(NEW.email_address, NEW.email);
    NEW.email         := COALESCE(NEW.email, NEW.email_address);
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

SET lock_timeout = '2s';
CREATE TRIGGER users_sync_email
  BEFORE INSERT OR UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION users_sync_email();
