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
    autoFixable: false,
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
    autoFixable: false,
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
    autoFixable: false,
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
    autoFixable: false,
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
    autoFixable: false,
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
    autoFixable: false,
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
];
