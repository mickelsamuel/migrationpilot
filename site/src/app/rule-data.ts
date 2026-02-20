export interface RuleInfo {
  id: string;
  name: string;
  severity: 'critical' | 'warning';
  tier: 'free' | 'pro';
  autoFixable: boolean;
  description: string;
  whyItMatters: string;
  badExample: string;
  goodExample: string;
}

export const rules: RuleInfo[] = [
  {
    id: 'MP001',
    name: 'require-concurrent-index-creation',
    severity: 'critical',
    tier: 'free',
    autoFixable: true,
    description: 'CREATE INDEX without CONCURRENTLY blocks all writes on the target table for the entire duration of index creation.',
    whyItMatters: 'Without CONCURRENTLY, PostgreSQL takes an ACCESS EXCLUSIVE lock on the table, blocking all reads and writes for the entire duration of index creation. On tables with millions of rows, this can mean minutes of complete downtime.',
    badExample: 'CREATE INDEX idx_users_email ON users (email);',
    goodExample: 'CREATE INDEX CONCURRENTLY idx_users_email ON users (email);',
  },
  {
    id: 'MP002',
    name: 'require-check-not-null-pattern',
    severity: 'critical',
    tier: 'free',
    autoFixable: false,
    description: 'ALTER TABLE ... SET NOT NULL requires a full table scan to validate all existing rows.',
    whyItMatters: 'SET NOT NULL scans every row under ACCESS EXCLUSIVE lock. On large tables this can take minutes. Use the CHECK constraint pattern: add CHECK (col IS NOT NULL) NOT VALID, then VALIDATE CONSTRAINT separately.',
    badExample: 'ALTER TABLE users ALTER COLUMN email SET NOT NULL;',
    goodExample: `ALTER TABLE users ADD CONSTRAINT users_email_not_null
  CHECK (email IS NOT NULL) NOT VALID;
ALTER TABLE users VALIDATE CONSTRAINT users_email_not_null;`,
  },
  {
    id: 'MP003',
    name: 'volatile-default-table-rewrite',
    severity: 'critical',
    tier: 'free',
    autoFixable: false,
    description: 'ADD COLUMN with a volatile DEFAULT (e.g., now(), random()) causes a full table rewrite on PG < 11.',
    whyItMatters: 'On PostgreSQL < 11, adding a column with a volatile default rewrites every row in the table under ACCESS EXCLUSIVE lock. On PG 11+, non-volatile defaults are stored in pg_attribute and applied lazily, but volatile defaults still evaluate per-row.',
    badExample: 'ALTER TABLE users ADD COLUMN created_at TIMESTAMP DEFAULT now();',
    goodExample: `-- On PG 11+: volatile defaults are evaluated per-row (no rewrite)
-- On PG < 11: add column without default, then backfill
ALTER TABLE users ADD COLUMN created_at TIMESTAMP;
UPDATE users SET created_at = now() WHERE created_at IS NULL;`,
  },
  {
    id: 'MP004',
    name: 'require-lock-timeout',
    severity: 'critical',
    tier: 'free',
    autoFixable: true,
    description: 'DDL operations should set lock_timeout to prevent blocking the lock queue indefinitely.',
    whyItMatters: 'Without lock_timeout, if the table is locked by another query, your DDL waits indefinitely. All subsequent queries pile up behind it in the lock queue, causing cascading timeouts across your application.',
    badExample: 'ALTER TABLE users ADD COLUMN bio TEXT;',
    goodExample: `SET lock_timeout = '5s';
ALTER TABLE users ADD COLUMN bio TEXT;
RESET lock_timeout;`,
  },
  {
    id: 'MP005',
    name: 'require-not-valid-foreign-key',
    severity: 'critical',
    tier: 'free',
    autoFixable: false,
    description: 'Adding a FK constraint without NOT VALID scans the entire table under ACCESS EXCLUSIVE lock.',
    whyItMatters: 'Adding a foreign key validates all existing rows while holding an ACCESS EXCLUSIVE lock. NOT VALID skips validation during creation, then VALIDATE CONSTRAINT checks rows with a lighter lock that allows reads and writes.',
    badExample: `ALTER TABLE orders ADD CONSTRAINT fk_orders_user
  FOREIGN KEY (user_id) REFERENCES users (id);`,
    goodExample: `ALTER TABLE orders ADD CONSTRAINT fk_orders_user
  FOREIGN KEY (user_id) REFERENCES users (id) NOT VALID;
ALTER TABLE orders VALIDATE CONSTRAINT fk_orders_user;`,
  },
  {
    id: 'MP006',
    name: 'no-vacuum-full',
    severity: 'critical',
    tier: 'free',
    autoFixable: false,
    description: 'VACUUM FULL rewrites the entire table under ACCESS EXCLUSIVE lock, blocking all reads and writes.',
    whyItMatters: 'VACUUM FULL physically rewrites the entire table to reclaim disk space while holding an ACCESS EXCLUSIVE lock. Use pg_repack or VACUUM (without FULL) instead for online space reclamation.',
    badExample: 'VACUUM FULL users;',
    goodExample: `-- Use regular VACUUM (no lock) or pg_repack
VACUUM users;`,
  },
  {
    id: 'MP007',
    name: 'no-column-type-change',
    severity: 'critical',
    tier: 'free',
    autoFixable: false,
    description: 'ALTER COLUMN TYPE rewrites the entire table under ACCESS EXCLUSIVE lock.',
    whyItMatters: 'Changing a column type requires rewriting every row in the table while holding an ACCESS EXCLUSIVE lock. Use the expand-contract pattern: add a new column, backfill, swap.',
    badExample: 'ALTER TABLE users ALTER COLUMN age TYPE BIGINT;',
    goodExample: `-- Expand-contract pattern:
ALTER TABLE users ADD COLUMN age_new BIGINT;
UPDATE users SET age_new = age;
-- Deploy code to read from age_new
ALTER TABLE users DROP COLUMN age;
ALTER TABLE users RENAME COLUMN age_new TO age;`,
  },
  {
    id: 'MP008',
    name: 'no-multi-ddl-transaction',
    severity: 'critical',
    tier: 'free',
    autoFixable: false,
    description: 'Multiple DDL statements in a single transaction compound lock duration.',
    whyItMatters: 'Each DDL statement acquires locks that are held until the transaction commits. Multiple DDL in one transaction means all locks are held simultaneously for the total duration, multiplying the impact on concurrent queries.',
    badExample: `BEGIN;
ALTER TABLE users ADD COLUMN bio TEXT;
CREATE INDEX idx_users_bio ON users (bio);
COMMIT;`,
    goodExample: `-- Run each DDL in its own transaction
ALTER TABLE users ADD COLUMN bio TEXT;
-- separate transaction
CREATE INDEX CONCURRENTLY idx_users_bio ON users (bio);`,
  },
  {
    id: 'MP009',
    name: 'require-drop-index-concurrently',
    severity: 'warning',
    tier: 'free',
    autoFixable: true,
    description: 'DROP INDEX without CONCURRENTLY acquires ACCESS EXCLUSIVE lock, blocking all reads and writes.',
    whyItMatters: 'DROP INDEX acquires an ACCESS EXCLUSIVE lock on the table. DROP INDEX CONCURRENTLY only acquires SHARE UPDATE EXCLUSIVE, allowing concurrent reads and writes during index removal.',
    badExample: 'DROP INDEX idx_users_email;',
    goodExample: 'DROP INDEX CONCURRENTLY idx_users_email;',
  },
  {
    id: 'MP010',
    name: 'no-rename-column',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'Renaming a column breaks all running application queries that reference the old name.',
    whyItMatters: 'Column renames take effect immediately. Any in-flight query or application code referencing the old column name will fail. Use the expand-contract pattern with a new column instead.',
    badExample: 'ALTER TABLE users RENAME COLUMN name TO full_name;',
    goodExample: `-- Add new column, backfill, update app code, drop old
ALTER TABLE users ADD COLUMN full_name TEXT;
UPDATE users SET full_name = name;`,
  },
  {
    id: 'MP011',
    name: 'unbatched-data-backfill',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'UPDATE without WHERE clause scans the entire table, holding row locks for the duration.',
    whyItMatters: 'A full-table UPDATE locks every row, generates massive WAL, and can cause replication lag. Batch updates with WHERE and LIMIT to control impact.',
    badExample: 'UPDATE users SET status = \'active\';',
    goodExample: `-- Batch in chunks
UPDATE users SET status = 'active'
  WHERE id IN (SELECT id FROM users WHERE status IS NULL LIMIT 1000);`,
  },
  {
    id: 'MP012',
    name: 'no-enum-add-in-transaction',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'ALTER TYPE ... ADD VALUE cannot run inside a transaction block.',
    whyItMatters: 'PostgreSQL does not allow adding enum values inside a transaction. If your migration framework wraps statements in BEGIN/COMMIT, this will fail at runtime.',
    badExample: `BEGIN;
ALTER TYPE status ADD VALUE 'archived';
COMMIT;`,
    goodExample: `-- Must run outside a transaction
ALTER TYPE status ADD VALUE 'archived';`,
  },
  {
    id: 'MP013',
    name: 'high-traffic-table-ddl',
    severity: 'critical',
    tier: 'pro',
    autoFixable: false,
    description: 'DDL on a table with high query frequency (10K+ queries from pg_stat_statements).',
    whyItMatters: 'Acquiring locks on heavily-queried tables affects more concurrent operations. Production context from pg_stat_statements reveals the real traffic impact.',
    badExample: '-- DDL on a table with 50K queries/hour',
    goodExample: '-- Schedule DDL during low-traffic windows',
  },
  {
    id: 'MP014',
    name: 'large-table-ddl',
    severity: 'critical',
    tier: 'pro',
    autoFixable: false,
    description: 'Long-held locks on tables with 1M+ rows (from pg_class).',
    whyItMatters: 'Operations that rewrite or scan large tables take proportionally longer, extending the lock duration. Production context from pg_class reveals actual table sizes.',
    badExample: '-- DDL on a table with 50M rows',
    goodExample: '-- Use CONCURRENTLY variants or partition strategy',
  },
  {
    id: 'MP015',
    name: 'no-add-column-serial',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'SERIAL/BIGSERIAL creates an implicit sequence with ACCESS EXCLUSIVE lock.',
    whyItMatters: 'SERIAL is syntactic sugar that creates a sequence and sets a DEFAULT. On PG 10+, use GENERATED ALWAYS AS IDENTITY instead — it has better semantics and avoids implicit sequence ownership issues.',
    badExample: 'ALTER TABLE users ADD COLUMN id SERIAL PRIMARY KEY;',
    goodExample: 'ALTER TABLE users ADD COLUMN id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY;',
  },
  {
    id: 'MP016',
    name: 'require-index-on-fk',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'Foreign key columns without an index cause slow cascading deletes and joins.',
    whyItMatters: 'Without an index on the FK column, PostgreSQL must do a sequential scan on the referencing table for every DELETE on the referenced table. This causes lock escalation and slow cascading deletes.',
    badExample: `ALTER TABLE orders ADD CONSTRAINT fk_user
  FOREIGN KEY (user_id) REFERENCES users (id);
-- No index on orders.user_id!`,
    goodExample: `CREATE INDEX CONCURRENTLY idx_orders_user_id ON orders (user_id);
ALTER TABLE orders ADD CONSTRAINT fk_user
  FOREIGN KEY (user_id) REFERENCES users (id) NOT VALID;`,
  },
  {
    id: 'MP017',
    name: 'no-drop-column',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'DROP COLUMN acquires ACCESS EXCLUSIVE lock and may break application queries.',
    whyItMatters: 'Dropping a column acquires ACCESS EXCLUSIVE lock (briefly) and immediately breaks any query or application code referencing that column. Ensure all code is updated before dropping.',
    badExample: 'ALTER TABLE users DROP COLUMN old_field;',
    goodExample: `-- 1. Remove all references in application code
-- 2. Deploy code changes
-- 3. Then drop the column
ALTER TABLE users DROP COLUMN old_field;`,
  },
  {
    id: 'MP018',
    name: 'no-force-set-not-null',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'SET NOT NULL without CHECK constraint pre-validation scans the entire table.',
    whyItMatters: 'SET NOT NULL requires scanning every row to verify no NULLs exist, all under ACCESS EXCLUSIVE. Pre-validate with a CHECK constraint using NOT VALID, then the SET NOT NULL is instant.',
    badExample: 'ALTER TABLE users ALTER COLUMN email SET NOT NULL;',
    goodExample: `ALTER TABLE users ADD CONSTRAINT chk_email_nn
  CHECK (email IS NOT NULL) NOT VALID;
ALTER TABLE users VALIDATE CONSTRAINT chk_email_nn;
ALTER TABLE users ALTER COLUMN email SET NOT NULL;`,
  },
  {
    id: 'MP019',
    name: 'no-exclusive-lock-high-connections',
    severity: 'critical',
    tier: 'pro',
    autoFixable: false,
    description: 'ACCESS EXCLUSIVE lock with many active connections (from pg_stat_activity).',
    whyItMatters: 'When many connections are active on a table, acquiring ACCESS EXCLUSIVE causes all of them to queue up, creating a cascade of timeouts and connection pool exhaustion.',
    badExample: '-- ACCESS EXCLUSIVE on table with 200+ active connections',
    goodExample: '-- Use advisory locks or schedule during low-connection periods',
  },
  {
    id: 'MP020',
    name: 'require-statement-timeout',
    severity: 'warning',
    tier: 'free',
    autoFixable: true,
    description: 'Long-running DDL without a preceding SET statement_timeout.',
    whyItMatters: 'Without statement_timeout, a DDL operation that encounters unexpected conditions (bloated table, heavy WAL, slow I/O) can hold locks for hours, turning a routine migration into a full outage.',
    badExample: 'CREATE INDEX CONCURRENTLY idx_users_email ON users (email);',
    goodExample: `SET statement_timeout = '30s';
CREATE INDEX CONCURRENTLY idx_users_email ON users (email);
RESET statement_timeout;`,
  },
  {
    id: 'MP021',
    name: 'require-concurrent-reindex',
    severity: 'warning',
    tier: 'free',
    autoFixable: true,
    description: 'REINDEX without CONCURRENTLY acquires ACCESS EXCLUSIVE, blocking all operations.',
    whyItMatters: 'REINDEX rebuilds the index while blocking all reads and writes. On PG 12+, REINDEX CONCURRENTLY rebuilds the index without blocking concurrent operations.',
    badExample: 'REINDEX INDEX idx_users_email;',
    goodExample: 'REINDEX INDEX CONCURRENTLY idx_users_email;',
  },
  {
    id: 'MP022',
    name: 'no-drop-cascade',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'DROP ... CASCADE silently drops all dependent objects.',
    whyItMatters: 'CASCADE silently drops views, indexes, constraints, and other objects that depend on the dropped object. This can cause unexpected data loss and application failures.',
    badExample: 'DROP TABLE users CASCADE;',
    goodExample: `-- Drop dependents explicitly first
DROP VIEW IF EXISTS active_users;
DROP TABLE users;`,
  },
  {
    id: 'MP023',
    name: 'require-if-not-exists',
    severity: 'warning',
    tier: 'free',
    autoFixable: true,
    description: 'CREATE TABLE/INDEX without IF NOT EXISTS fails if the object already exists.',
    whyItMatters: 'Without IF NOT EXISTS, re-running a migration fails with "relation already exists". Idempotent migrations are safer for retry and rollback scenarios.',
    badExample: 'CREATE TABLE users (id BIGINT PRIMARY KEY);',
    goodExample: 'CREATE TABLE IF NOT EXISTS users (id BIGINT PRIMARY KEY);',
  },
  {
    id: 'MP024',
    name: 'no-enum-value-removal',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'DROP TYPE destroys the enum and all columns that use it.',
    whyItMatters: 'PostgreSQL has no ALTER TYPE DROP VALUE. Dropping and recreating an enum type fails if any column references it, and CASCADE drops those columns too.',
    badExample: 'DROP TYPE status;',
    goodExample: `-- Enum values cannot be removed in PostgreSQL.
-- Consider using a TEXT column with a CHECK constraint instead.`,
  },
  {
    id: 'MP025',
    name: 'ban-concurrent-in-transaction',
    severity: 'critical',
    tier: 'free',
    autoFixable: false,
    description: 'CONCURRENTLY operations inside a transaction block always fail at runtime.',
    whyItMatters: 'CREATE INDEX CONCURRENTLY, DROP INDEX CONCURRENTLY, and REINDEX CONCURRENTLY cannot run inside a transaction. If your migration framework wraps in BEGIN/COMMIT, the operation will error.',
    badExample: `BEGIN;
CREATE INDEX CONCURRENTLY idx_users_email ON users (email);
COMMIT;`,
    goodExample: `-- Must run outside a transaction
CREATE INDEX CONCURRENTLY idx_users_email ON users (email);`,
  },
  {
    id: 'MP026',
    name: 'ban-drop-table',
    severity: 'critical',
    tier: 'free',
    autoFixable: false,
    description: 'DROP TABLE permanently removes the table and all its data.',
    whyItMatters: 'DROP TABLE is irreversible and acquires ACCESS EXCLUSIVE lock. All data, indexes, constraints, and triggers are permanently destroyed. Consider renaming the table first as a soft-delete.',
    badExample: 'DROP TABLE users;',
    goodExample: `-- Soft-delete: rename first, drop later after verification
ALTER TABLE users RENAME TO users_deprecated;
-- After confirming no dependencies:
DROP TABLE users_deprecated;`,
  },
  {
    id: 'MP027',
    name: 'disallowed-unique-constraint',
    severity: 'critical',
    tier: 'free',
    autoFixable: false,
    description: 'Adding a UNIQUE constraint without USING INDEX scans the entire table under ACCESS EXCLUSIVE.',
    whyItMatters: 'ADD CONSTRAINT UNIQUE builds a unique index while holding ACCESS EXCLUSIVE. Instead, create a unique index CONCURRENTLY first, then add the constraint USING INDEX.',
    badExample: 'ALTER TABLE users ADD CONSTRAINT uq_email UNIQUE (email);',
    goodExample: `CREATE UNIQUE INDEX CONCURRENTLY uq_email ON users (email);
ALTER TABLE users ADD CONSTRAINT uq_email UNIQUE USING INDEX uq_email;`,
  },
  {
    id: 'MP028',
    name: 'no-rename-table',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'Renaming a table breaks all queries, views, and foreign keys referencing it.',
    whyItMatters: 'Table renames take effect immediately and break all running queries, views, stored procedures, and application code that reference the old name.',
    badExample: 'ALTER TABLE users RENAME TO accounts;',
    goodExample: `-- Create new table, migrate data, update app code, drop old
CREATE TABLE accounts (LIKE users INCLUDING ALL);
-- Migrate data and update references`,
  },
  {
    id: 'MP029',
    name: 'ban-drop-not-null',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'DROP NOT NULL may break application code that assumes the column is never NULL.',
    whyItMatters: 'Removing a NOT NULL constraint allows NULLs in a column that application code may assume is always populated. This can cause NullPointerExceptions and data integrity issues.',
    badExample: 'ALTER TABLE users ALTER COLUMN email DROP NOT NULL;',
    goodExample: `-- Verify all application code handles NULL before dropping
-- Update validation logic, then:
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;`,
  },
  {
    id: 'MP030',
    name: 'require-not-valid-check',
    severity: 'critical',
    tier: 'free',
    autoFixable: true,
    description: 'CHECK constraint without NOT VALID scans the entire table under ACCESS EXCLUSIVE.',
    whyItMatters: 'Adding a CHECK constraint validates all existing rows while holding ACCESS EXCLUSIVE. Use NOT VALID to skip validation, then VALIDATE CONSTRAINT separately with a lighter lock.',
    badExample: `ALTER TABLE users ADD CONSTRAINT chk_age
  CHECK (age >= 0);`,
    goodExample: `ALTER TABLE users ADD CONSTRAINT chk_age
  CHECK (age >= 0) NOT VALID;
ALTER TABLE users VALIDATE CONSTRAINT chk_age;`,
  },
  {
    id: 'MP031',
    name: 'ban-exclusion-constraint',
    severity: 'critical',
    tier: 'free',
    autoFixable: false,
    description: 'EXCLUSION constraints build a GiST index under ACCESS EXCLUSIVE lock.',
    whyItMatters: 'Adding an exclusion constraint creates a GiST index and validates all existing rows while holding ACCESS EXCLUSIVE. This can take a long time on large tables.',
    badExample: `ALTER TABLE bookings ADD CONSTRAINT no_overlap
  EXCLUDE USING gist (room WITH =, during WITH &&);`,
    goodExample: `-- Consider application-level validation or
-- schedule during maintenance window`,
  },
  {
    id: 'MP032',
    name: 'ban-cluster',
    severity: 'critical',
    tier: 'free',
    autoFixable: false,
    description: 'CLUSTER rewrites the entire table under ACCESS EXCLUSIVE lock.',
    whyItMatters: 'CLUSTER physically reorders all table rows to match an index, requiring a full table rewrite under ACCESS EXCLUSIVE. Use pg_repack for online table clustering.',
    badExample: 'CLUSTER users USING idx_users_created;',
    goodExample: '-- Use pg_repack for online clustering',
  },
  {
    id: 'MP033',
    name: 'require-concurrent-refresh-matview',
    severity: 'warning',
    tier: 'free',
    autoFixable: true,
    description: 'REFRESH MATERIALIZED VIEW without CONCURRENTLY blocks all reads.',
    whyItMatters: 'Without CONCURRENTLY, REFRESH acquires ACCESS EXCLUSIVE, blocking all queries against the materialized view for the entire refresh duration. With CONCURRENTLY, reads continue against the old data until refresh completes.',
    badExample: 'REFRESH MATERIALIZED VIEW mv_user_stats;',
    goodExample: 'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_user_stats;',
  },
  {
    id: 'MP034',
    name: 'ban-drop-database',
    severity: 'critical',
    tier: 'free',
    autoFixable: false,
    description: 'DROP DATABASE in a migration file permanently destroys the entire database.',
    whyItMatters: 'DROP DATABASE is the most destructive operation possible. It permanently removes the database and all its contents. This should never appear in a migration file.',
    badExample: 'DROP DATABASE production;',
    goodExample: '-- Never DROP DATABASE in a migration file',
  },
  {
    id: 'MP035',
    name: 'ban-drop-schema',
    severity: 'critical',
    tier: 'free',
    autoFixable: false,
    description: 'DROP SCHEMA permanently removes the schema and all objects within it.',
    whyItMatters: 'DROP SCHEMA removes all tables, views, functions, and other objects in the schema. With CASCADE, this silently destroys everything.',
    badExample: 'DROP SCHEMA analytics CASCADE;',
    goodExample: `-- Drop objects explicitly, then schema
DROP TABLE analytics.events;
DROP SCHEMA analytics;`,
  },
  {
    id: 'MP036',
    name: 'ban-truncate-cascade',
    severity: 'critical',
    tier: 'free',
    autoFixable: false,
    description: 'TRUNCATE CASCADE silently truncates all tables referenced by foreign keys.',
    whyItMatters: 'TRUNCATE CASCADE follows FK relationships and empties referencing tables too. This can silently destroy data across your entire schema.',
    badExample: 'TRUNCATE users CASCADE;',
    goodExample: `-- Truncate explicitly without CASCADE
TRUNCATE users;
-- Or use DELETE with WHERE for safer data removal`,
  },
  {
    id: 'MP037',
    name: 'prefer-text-over-varchar',
    severity: 'warning',
    tier: 'free',
    autoFixable: true,
    description: 'VARCHAR(n) has no performance benefit over TEXT in PostgreSQL.',
    whyItMatters: 'In PostgreSQL, VARCHAR(n) and TEXT use the same storage. The length constraint adds overhead without benefit. Use TEXT with a CHECK constraint if you need length validation.',
    badExample: 'ALTER TABLE users ADD COLUMN bio VARCHAR(500);',
    goodExample: `ALTER TABLE users ADD COLUMN bio TEXT;
-- If length validation needed:
ALTER TABLE users ADD CONSTRAINT chk_bio_len CHECK (length(bio) <= 500) NOT VALID;`,
  },
  {
    id: 'MP038',
    name: 'prefer-bigint-over-int',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'INT primary keys and foreign keys can overflow at ~2.1 billion rows.',
    whyItMatters: 'INT (4 bytes) maxes out at 2,147,483,647. Fast-growing tables or high-throughput systems can hit this limit. Changing from INT to BIGINT requires a full table rewrite. Start with BIGINT.',
    badExample: 'CREATE TABLE orders (id INT PRIMARY KEY);',
    goodExample: 'CREATE TABLE orders (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY);',
  },
  {
    id: 'MP039',
    name: 'prefer-identity-over-serial',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'SERIAL has quirks around ownership and permissions. Use GENERATED ALWAYS AS IDENTITY on PG 10+.',
    whyItMatters: 'SERIAL creates an implicit sequence with complex ownership rules. GENERATED ALWAYS AS IDENTITY (PG 10+) is SQL-standard, has clearer semantics, and prevents accidental manual inserts.',
    badExample: 'CREATE TABLE users (id SERIAL PRIMARY KEY);',
    goodExample: 'CREATE TABLE users (id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY);',
  },
  {
    id: 'MP040',
    name: 'prefer-timestamptz',
    severity: 'warning',
    tier: 'free',
    autoFixable: true,
    description: 'TIMESTAMP without timezone causes timezone-related bugs.',
    whyItMatters: 'TIMESTAMP WITHOUT TIME ZONE stores a raw datetime without timezone context. When your application or database server changes timezones, all values silently become wrong. Use TIMESTAMPTZ.',
    badExample: 'ALTER TABLE events ADD COLUMN created_at TIMESTAMP;',
    goodExample: 'ALTER TABLE events ADD COLUMN created_at TIMESTAMPTZ;',
  },
  {
    id: 'MP041',
    name: 'ban-char-field',
    severity: 'warning',
    tier: 'free',
    autoFixable: true,
    description: 'CHAR(n) pads with spaces, wastes storage, and causes comparison bugs.',
    whyItMatters: 'CHAR(n) right-pads values with spaces to the declared length, wasting storage and causing subtle comparison bugs. Use TEXT or VARCHAR instead.',
    badExample: 'ALTER TABLE users ADD COLUMN country_code CHAR(2);',
    goodExample: 'ALTER TABLE users ADD COLUMN country_code TEXT;',
  },
  {
    id: 'MP042',
    name: 'require-index-name',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'Indexes without explicit names get auto-generated names that are hard to reference.',
    whyItMatters: 'Auto-generated index names like "users_email_idx" are unpredictable across environments. Explicit names make it easier to reference indexes in maintenance operations and documentation.',
    badExample: 'CREATE INDEX ON users (email);',
    goodExample: 'CREATE INDEX idx_users_email ON users (email);',
  },
  {
    id: 'MP043',
    name: 'ban-domain-constraint',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'Domain constraints validate against ALL rows in ALL columns using that domain.',
    whyItMatters: 'Adding or modifying a domain constraint triggers validation against every row in every table that uses the domain type. This can be extremely slow and lock-intensive.',
    badExample: `CREATE DOMAIN positive_int AS INTEGER CHECK (VALUE > 0);
ALTER DOMAIN positive_int ADD CONSTRAINT min_val CHECK (VALUE >= 1);`,
    goodExample: `-- Use column-level CHECK constraints instead
ALTER TABLE orders ADD CONSTRAINT chk_qty CHECK (quantity > 0) NOT VALID;`,
  },
  {
    id: 'MP044',
    name: 'no-data-loss-type-narrowing',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'Narrowing a column type (e.g., BIGINT to INT, TEXT to VARCHAR) risks data loss.',
    whyItMatters: 'Narrowing a column type truncates or rejects values that exceed the new type bounds. This causes data loss and requires a full table rewrite under ACCESS EXCLUSIVE.',
    badExample: 'ALTER TABLE users ALTER COLUMN age TYPE SMALLINT;',
    goodExample: `-- Verify no data exceeds new bounds first:
SELECT count(*) FROM users WHERE age > 32767;
-- Then alter with explicit cast
ALTER TABLE users ALTER COLUMN age TYPE SMALLINT;`,
  },
  {
    id: 'MP045',
    name: 'require-primary-key',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'Tables without a primary key break logical replication and many ORMs.',
    whyItMatters: 'Tables without a primary key cannot be used with logical replication (pglogical, Citus, etc.), cause issues with ORMs, and make row-level operations inefficient.',
    badExample: `CREATE TABLE events (
  name TEXT,
  data JSONB
);`,
    goodExample: `CREATE TABLE events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT,
  data JSONB
);`,
  },
  {
    id: 'MP046',
    name: 'require-concurrent-detach-partition',
    severity: 'critical',
    tier: 'free',
    autoFixable: true,
    description: 'DETACH PARTITION without CONCURRENTLY acquires ACCESS EXCLUSIVE on PG 14+.',
    whyItMatters: 'On PG 14+, DETACH PARTITION CONCURRENTLY detaches the partition without blocking concurrent queries. Without CONCURRENTLY, the parent table is locked with ACCESS EXCLUSIVE.',
    badExample: 'ALTER TABLE events DETACH PARTITION events_2024;',
    goodExample: 'ALTER TABLE events DETACH PARTITION events_2024 CONCURRENTLY;',
  },
  {
    id: 'MP047',
    name: 'ban-set-logged-unlogged',
    severity: 'critical',
    tier: 'free',
    autoFixable: false,
    description: 'SET LOGGED/UNLOGGED rewrites the entire table under ACCESS EXCLUSIVE.',
    whyItMatters: 'Changing a table between LOGGED and UNLOGGED requires physically rewriting every page, which holds ACCESS EXCLUSIVE for the entire duration.',
    badExample: 'ALTER TABLE users SET UNLOGGED;',
    goodExample: `-- Consider creating a new unlogged table and migrating data
CREATE UNLOGGED TABLE users_new (LIKE users INCLUDING ALL);`,
  },
  {
    id: 'MP048',
    name: 'ban-alter-default-volatile',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'Setting a volatile DEFAULT (now(), random()) on an existing column does not update existing rows.',
    whyItMatters: 'ALTER TABLE ALTER COLUMN SET DEFAULT only affects future INSERTs. Existing rows are NOT updated. Using a volatile function like now() may give the false impression that existing NULLs will be filled.',
    badExample: `ALTER TABLE users ALTER COLUMN created_at SET DEFAULT now();
-- Existing rows with NULL remain NULL!`,
    goodExample: `ALTER TABLE users ALTER COLUMN created_at SET DEFAULT now();
-- Backfill existing rows explicitly:
UPDATE users SET created_at = now() WHERE created_at IS NULL;`,
  },
  {
    id: 'MP049',
    name: 'require-partition-key-in-pk',
    severity: 'critical',
    tier: 'free',
    autoFixable: false,
    description: 'Partitioned table primary key must include all partition key columns. PostgreSQL rejects it otherwise.',
    whyItMatters: 'PostgreSQL requires that the primary key (and all unique constraints) on a partitioned table include all partition key columns. Uniqueness can only be enforced per-partition, so the partition key must be part of the constraint. If omitted, the CREATE TABLE will fail at runtime.',
    badExample: `CREATE TABLE events (
  id bigint PRIMARY KEY,
  created_at timestamptz NOT NULL,
  data jsonb
) PARTITION BY RANGE (created_at);
-- ERROR: insufficient columns in PRIMARY KEY`,
    goodExample: `CREATE TABLE events (
  id bigint NOT NULL,
  created_at timestamptz NOT NULL,
  data jsonb,
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);`,
  },
  {
    id: 'MP050',
    name: 'prefer-hnsw-over-ivfflat',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'IVFFlat indexes require training data and periodic reindexing. HNSW provides better recall without retraining.',
    whyItMatters: 'pgvector IVFFlat indexes need representative data at creation time to build clusters. As data changes, recall degrades and periodic REINDEX is needed. HNSW indexes build incrementally, have consistently better recall, and never need retraining.',
    badExample: `CREATE INDEX idx_embeddings ON items
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);`,
    goodExample: `CREATE INDEX idx_embeddings ON items
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);`,
  },
  {
    id: 'MP051',
    name: 'require-spatial-index',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'Spatial/geometry columns without a GIST or SP-GIST index will cause full sequential scans on spatial queries.',
    whyItMatters: 'PostGIS geometry and geography columns need a GIST or SP-GIST index for efficient spatial queries (ST_Contains, ST_DWithin, etc.). Without one, every spatial query triggers a full sequential scan.',
    badExample: `CREATE TABLE locations (
  id bigint PRIMARY KEY,
  geom geometry NOT NULL
);
-- No spatial index!`,
    goodExample: `CREATE TABLE locations (
  id bigint PRIMARY KEY,
  geom geometry NOT NULL
);
CREATE INDEX CONCURRENTLY idx_locations_geom
  ON locations USING GIST (geom);`,
  },
  {
    id: 'MP052',
    name: 'warn-dependent-objects',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'DROP COLUMN, RENAME COLUMN, or ALTER COLUMN TYPE may silently break views, functions, and triggers that reference the column.',
    whyItMatters: 'Views, functions, and triggers that reference a column will fail at query time — not at migration time — when the column is dropped, renamed, or its type is changed. PostgreSQL does not automatically update these dependent objects.',
    badExample: `ALTER TABLE users DROP COLUMN email;
-- Any view that SELECTs email will now fail at query time`,
    goodExample: `-- Check dependencies first:
SELECT dependent_ns.nspname || '.' || dependent_view.relname
FROM pg_depend
JOIN pg_rewrite ON pg_depend.objid = pg_rewrite.oid
JOIN pg_class AS dependent_view ON pg_rewrite.ev_class = dependent_view.oid
JOIN pg_namespace AS dependent_ns ON dependent_view.relnamespace = dependent_ns.oid
JOIN pg_class AS source_table ON pg_depend.refobjid = source_table.oid
JOIN pg_attribute ON pg_depend.refobjid = pg_attribute.attrelid
  AND pg_depend.refobjsubid = pg_attribute.attnum
WHERE source_table.relname = 'users'
  AND pg_attribute.attname = 'email';
-- Then drop only after confirming no dependents`,
  },
  {
    id: 'MP053',
    name: 'ban-uncommitted-transaction',
    severity: 'critical',
    tier: 'free',
    autoFixable: false,
    description: 'Migration file contains BEGIN without a matching COMMIT, leaving a dangling open transaction.',
    whyItMatters: 'A migration with BEGIN but no COMMIT will either fail (if the migration runner auto-commits) or leave an open transaction that holds locks indefinitely. Always match BEGIN with COMMIT or ROLLBACK.',
    badExample: `BEGIN;
ALTER TABLE users ADD COLUMN bio text;
-- Missing COMMIT!`,
    goodExample: `BEGIN;
ALTER TABLE users ADD COLUMN bio text;
COMMIT;`,
  },
  {
    id: 'MP054',
    name: 'alter-type-add-value-in-transaction',
    severity: 'critical',
    tier: 'free',
    autoFixable: false,
    description: 'ALTER TYPE ADD VALUE in the same transaction as a statement referencing the new value will fail.',
    whyItMatters: 'On PostgreSQL < 12, ALTER TYPE ADD VALUE cannot run inside a transaction at all. On PG 12+, it can run in a transaction but the new enum value is not visible to other statements in the same transaction — any INSERT or UPDATE referencing the new value will fail.',
    badExample: `BEGIN;
ALTER TYPE status ADD VALUE 'archived';
INSERT INTO events (status) VALUES ('archived');
COMMIT;`,
    goodExample: `-- Transaction 1:
ALTER TYPE status ADD VALUE 'archived';

-- Transaction 2 (after commit):
INSERT INTO events (status) VALUES ('archived');`,
  },
  {
    id: 'MP055',
    name: 'drop-pk-replica-identity-break',
    severity: 'critical',
    tier: 'free',
    autoFixable: false,
    description: 'Dropping a primary key breaks logical replication unless REPLICA IDENTITY is explicitly set.',
    whyItMatters: 'The default replica identity IS the primary key. When you drop a PK without setting REPLICA IDENTITY FULL or USING INDEX, all subsequent UPDATE and DELETE operations fail on logical replication subscribers (Supabase, Neon, AWS RDS read replicas, Debezium CDC).',
    badExample: `ALTER TABLE users DROP CONSTRAINT users_pkey;
-- Logical replication breaks silently`,
    goodExample: `ALTER TABLE users REPLICA IDENTITY FULL;
ALTER TABLE users DROP CONSTRAINT users_pkey;`,
  },
  {
    id: 'MP056',
    name: 'gin-index-on-jsonb-without-expression',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'A plain GIN index on a JSONB column only supports containment operators, not the common ->> extraction operator.',
    whyItMatters: 'A GIN index with default jsonb_ops does NOT speed up queries using ->> or ->. Most ORMs generate WHERE metadata->>\'key\' = \'value\' queries, which will still do a sequential scan. Use an expression B-tree index on the specific path instead.',
    badExample: `CREATE INDEX idx_events_data ON events USING GIN (data);
-- Useless for: WHERE data->>'status' = 'active'`,
    goodExample: `-- For ->> queries, use expression B-tree:
CREATE INDEX idx_events_status ON events ((data->>'status'));
-- For @> containment, use jsonb_path_ops:
CREATE INDEX idx_events_data ON events USING GIN (data jsonb_path_ops);`,
  },
  {
    id: 'MP057',
    name: 'rls-enabled-without-policy',
    severity: 'critical',
    tier: 'free',
    autoFixable: false,
    description: 'ENABLE ROW LEVEL SECURITY without a matching CREATE POLICY silently blocks all access.',
    whyItMatters: 'When RLS is enabled with zero policies, the default behavior is a complete deny — all queries from non-superuser roles return zero rows. No error is raised. Supabase documents this as the leading cause of data lockout incidents.',
    badExample: `ALTER TABLE users ENABLE ROW LEVEL SECURITY;
-- All non-superuser queries now return 0 rows!`,
    goodExample: `ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_select ON users FOR SELECT USING (true);`,
  },
  {
    id: 'MP058',
    name: 'multi-alter-table-same-table',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'Multiple separate ALTER TABLE statements on the same table acquire the lock multiple times unnecessarily.',
    whyItMatters: 'Each ALTER TABLE acquires ACCESS EXCLUSIVE lock independently. Multiple separate statements mean multiple lock/unlock cycles. Combining into a single ALTER TABLE reduces the blocking window from N lock cycles to one.',
    badExample: `ALTER TABLE users ADD COLUMN bio text;
ALTER TABLE users ADD COLUMN avatar text;
-- 2 separate lock acquisitions`,
    goodExample: `ALTER TABLE users
  ADD COLUMN bio text,
  ADD COLUMN avatar text;
-- 1 lock acquisition`,
  },
  {
    id: 'MP059',
    name: 'sequence-not-reset-after-data-migration',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'INSERT with explicit integer IDs without resetting the sequence may cause duplicate key errors.',
    whyItMatters: 'When you seed data with explicit IDs, the sequence counter stays at its initial value. The next auto-generated INSERT picks a low ID that already exists, causing "duplicate key violates unique constraint."',
    badExample: `INSERT INTO users (id, name) VALUES (1, 'Alice');
INSERT INTO users (id, name) VALUES (2, 'Bob');
-- Next auto-generated INSERT gets id=1!`,
    goodExample: `INSERT INTO users (id, name) VALUES (1, 'Alice');
INSERT INTO users (id, name) VALUES (2, 'Bob');
SELECT setval(pg_get_serial_sequence('users', 'id'),
  COALESCE(MAX(id), 1)) FROM users;`,
  },
  {
    id: 'MP060',
    name: 'alter-type-rename-value',
    severity: 'critical',
    tier: 'free',
    autoFixable: false,
    description: 'ALTER TYPE RENAME VALUE is not replicated via logical replication, causing enum mismatches on subscribers.',
    whyItMatters: 'RENAME VALUE modifies the pg_enum catalog entry in-place. Logical replication does not replicate catalog changes. Subscribers retain the old value name, causing decode failures on replicated rows.',
    badExample: `ALTER TYPE status RENAME VALUE 'active' TO 'enabled';
-- Subscribers still have 'active', not 'enabled'`,
    goodExample: `-- Add new value, migrate data:
ALTER TYPE status ADD VALUE 'enabled';
UPDATE events SET status = 'enabled' WHERE status = 'active';`,
  },
  {
    id: 'MP061',
    name: 'suboptimal-column-order',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'CREATE TABLE has variable-length columns before fixed-size columns, wasting alignment padding.',
    whyItMatters: 'PostgreSQL stores columns in declaration order. Fixed-size types (int, bigint, timestamp, uuid) before variable-length types (text, jsonb, bytea) reduces alignment padding waste — saving 4-16 bytes per row on tables with mixed types.',
    badExample: `CREATE TABLE users (
  name TEXT,
  bio TEXT,
  id INTEGER,
  age INTEGER
);`,
    goodExample: `CREATE TABLE users (
  id INTEGER,
  age INTEGER,
  name TEXT,
  bio TEXT
);`,
  },
  {
    id: 'MP062',
    name: 'ban-add-generated-stored-column',
    severity: 'critical',
    tier: 'free',
    autoFixable: false,
    description: 'Adding a stored generated column causes a full table rewrite under ACCESS EXCLUSIVE lock.',
    whyItMatters: 'ALTER TABLE ADD COLUMN with GENERATED ALWAYS AS ... STORED rewrites every row to compute and store the expression. On tables with millions of rows, this holds an ACCESS EXCLUSIVE lock for the entire rewrite — blocking all reads and writes.',
    badExample: `ALTER TABLE users
  ADD COLUMN full_name TEXT
  GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED;`,
    goodExample: `-- Use a regular column + trigger instead
ALTER TABLE users ADD COLUMN full_name TEXT;

CREATE FUNCTION update_full_name() RETURNS trigger AS $$
BEGIN
  NEW.full_name := NEW.first_name || ' ' || NEW.last_name;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_full_name
  BEFORE INSERT OR UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_full_name();`,
  },
  {
    id: 'MP063',
    name: 'warn-do-block-ddl',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'DO block contains DDL that bypasses static analysis — lock impact cannot be determined.',
    whyItMatters: 'PL/pgSQL DO blocks execute arbitrary code that cannot be analyzed by SQL linters. DDL inside DO blocks (ALTER TABLE, CREATE INDEX, DROP) acquires the same locks as direct SQL, but the operations are invisible to static analysis. Extract DDL from DO blocks into direct SQL statements for full safety analysis.',
    badExample: `DO $$
BEGIN
  ALTER TABLE users ADD COLUMN age INTEGER;
  CREATE INDEX idx_users_age ON users (age);
END;
$$;`,
    goodExample: `-- Extract DDL into direct SQL statements
ALTER TABLE users ADD COLUMN age INTEGER;
CREATE INDEX CONCURRENTLY idx_users_age ON users (age);`,
  },
  {
    id: 'MP064',
    name: 'ban-disable-trigger',
    severity: 'critical',
    tier: 'free',
    autoFixable: false,
    description: 'DISABLE TRIGGER breaks replication, audit logs, and FK enforcement.',
    whyItMatters: 'ALTER TABLE DISABLE TRIGGER ALL/USER turns off all triggers on the table. This breaks logical replication (which uses triggers internally), disables audit logging triggers, and bypasses foreign key enforcement. If the session crashes before re-enabling triggers, they remain disabled permanently.',
    badExample: 'ALTER TABLE users DISABLE TRIGGER ALL;',
    goodExample: `-- Disable only a specific trigger temporarily
ALTER TABLE users DISABLE TRIGGER my_audit_trigger;
-- ... perform operation ...
ALTER TABLE users ENABLE TRIGGER my_audit_trigger;`,
  },
  {
    id: 'MP065',
    name: 'ban-lock-table',
    severity: 'critical',
    tier: 'free',
    autoFixable: false,
    description: 'Explicit LOCK TABLE in migrations blocks queries and can cause deadlocks.',
    whyItMatters: 'LOCK TABLE acquires an explicit lock that can block reads and writes. PostgreSQL DDL statements automatically acquire the correct lock — explicit LOCK TABLE is rarely needed and often indicates a flawed migration strategy. High lock modes (EXCLUSIVE, ACCESS EXCLUSIVE) block all other operations.',
    badExample: 'LOCK TABLE users IN ACCESS EXCLUSIVE MODE;',
    goodExample: `-- Let PostgreSQL acquire locks automatically via DDL
-- No explicit LOCK TABLE needed
ALTER TABLE users ADD COLUMN email TEXT;`,
  },
  {
    id: 'MP066',
    name: 'warn-autovacuum-disabled',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'Disabling autovacuum causes table bloat and risks transaction ID wraparound.',
    whyItMatters: 'Autovacuum prevents table bloat by reclaiming dead tuples, and prevents transaction ID wraparound — which can freeze the entire database. Disabling autovacuum is occasionally justified for temporary bulk-load staging tables, but is dangerous for any table that serves production traffic.',
    badExample: `CREATE TABLE staging_data (id INT)
  WITH (autovacuum_enabled = false);`,
    goodExample: `-- Create with autovacuum disabled for bulk load, then re-enable
CREATE TABLE staging_data (id INT)
  WITH (autovacuum_enabled = false);
-- After bulk load:
ALTER TABLE staging_data SET (autovacuum_enabled = true);`,
  },
  {
    id: 'MP067',
    name: 'warn-backfill-no-batching',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'DELETE without a WHERE clause removes every row in a single transaction, generating massive WAL and holding locks.',
    whyItMatters: 'A full-table DELETE generates a WAL entry for every row, bloats the table with dead tuples, and holds a ROW EXCLUSIVE lock for the entire duration. On tables with millions of rows, this can take hours, cause replication lag, and exhaust disk space.',
    badExample: 'DELETE FROM users;',
    goodExample: `-- For full table delete, use TRUNCATE (much faster, minimal WAL):
TRUNCATE users;

-- For partial deletes, batch with WHERE + LIMIT:
DELETE FROM users WHERE ctid IN (
  SELECT ctid FROM users LIMIT 10000
);`,
  },
  {
    id: 'MP068',
    name: 'warn-integer-pk-capacity',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'Sequence uses integer type (max ~2.1B). Use bigint to avoid expensive future migration.',
    whyItMatters: 'Integer sequences overflow at ~2.1 billion (int4) or ~32,000 (int2). When a sequence overflows, all INSERTs fail. Migrating from integer to bigint on a live sequence requires rewriting the dependent column under ACCESS EXCLUSIVE lock.',
    badExample: 'CREATE SEQUENCE user_id_seq AS integer;',
    goodExample: 'CREATE SEQUENCE user_id_seq AS bigint;',
  },
  {
    id: 'MP069',
    name: 'warn-fk-lock-both-tables',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'Adding a foreign key locks BOTH the source and referenced table simultaneously.',
    whyItMatters: 'ALTER TABLE ADD CONSTRAINT FOREIGN KEY acquires SHARE ROW EXCLUSIVE lock on both the table with the FK column AND the referenced table. This blocks writes to both tables simultaneously, doubling the blast radius.',
    badExample: `ALTER TABLE orders ADD CONSTRAINT fk_user
  FOREIGN KEY (user_id) REFERENCES users (id);`,
    goodExample: `SET lock_timeout = '3s';
ALTER TABLE orders ADD CONSTRAINT fk_user
  FOREIGN KEY (user_id) REFERENCES users (id) NOT VALID;
RESET lock_timeout;
ALTER TABLE orders VALIDATE CONSTRAINT fk_user;`,
  },
  {
    id: 'MP070',
    name: 'warn-concurrent-index-invalid',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'CREATE INDEX CONCURRENTLY can leave an invalid index on failure. Add DROP INDEX IF EXISTS before retrying.',
    whyItMatters: 'If CREATE INDEX CONCURRENTLY fails, it leaves behind an INVALID index that slows writes but is never used for queries. Retrying without first dropping the invalid index fails with "relation already exists".',
    badExample: 'CREATE INDEX CONCURRENTLY idx_email ON users (email);',
    goodExample: `DROP INDEX IF EXISTS idx_email;
CREATE INDEX CONCURRENTLY idx_email ON users (email);`,
  },
  {
    id: 'MP071',
    name: 'ban-rename-in-use-column',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'Renaming a column breaks views, functions, and triggers that reference the old name.',
    whyItMatters: 'PostgreSQL does not automatically update views, functions, triggers, or policies when a column is renamed. All dependent objects continue referencing the old name and fail at query time.',
    badExample: 'ALTER TABLE users RENAME COLUMN name TO full_name;',
    goodExample: `-- Safe add-copy-drop pattern:
ALTER TABLE users ADD COLUMN full_name TEXT;
UPDATE users SET full_name = name WHERE full_name IS NULL;
-- Update all views/functions, then drop old column`,
  },
  {
    id: 'MP072',
    name: 'warn-partition-default-scan',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'ATTACH PARTITION scans the DEFAULT partition under ACCESS EXCLUSIVE lock to check for overlapping rows.',
    whyItMatters: 'When attaching a new partition, PostgreSQL scans the entire DEFAULT partition while holding an ACCESS EXCLUSIVE lock on it. If the default partition is large, this blocks all reads and writes.',
    badExample: `ALTER TABLE events ATTACH PARTITION events_2024
  FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');`,
    goodExample: `-- Move rows from default partition first, then attach:
SET lock_timeout = '5s';
ALTER TABLE events ATTACH PARTITION events_2024
  FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');
RESET lock_timeout;`,
  },
  {
    id: 'MP073',
    name: 'ban-superuser-role',
    severity: 'critical',
    tier: 'free',
    autoFixable: false,
    description: 'Migration uses superuser-only operations. Migrations should run with minimal privileges.',
    whyItMatters: 'Running migrations as SUPERUSER is a security risk. Managed database services (RDS, Cloud SQL, Neon, Supabase) do not grant SUPERUSER access, so these operations will fail in production.',
    badExample: "ALTER SYSTEM SET max_connections = '200';",
    goodExample: "ALTER DATABASE mydb SET max_connections = '200';",
  },
  {
    id: 'MP074',
    name: 'require-deferrable-fk',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'FK constraints should be DEFERRABLE to support safe bulk operations and avoid ordering issues.',
    whyItMatters: 'Non-deferrable foreign keys are checked per-row during INSERT/UPDATE, requiring careful insertion order. DEFERRABLE constraints are checked at COMMIT time, allowing bulk inserts and circular references.',
    badExample: `ALTER TABLE orders ADD CONSTRAINT fk_user
  FOREIGN KEY (user_id) REFERENCES users (id);`,
    goodExample: `ALTER TABLE orders ADD CONSTRAINT fk_user
  FOREIGN KEY (user_id) REFERENCES users (id)
  DEFERRABLE INITIALLY DEFERRED;`,
  },
  {
    id: 'MP075',
    name: 'warn-toast-bloat-risk',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'UPDATE on TOAST-eligible columns (TEXT/JSONB/BYTEA) causes storage bloat until VACUUM runs.',
    whyItMatters: 'When you UPDATE a row with TOAST-stored columns, PostgreSQL creates new TOAST chunks and marks old chunks as dead. Dead chunks are only reclaimed by VACUUM, causing tables to grow many times their logical size.',
    badExample: `UPDATE users SET metadata = jsonb_set(metadata, '{key}', '"value"');`,
    goodExample: `UPDATE users SET metadata = jsonb_set(metadata, '{key}', '"value"');
-- Run VACUUM after bulk TOAST-column updates:
VACUUM (VERBOSE) users;`,
  },
  {
    id: 'MP076',
    name: 'warn-xid-consuming-retry',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'SAVEPOINT creates subtransactions that consume XIDs and accelerate wraparound risk.',
    whyItMatters: 'Each SAVEPOINT allocates a new transaction ID (XID). In retry loops, every SAVEPOINT/ROLLBACK TO consumes another XID. On high-throughput systems, subtransaction XID consumption can push the database toward XID wraparound.',
    badExample: 'SAVEPOINT my_savepoint;',
    goodExample: `-- Use separate transactions instead of subtransactions
-- Or retry the entire transaction, not a subtransaction`,
  },
  {
    id: 'MP077',
    name: 'prefer-lz4-toast-compression',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'Use lz4 TOAST compression instead of pglz on PostgreSQL 14+ for better performance.',
    whyItMatters: 'PostgreSQL 14 introduced lz4 as an alternative TOAST compression method. lz4 is 3-5x faster for both compression and decompression compared to pglz, with only slightly worse compression ratios.',
    badExample: 'ALTER TABLE users ALTER COLUMN bio SET COMPRESSION pglz;',
    goodExample: 'ALTER TABLE users ALTER COLUMN bio SET COMPRESSION lz4;',
  },
  {
    id: 'MP078',
    name: 'warn-extension-version-pin',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'CREATE EXTENSION without VERSION clause. Pin the version for reproducible migrations.',
    whyItMatters: 'Without a VERSION clause, CREATE EXTENSION installs the server default version, which can differ between environments. This makes migrations non-reproducible.',
    badExample: 'CREATE EXTENSION IF NOT EXISTS pgcrypto;',
    goodExample: "CREATE EXTENSION IF NOT EXISTS pgcrypto VERSION '1.3';",
  },
  {
    id: 'MP079',
    name: 'warn-rls-policy-completeness',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'RLS policies should cover all operations (SELECT, INSERT, UPDATE, DELETE) to avoid silent access denial.',
    whyItMatters: 'When RLS is enabled, any operation without a policy is silently denied — queries return zero rows instead of raising an error. Always create policies for all operations or use a FOR ALL policy.',
    badExample: `ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY posts_select ON posts FOR SELECT USING (true);
-- Missing INSERT, UPDATE, DELETE policies!`,
    goodExample: `ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY posts_all ON posts FOR ALL USING (true);`,
  },
  {
    id: 'MP080',
    name: 'ban-data-in-migration',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'Data manipulation (INSERT/UPDATE/DELETE) in a DDL migration file. Separate schema and data changes.',
    whyItMatters: 'Mixing DDL and DML in the same migration makes rollback harder, increases lock duration, and violates separation of concerns. Data migrations should be in separate files with explicit rollback strategies.',
    badExample: `CREATE TABLE settings (key TEXT, value TEXT);
INSERT INTO settings VALUES ('version', '1.0');`,
    goodExample: `-- migrations/003_schema.sql (DDL only)
CREATE TABLE settings (key TEXT, value TEXT);

-- migrations/004_seed.sql (DML only)
INSERT INTO settings VALUES ('version', '1.0');`,
  },
];
