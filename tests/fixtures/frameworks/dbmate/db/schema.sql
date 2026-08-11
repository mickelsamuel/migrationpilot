-- dbmate writes this schema dump after each migration run.
-- It has no migrate:up marker, so it is not a migration.
CREATE TABLE public.schema_migrations (version character varying(255) NOT NULL);
