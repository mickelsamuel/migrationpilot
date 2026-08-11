/* ---
id: s14
category: safe
verdict: safe
hazards: []
handbook: n/a
description: A brand new table and its indexes. Nothing can be blocked because nothing else knows the relation exists yet, so the usual CONCURRENTLY and NOT VALID advice does not apply to any statement here. Classic false-positive bait for rules that pattern-match on statement shape alone.
--- */

SET lock_timeout = '2s';

CREATE TABLE webhook_deliveries (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  endpoint_id   bigint      NOT NULL REFERENCES webhook_endpoints (id),
  event_type    text        NOT NULL,
  payload       jsonb       NOT NULL,
  status        text        NOT NULL DEFAULT 'pending',
  attempts      integer     NOT NULL DEFAULT 0,
  delivered_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_webhook_deliveries_endpoint ON webhook_deliveries (endpoint_id, created_at DESC);
CREATE INDEX idx_webhook_deliveries_pending ON webhook_deliveries (created_at) WHERE status = 'pending';
