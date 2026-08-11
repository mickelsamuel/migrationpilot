-- Depends on 001 having run. Each file is valid on its own; only applying them
-- in order against one database proves the pair works.
ALTER TABLE projects ADD COLUMN owner_id integer;

CREATE INDEX idx_projects_owner_id ON projects (owner_id);
