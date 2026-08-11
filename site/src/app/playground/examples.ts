/**
 * Preset migrations for the playground.
 *
 * The `hint` on each one is what the engine actually reports for that SQL on
 * PG 17, checked against the built bundle, so the labels stay honest.
 *
 * Deliberately no leading comments: libpg-query reports the first statement as
 * starting at offset 0, so anything above it gets folded into that statement's
 * text and shows up again inside the suggested rewrite.
 */

export interface Example {
  label: string;
  hint: string;
  sql: string;
}

export const EXAMPLES: Example[] = [
  {
    label: 'Unsafe index',
    hint: 'MP001 + 3 more',
    sql: `CREATE INDEX idx_users_email ON users (email);`,
  },
  {
    label: 'Foreign key',
    hint: 'MP005 + 4 more',
    sql: `ALTER TABLE orders
  ADD CONSTRAINT fk_orders_user
  FOREIGN KEY (user_id) REFERENCES users (id);`,
  },
  {
    label: 'Table rewrite',
    hint: '9 violations',
    sql: `ALTER TABLE orders ADD COLUMN status text NOT NULL DEFAULT 'pending';
ALTER TABLE orders ALTER COLUMN total TYPE numeric(12,2);
ALTER TABLE orders DROP COLUMN legacy_ref;`,
  },
  {
    label: 'Safe migration',
    hint: 'clean',
    sql: `SET lock_timeout = '5s';
SET statement_timeout = '30s';
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email ON users (email);`,
  },
];

export const DEFAULT_SQL = `CREATE INDEX idx_users_email ON users (email);

ALTER TABLE users ADD COLUMN bio VARCHAR(500) DEFAULT '';

ALTER TABLE orders DROP COLUMN legacy_field;`;
