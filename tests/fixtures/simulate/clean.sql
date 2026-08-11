-- A migration that should execute end to end without complaint.
CREATE TABLE audit_log (
  id bigserial PRIMARY KEY,
  actor text NOT NULL,
  action text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_created_at ON audit_log (created_at);

ALTER TABLE audit_log ADD COLUMN request_id uuid;

INSERT INTO audit_log (actor, action) VALUES ('system', 'bootstrap');
