/* ---
id: a03
category: agent-flavored
verdict: dangerous
hazards: [multi-table-ddl-transaction, fk-without-not-valid, non-concurrent-index]
handbook: MPH-020, MPH-008, MPH-001
description: One transaction touching four existing tables, with a foreign key added to a large existing table without NOT VALID and three inline indexes. Locks on every table accumulate and are held until COMMIT.
--- */

-- Migration: introduce multi-tenancy
--
-- Adds a tenant_id to the core tables and wires up the foreign keys and
-- indexes needed for tenant-scoped queries. Everything runs in a single
-- transaction so that a partial failure cannot leave the schema in a
-- half-migrated state.

BEGIN;

CREATE TABLE IF NOT EXISTS tenants (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug        text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE users    ADD COLUMN IF NOT EXISTS tenant_id bigint;
ALTER TABLE orders   ADD COLUMN IF NOT EXISTS tenant_id bigint;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tenant_id bigint;

-- Wire up referential integrity.
ALTER TABLE users
  ADD CONSTRAINT users_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id);
ALTER TABLE orders
  ADD CONSTRAINT orders_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id);

-- Indexes for tenant-scoped queries.
CREATE INDEX IF NOT EXISTS idx_users_tenant    ON users (tenant_id);
CREATE INDEX IF NOT EXISTS idx_orders_tenant   ON orders (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices (tenant_id);

COMMIT;
