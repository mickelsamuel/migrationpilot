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
    description: 'ADD COLUMN with a volatile DEFAULT (gen_random_uuid(), random(), clock_timestamp()) rewrites the entire table and its indexes under ACCESS EXCLUSIVE.',
    whyItMatters: 'A non-volatile default is evaluated once and stored in pg_attribute.attmissingval, so ADD COLUMN touches no heap pages. A volatile default cannot be stored that way — PostgreSQL evaluates it separately for every existing row, which means writing a fresh copy of the table and all of its indexes while holding ACCESS EXCLUSIVE. now() and CURRENT_TIMESTAMP are stable, not volatile: they do not rewrite, but every pre-existing row is given the one value they evaluated to.',
    badExample: 'ALTER TABLE orders ADD COLUMN public_id uuid NOT NULL DEFAULT gen_random_uuid();',
    goodExample: `-- Add the column with no default, so the catalog write is all it costs
ALTER TABLE orders ADD COLUMN public_id uuid;

-- Fill it in batches, then attach the default for rows written from here on
UPDATE orders SET public_id = gen_random_uuid()
WHERE public_id IS NULL
  AND id IN (SELECT id FROM orders WHERE public_id IS NULL LIMIT 10000);

ALTER TABLE orders ALTER COLUMN public_id SET DEFAULT gen_random_uuid();`,
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
    autoFixable: true,
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
    name: 'no-enum-add-value-in-transaction',
    severity: 'warning',
    tier: 'free',
    autoFixable: true,
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
    severity: 'warning',
    tier: 'pro',
    autoFixable: false,
    description: 'DDL on a table with high query frequency (10K+ queries from pg_stat_statements).',
    whyItMatters: 'Acquiring locks on heavily-queried tables affects more concurrent operations. Production context from pg_stat_statements reveals the real traffic impact.',
    badExample: `-- pg_stat_statements shows ~50,000 calls/hour against users
ALTER TABLE users ADD COLUMN last_seen_at timestamptz;`,
    goodExample: `-- See what is actually hitting the table before you schedule the DDL,
-- then take the lock in a window where this traffic is quiet.
SELECT calls, mean_exec_time, query
FROM pg_stat_statements
WHERE query ILIKE '%users%'
ORDER BY calls DESC
LIMIT 10;`,
  },
  {
    id: 'MP014',
    name: 'large-table-ddl',
    severity: 'warning',
    tier: 'pro',
    autoFixable: false,
    description: 'Long-held locks on tables with 1M+ rows (from pg_class).',
    whyItMatters: 'Operations that rewrite or scan large tables take proportionally longer, extending the lock duration. Production context from pg_class reveals actual table sizes.',
    badExample: `-- users has 50M rows
ALTER TABLE users ALTER COLUMN bio TYPE text;`,
    goodExample: `-- A build that does not hold its lock for the length of the table
-- keeps the cost proportional to the work, not to the row count.
CREATE INDEX CONCURRENTLY idx_users_last_seen ON users (last_seen_at);`,
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
    severity: 'warning',
    tier: 'pro',
    autoFixable: false,
    description: 'ACCESS EXCLUSIVE lock with many active connections (from pg_stat_activity).',
    whyItMatters: 'When many connections are active on a table, acquiring ACCESS EXCLUSIVE causes all of them to queue up, creating a cascade of timeouts and connection pool exhaustion.',
    badExample: `-- 200 connections are active against users right now
ALTER TABLE users ALTER COLUMN email TYPE varchar(320);`,
    goodExample: `-- An operation that never takes ACCESS EXCLUSIVE has no queue to
-- form behind it, however many connections are open.
CREATE INDEX CONCURRENTLY idx_users_email ON users (email);`,
  },
  {
    id: 'MP020',
    name: 'require-statement-timeout',
    severity: 'warning',
    tier: 'free',
    autoFixable: true,
    description: 'Long-running DDL without a preceding SET statement_timeout.',
    whyItMatters: 'Without statement_timeout, a DDL operation that encounters unexpected conditions (bloated table, heavy WAL, slow I/O) can hold locks for hours, turning a routine migration into a full outage.',
    badExample: `ALTER TABLE orders VALIDATE CONSTRAINT fk_orders_user;
-- Full table scan with no bound on how long it may run`,
    goodExample: `SET statement_timeout = '30s';
ALTER TABLE orders VALIDATE CONSTRAINT fk_orders_user;
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
    autoFixable: true,
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
    autoFixable: true,
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
    autoFixable: true,
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
    autoFixable: true,
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
    name: 'ban-alter-default-volatile-existing',
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
    description: 'Independent ALTER TABLE statements on the same table acquire the lock once each. Combine them into a single statement.',
    whyItMatters: 'Each ALTER TABLE acquires ACCESS EXCLUSIVE lock independently. Multiple separate statements mean multiple lock/unlock cycles. Combining into a single ALTER TABLE reduces the blocking window from N lock cycles to one. This only holds for subcommands that are independent: a NOT VALID constraint and its VALIDATE, or a SET NOT NULL and the CHECK constraint proving it, are deliberately kept apart, and merging them puts the scan they were written to avoid back under ACCESS EXCLUSIVE.',
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
    description: 'CREATE INDEX CONCURRENTLY can leave an invalid index on failure. Add DROP INDEX CONCURRENTLY IF EXISTS before retrying.',
    whyItMatters: 'If CREATE INDEX CONCURRENTLY fails, it leaves behind an INVALID index that slows writes but is never used for queries. Retrying without first dropping the invalid index fails with "relation already exists". The exception is an index a UNIQUE or PRIMARY KEY constraint owns: PostgreSQL refuses to drop that one at all, so its retry path is REINDEX INDEX CONCURRENTLY, or dropping the constraint first.',
    badExample: 'CREATE INDEX CONCURRENTLY idx_email ON users (email);',
    goodExample: `DROP INDEX CONCURRENTLY IF EXISTS idx_email;
CREATE INDEX CONCURRENTLY idx_email ON users (email);

-- If a UNIQUE or PRIMARY KEY constraint owns the index, the drop is refused.
-- Rebuild it in place instead:
REINDEX INDEX CONCURRENTLY users_email_key;`,
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
    autoFixable: true,
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
    autoFixable: true,
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
  {
    id: 'MP081',
    name: 'prefer-pg18-not-null-not-valid',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'On PG18+, use a native NOT NULL constraint added NOT VALID instead of the CHECK constraint workaround.',
    whyItMatters: 'PostgreSQL 18 stores NOT NULL constraints in pg_constraint, so ALTER TABLE ... ADD CONSTRAINT ... NOT NULL col NOT VALID marks a column NOT NULL without scanning the table, and VALIDATE CONSTRAINT checks the existing rows under a lock that allows reads and writes. The old workaround of adding a CHECK (col IS NOT NULL) NOT VALID constraint is no longer needed.',
    badExample: `-- PG18+: old workaround, no longer needed
ALTER TABLE users ADD CONSTRAINT users_email_nn
  CHECK (email IS NOT NULL) NOT VALID;
ALTER TABLE users VALIDATE CONSTRAINT users_email_nn;`,
    goodExample: `-- PG18+ native approach (simpler):
ALTER TABLE users ADD CONSTRAINT users_email_not_null
  NOT NULL email NOT VALID;
ALTER TABLE users VALIDATE CONSTRAINT users_email_not_null;`,
  },
  {
    id: 'MP082',
    name: 'warn-not-enforced-constraint',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'NOT ENFORCED constraint will not enforce data integrity. Invalid data can be inserted.',
    whyItMatters: 'PostgreSQL 18 NOT ENFORCED constraints exist only as metadata hints for the query planner. The database will NOT reject invalid data. Useful for documentation or gradual migration, but dangerous if you expect enforcement.',
    badExample: `ALTER TABLE orders ADD CONSTRAINT fk_user
  FOREIGN KEY (user_id) REFERENCES users(id) NOT ENFORCED;
-- Invalid user_id values will NOT be rejected!`,
    goodExample: `-- If you need enforcement:
ALTER TABLE orders ADD CONSTRAINT fk_user
  FOREIGN KEY (user_id) REFERENCES users(id) NOT VALID;
ALTER TABLE orders VALIDATE CONSTRAINT fk_user;`,
  },
  {
    id: 'MP083',
    name: 'warn-fk-nondeterministic-collation',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'FK on column with non-deterministic collation may fail on PG18+ or match incorrect values.',
    whyItMatters: 'PostgreSQL 18 validates that FK columns use deterministic collations. Non-deterministic collations (like ICU case-insensitive) can cause FK lookups to match incorrect values. PG18 rejects such FKs.',
    badExample: `CREATE TABLE orders (
  code TEXT COLLATE "und-x-icu",
  FOREIGN KEY (code) REFERENCES products(code)
);`,
    goodExample: `CREATE TABLE orders (
  code TEXT COLLATE "C",
  FOREIGN KEY (code) REFERENCES products(code)
);`,
  },
  {
    id: 'MP084',
    name: 'require-default-for-not-null-column',
    severity: 'critical',
    tier: 'free',
    autoFixable: false,
    description: 'ADD COLUMN ... NOT NULL without a DEFAULT aborts the migration on any table that already contains rows.',
    whyItMatters: 'PostgreSQL has to write a value into the new column for every row that already exists, and without a DEFAULT there is nothing to write — the statement fails with "contains null values" and takes the whole migration with it. What makes this one worth catching in review is where it fails: an empty database accepts the identical statement, so it passes locally, passes in CI, and then aborts in staging or production, the only environments with rows in the table.',
    badExample: `ALTER TABLE users ADD COLUMN email TEXT NOT NULL;
-- Fine on an empty table, fatal on a populated one`,
    goodExample: `-- On PG 11+ a constant default is a catalog-only change, no rewrite.
ALTER TABLE users ADD COLUMN email TEXT NOT NULL DEFAULT '';`,
  },
  {
    id: 'MP085',
    name: 'warn-grant-widening',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'GRANT to PUBLIC, GRANT ALL, or a blanket schema-wide grant hands out more privilege than the migration needs.',
    whyItMatters: 'Privileges granted in a migration are permanent and almost never revisited. TO PUBLIC is the one that resists auditing: it does not grant to the roles that exist, it grants to the role every user implicitly has, including users created long after the migration ran. GRANT ALL also confers TRUNCATE, which empties the table in one statement, and a schema-wide grant covers only the tables that happened to exist when it ran.',
    badExample: `GRANT ALL ON users TO app;
-- app can now TRUNCATE users

GRANT SELECT ON users TO PUBLIC;
-- every role in the cluster, including ones created next year`,
    goodExample: `-- Name the privileges, name the role.
GRANT SELECT, INSERT, UPDATE ON users TO app_role;

-- If PUBLIC access was inherited from an older migration, take it back.
REVOKE ALL ON users FROM PUBLIC;`,
  },
  {
    id: 'MP086',
    name: 'require-explicit-on-delete',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'Foreign key without an explicit ON DELETE clause silently defaults to NO ACTION.',
    whyItMatters: 'Leave the clause off and you get NO ACTION, which refuses to delete a parent row while any child row references it. That is frequently the behaviour you want — the problem is that nobody decided it. The constraint looks correct in review and behaves perfectly until the first time something tries to delete a referenced row, which may be months later in a GDPR deletion job or an admin screen nobody connected to this migration.',
    badExample: `ALTER TABLE orders ADD CONSTRAINT fk_user
  FOREIGN KEY (user_id) REFERENCES users (id);
-- NO ACTION by default; deleting a user now fails once they have an order`,
    goodExample: `ALTER TABLE orders ADD CONSTRAINT fk_user
  FOREIGN KEY (user_id) REFERENCES users (id)
  ON DELETE RESTRICT
  NOT VALID;
ALTER TABLE orders VALIDATE CONSTRAINT fk_user;`,
  },
  {
    id: 'MP087',
    name: 'ban-volatile-check-constraint',
    severity: 'critical',
    tier: 'free',
    autoFixable: false,
    description: 'CHECK constraint calling a volatile function (now(), random()) is only true at write time and rots afterwards.',
    whyItMatters: 'PostgreSQL does not require CHECK expressions to be IMMUTABLE, so it accepts this without a warning — there is no error to catch in review. A CHECK is evaluated when a row is written and never again, so one built on now() stops describing the rows it admitted. Two things break later, both delayed: the row becomes un-updatable, because any UPDATE re-checks the constraint, and the backup will not restore, because restoring re-adds the constraint against data that now violates it.',
    badExample: `ALTER TABLE sessions ADD CONSTRAINT sessions_not_expired
  CHECK (expires_at > now());
-- Accepted. Rots silently. Blocks UPDATEs and restores later.`,
    goodExample: `-- Compare stored values against each other — an invariant that stays true.
ALTER TABLE sessions ADD CONSTRAINT sessions_expiry_after_creation
  CHECK (expires_at > created_at) NOT VALID;
ALTER TABLE sessions VALIDATE CONSTRAINT sessions_expiry_after_creation;`,
  },
  {
    id: 'MP088',
    name: 'require-analyze-after-backfill',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'Bulk UPDATE or INSERT ... SELECT with no ANALYZE afterwards leaves the planner working from stale statistics.',
    whyItMatters: 'The planner does not look at your data, it looks at pg_statistic — and a backfill can invalidate all of it at once. A column that was entirely NULL before the UPDATE is fully populated afterwards while the statistics still say it is empty, so the planner keeps choosing plans built for a table that no longer exists. Autovacuum fixes this eventually, but it triggers on a row-change threshold rather than on your migration finishing, so latency degrades some time after the deploy went green.',
    badExample: `UPDATE users SET status = 'active' WHERE status IS NULL;
-- Migration ends here. Planner still thinks status is entirely NULL.`,
    goodExample: `UPDATE users SET status = 'active' WHERE status IS NULL;
ANALYZE users;`,
  },
  {
    id: 'MP089',
    name: 'warn-collation-change-rewrite',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'Changing a column COLLATE reorders the column, forcing a table rewrite and a rebuild of every index on it.',
    whyItMatters: 'A collation is the definition of sort order, so changing it changes where every value in the column belongs. Every btree index on the column is rebuilt inside the same ACCESS EXCLUSIVE lock as the table rewrite, not as separate work you can schedule or run concurrently. Comparisons also answer differently afterwards: ORDER BY returns a different sequence, and a unique index under a collation that treats more strings as equal can start rejecting inserts that used to succeed.',
    badExample: `ALTER TABLE users ALTER COLUMN name TYPE TEXT COLLATE "en_US";
-- Table rewritten, every index on name rebuilt, all under ACCESS EXCLUSIVE`,
    goodExample: `-- Expand-contract keeps the index builds online.
ALTER TABLE users ADD COLUMN name_new TEXT COLLATE "en_US";
-- backfill in batches...
CREATE INDEX CONCURRENTLY idx_users_name_new ON users (name_new);
-- swap the columns in a short transaction once the data is in place`,
  },
  {
    id: 'MP090',
    name: 'warn-trigger-on-hot-table',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'CREATE TRIGGER ... FOR EACH ROW locks out writes to add code that then runs on every row written.',
    whyItMatters: 'Creating the trigger takes a SHARE ROW EXCLUSIVE lock, so reads continue but writes queue. The cost that lasts is the body: a row-level trigger runs once per affected row inside the transaction doing the writing, so from this migration onward the function sits on the critical path of every INSERT, UPDATE and DELETE on the table. A function that takes a millisecond is invisible on single-row writes and adds ten seconds to a 10,000-row UPDATE — ten seconds of extra lock-holding, not just extra runtime.',
    badExample: `CREATE TRIGGER audit_users
  AFTER INSERT OR UPDATE OR DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION write_audit_log();
-- Now part of every write to users, forever`,
    goodExample: `-- A statement-level trigger with transition tables does the same work
-- once per statement instead of once per row.
CREATE TRIGGER audit_users
  AFTER UPDATE ON users
  REFERENCING NEW TABLE AS changed
  FOR EACH STATEMENT EXECUTE FUNCTION write_audit_log();`,
  },
  {
    id: 'MP091',
    name: 'warn-privilege-drift',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'GRANT/REVOKE mixed into a DDL migration makes access-control changes invisible to review and impossible to audit in one place.',
    whyItMatters: 'A GRANT in the middle of a schema migration is a permanent access-control change being reviewed as though it were a schema change — the reviewer is checking whether the column type is right, and the privilege line goes past in the same diff. The durable problem is auditing: "who can read this table, and who approved that" has no answer short of replaying every migration in order. Rollback is asymmetric too, because reverting the schema change does not revert the grant.',
    badExample: `-- migrations/012_add_reports.sql
CREATE TABLE reports (id BIGINT PRIMARY KEY, body TEXT);
CREATE INDEX idx_reports_created ON reports (created_at);
GRANT SELECT ON reports TO analyst;
-- Access decision buried in a schema diff`,
    goodExample: `-- migrations/012_add_reports.sql — schema only
CREATE TABLE reports (id BIGINT PRIMARY KEY, body TEXT);
CREATE INDEX idx_reports_created ON reports (created_at);

-- The GRANT moves to 013_grant_reports_access.sql, so a search for
-- GRANT across the migrations directory returns something meaningful.`,
  },
  {
    id: 'MP092',
    name: 'require-partitioned-index-strategy',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'CREATE INDEX on a partitioned parent cannot use CONCURRENTLY and recursively locks every partition.',
    whyItMatters: 'CONCURRENTLY is simply not available on a partitioned parent — PostgreSQL answers "cannot create index on partitioned table concurrently" and the migration fails at run time, after it has started. Drop the CONCURRENTLY and it is accepted, which is the trap: one statement then builds an index on every partition, holding locks across the whole hierarchy until the last one completes, with no way to stop partway or observe progress. CREATE INDEX ON ONLY parent creates a catalog entry with no storage, which each partition then fills in one at a time.',
    badExample: `CREATE TABLE events (id BIGINT, ts TIMESTAMPTZ) PARTITION BY RANGE (ts);

CREATE INDEX idx_events_id ON events (id);
-- Accepted, but builds on every partition inside one lock window`,
    goodExample: `CREATE TABLE events (id BIGINT, ts TIMESTAMPTZ) PARTITION BY RANGE (ts);

-- Catalog-only parent index: instant, marked invalid until filled in
CREATE INDEX idx_events_id ON ONLY events (id);

-- One partition at a time, each build online
CREATE INDEX CONCURRENTLY idx_events_id_2026_01 ON events_2026_01 (id);
ALTER INDEX idx_events_id ATTACH PARTITION idx_events_id_2026_01;`,
  },
  {
    id: 'MP093',
    name: 'warn-default-partition-growth',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'A DEFAULT partition silently absorbs rows that belong to missing partitions, making later ATTACH operations expensive.',
    whyItMatters: 'A default partition converts a loud failure into a silent one. Without it, inserting a row that matches no partition raises an error somebody notices the same day; with it, the row lands in the catch-all and nothing is logged. Miss a month of partition creation and the default partition quietly becomes the largest table in the database — and getting out is expensive in proportion to how long it went unnoticed, because attaching the partition those rows belong to scans the whole default partition under ACCESS EXCLUSIVE.',
    badExample: `CREATE TABLE events_default PARTITION OF events DEFAULT;
-- Silently absorbs every row with no home, forever`,
    goodExample: `-- Create partitions ahead of time so a gap fails loudly instead of silently
CREATE TABLE events_2026_01 PARTITION OF events
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE events_2026_02 PARTITION OF events
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');`,
  },
  {
    id: 'MP094',
    name: 'require-attach-partition-check',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'ATTACH PARTITION without a matching CHECK constraint scans the whole table under ACCESS EXCLUSIVE to validate the bound.',
    whyItMatters: 'ATTACH PARTITION is meant to be a catalog operation, and mostly it is. The exception is validation: PostgreSQL proves every row in the incoming table satisfies the partition bound by reading all of them, while holding ACCESS EXCLUSIVE on both the incoming table and the parent — so the entire partitioned table, every partition, is unavailable for the duration. An existing CHECK that implies the bound lets PostgreSQL skip the scan, moving the work to VALIDATE CONSTRAINT, which takes a lock that allows reads and writes.',
    badExample: `ALTER TABLE events ATTACH PARTITION events_2026_01
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
-- Full scan of events_2026_01, ACCESS EXCLUSIVE on the whole hierarchy`,
    goodExample: `-- 1. Add a CHECK matching the bound, without validating it yet
ALTER TABLE events_2026_01
  ADD CONSTRAINT events_2026_01_bound
  CHECK (ts >= '2026-01-01' AND ts < '2026-02-01') NOT VALID;

-- 2. Validate it under a lock that lets traffic through
ALTER TABLE events_2026_01 VALIDATE CONSTRAINT events_2026_01_bound;

-- 3. The attach is now catalog-only
ALTER TABLE events ATTACH PARTITION events_2026_01
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');`,
  },
  {
    id: 'MP095',
    name: 'warn-set-tablespace-rewrite',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'SET TABLESPACE copies the entire relation to new storage under ACCESS EXCLUSIVE, blocking all access for the duration.',
    whyItMatters: 'This is a physical file copy, not a catalog update. PostgreSQL reads every file belonging to the relation and writes it to the new location while holding ACCESS EXCLUSIVE from the first byte to the last, so the table is unavailable for reads and writes the whole time — hours rather than minutes on a large table over ordinary disks. The old files are not removed until the move commits, so both copies exist simultaneously and the destination needs the relation\'s full size free.',
    badExample: `ALTER TABLE users SET TABLESPACE fast_ssd;
-- users is offline until every file has been copied`,
    goodExample: `-- For an index, rebuilding on the target tablespace keeps the old one
-- serving queries until the new one is ready.
CREATE INDEX CONCURRENTLY idx_users_email_new
  ON users (email) TABLESPACE fast_ssd;
DROP INDEX CONCURRENTLY idx_users_email;
ALTER INDEX idx_users_email_new RENAME TO idx_users_email;`,
  },
  {
    id: 'MP096',
    name: 'warn-matview-with-data',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'CREATE MATERIALIZED VIEW ... WITH DATA runs the full query inside the migration, holding locks on every source table.',
    whyItMatters: 'WITH DATA is the default, so this usually happens without anyone choosing it. The statement looks like a definition and behaves like a batch job: the migration runs the view\'s query to completion before returning, holding locks on every table the query reads. A materialized view is generally materialized because the query is expensive, so the build is expensive by construction — and the transaction stays open throughout, which keeps xmin pinned so vacuum cannot clean up rows anywhere in the database.',
    badExample: `CREATE MATERIALIZED VIEW daily_revenue AS
  SELECT date_trunc('day', created_at) AS day, sum(total)
  FROM orders GROUP BY 1;
-- Migration blocks until the aggregate finishes`,
    goodExample: `-- Returns immediately; the expensive part becomes a REFRESH you can
-- schedule and retry. Note the view is not queryable until that runs,
-- and the first REFRESH cannot use CONCURRENTLY.
CREATE MATERIALIZED VIEW daily_revenue AS
  SELECT date_trunc('day', created_at) AS day, sum(total)
  FROM orders GROUP BY 1
  WITH NO DATA;`,
  },
  {
    id: 'MP097',
    name: 'ban-drop-constraint-backing-index',
    severity: 'critical',
    tier: 'free',
    autoFixable: false,
    description: 'Dropping the index behind a PRIMARY KEY or UNIQUE constraint is rejected by PostgreSQL and aborts the migration.',
    whyItMatters: 'A PRIMARY KEY or UNIQUE constraint owns the index that enforces it, and PostgreSQL refuses to drop that index on its own — the statement fails and the migration aborts. That is the good outcome. The bad one is the obvious next move: adding CASCADE makes the error go away by dropping the constraint as well, so a statement written to remove a redundant index instead removes a uniqueness guarantee and takes every foreign key referencing those columns with it. The index\'s name is never the evidence — a plain CREATE UNIQUE INDEX can carry the same _key suffix and drops without complaint.',
    badExample: `-- With users_email_key owned by a UNIQUE constraint on users:
DROP INDEX users_email_key;
-- ERROR: cannot drop index users_email_key because constraint ... requires it

DROP INDEX users_email_key CASCADE;
-- Succeeds. Silently drops the UNIQUE constraint and any FK depending on it.`,
    goodExample: `-- If a failed concurrent build left it invalid, rebuild it in place.
-- DROP INDEX is refused here; REINDEX is not.
REINDEX INDEX CONCURRENTLY users_email_key;`,
  },
  {
    id: 'MP098',
    name: 'warn-set-schema',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'ALTER ... SET SCHEMA breaks every schema-qualified reference to the object and changes how unqualified ones resolve.',
    whyItMatters: 'Moving an object between schemas is a rename in every way that matters, and it takes effect all at once — every query naming it as old_schema.thing starts failing the instant the migration commits. There is no deprecation window, and old and new application versions overlap during a rolling restart. Unqualified references are the more insidious half: they resolve through search_path, which is per-role, so whether they still work depends on who is asking. Your psql session looks fine while the application role is broken.',
    badExample: `ALTER TABLE users SET SCHEMA archive;
-- Every "public.users" reference breaks at commit`,
    goodExample: `-- Leave the table where it is and expose it at the new path, so both
-- paths work while the application migrates. Move it for real in a
-- later migration, once nothing references the old one.
CREATE VIEW archive.users AS SELECT * FROM public.users;`,
  },
  {
    id: 'MP099',
    name: 'warn-security-definer-search-path',
    severity: 'critical',
    tier: 'free',
    autoFixable: false,
    description: 'SECURITY DEFINER function without a pinned search_path lets the caller control name resolution inside a privileged body.',
    whyItMatters: 'SECURITY DEFINER runs the body with the privileges of the function\'s owner rather than the caller\'s, and search_path decides what every unqualified name in that body resolves to. Leave it unpinned and the caller supplies it — the caller being precisely the person who does not have the owner\'s privileges. Creating a schema with a shadowing table and putting it first in search_path redirects the function\'s writes, with the owner\'s rights. EXECUTE on new functions is granted to PUBLIC by default, so that is usually everyone.',
    badExample: `CREATE FUNCTION promote_user(uid int) RETURNS void AS $$
  UPDATE users SET role = 'admin' WHERE id = uid;
$$ LANGUAGE sql SECURITY DEFINER;
-- Caller decides which "users" this writes to`,
    goodExample: `CREATE FUNCTION promote_user(uid int) RETURNS void AS $$
  UPDATE public.users SET role = 'admin' WHERE id = uid;
$$ LANGUAGE sql
  SECURITY DEFINER
  SET search_path = pg_catalog, public;`,
  },
  {
    id: 'MP100',
    name: 'warn-redundant-index',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'The new index duplicates the leading columns of an index that already exists on the table.',
    whyItMatters: 'PostgreSQL can use the leading columns of a composite index on their own, so an index on (tenant_id) adds no lookup path that an existing index on (tenant_id, created_at) did not already provide. What it does add is a full build, permanent disk, and work on every INSERT, UPDATE and DELETE for as long as it exists. The migration file cannot tell you this on its own — it needs the catalog of what is already there, so this rule only fires with --database-url.',
    badExample: `-- Production already has:
--   CREATE INDEX idx_users_tenant_created ON users (tenant_id, created_at);

CREATE INDEX CONCURRENTLY idx_users_tenant ON users (tenant_id);`,
    goodExample: `-- A different leading column adds a lookup path the composite index
-- cannot serve on its own, so this one earns its keep.
CREATE INDEX CONCURRENTLY idx_users_created ON users (created_at);`,
  },
  {
    id: 'MP101',
    name: 'warn-index-on-write-hot-table',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'New index on a table with heavy write traffic. Every write pays for the extra index.',
    whyItMatters: 'An index is not free once it is built. Every INSERT and DELETE maintains it, and an UPDATE that touches an indexed column loses the heap-only-tuple optimisation, so it writes a new index entry too. The build is also at its most disruptive here: a plain CREATE INDEX blocks writes for its whole duration, and CONCURRENTLY has to keep up with everything committed while it runs. Write rates come from pg_stat_user_tables, so this rule only fires with --database-url.',
    badExample: `-- events takes ~120 writes/sec in production
CREATE INDEX idx_events_type ON events (event_type);`,
    goodExample: `-- On a write-hot table, confirm the indexes it already has earn their
-- upkeep before adding another — then build outside a transaction with
-- CREATE INDEX CONCURRENTLY.
SELECT indexrelname, idx_scan,
       pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes
WHERE relname = 'events'
ORDER BY idx_scan;`,
  },
  {
    id: 'MP102',
    name: 'warn-rewrite-disk-headroom',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'Full-table rewrite on a large table needs room for a second copy while it runs.',
    whyItMatters: 'None of these operations edit the table in place. PostgreSQL builds a complete new copy, heap and indexes, and only drops the original once the new copy is committed — so peak usage is roughly twice the current size. On a 400 GB table that is 400 GB of free space you need to have and probably were not thinking about. Running out partway through does not corrupt anything, but the rewrite rolls back and you have paid the full ACCESS EXCLUSIVE lock duration for nothing.',
    badExample: `-- orders is 400 GB; the volume has 120 GB free
VACUUM FULL orders;`,
    goodExample: `-- Price the second copy before starting, and check the volume with
--   df -h $(psql -tAc "SHOW data_directory")
SELECT pg_size_pretty(pg_total_relation_size('orders')) AS current_size,
       pg_size_pretty(pg_total_relation_size('orders') * 2) AS peak_during_rewrite;`,
  },
  {
    id: 'MP103',
    name: 'warn-replication-lag-risk',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'WAL-heavy operation on a large table while streaming replicas are connected.',
    whyItMatters: 'All of that work goes through WAL, and a standby replays WAL with a single startup process — work the primary spread across many backends arrives at the replica serially, so lag grows for as long as the operation runs and for some time after. If any reads are served from replicas they serve stale data for that whole window, and a failover while lag is high loses whatever has not been replayed. Replication slots turn the pressure around: if a replica cannot keep up, the primary keeps WAL for it until the disk fills.',
    badExample: `-- events is 60 GB, two streaming replicas connected
UPDATE events SET processed = true WHERE processed IS NULL;`,
    goodExample: `-- Batch the work, and let replicas catch up between batches:
DO $$
DECLARE
  rows_updated INT;
BEGIN
  LOOP
    UPDATE events SET processed = true
    WHERE ctid IN (
      SELECT ctid FROM events WHERE processed IS NULL LIMIT 10000
    );
    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    EXIT WHEN rows_updated = 0;
    COMMIT;
    PERFORM pg_sleep(0.5);
  END LOOP;
END $$;`,
  },
  {
    id: 'MP104',
    name: 'warn-long-index-build',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'Index build on a table large enough that the build runs for minutes or hours.',
    whyItMatters: 'Build time scales with row count, and a long build is a long exposure to whatever the build costs you. A plain CREATE INDEX holds a SHARE lock, blocking every write on the table until it finishes. CONCURRENTLY does not block writes, but it makes two passes and holds a snapshot the whole time, which stops vacuum from cleaning up dead rows anywhere in the database — a long build on one table can bloat every other table. A cancelled concurrent build also leaves an INVALID index behind.',
    badExample: `-- events has 500M rows
CREATE INDEX idx_events_ts ON events (created_at);`,
    goodExample: `-- Give the build room first, then run it CONCURRENTLY in its own step
-- and watch it rather than assuming it finished.
SET maintenance_work_mem = '2GB';
SET max_parallel_maintenance_workers = 4;

SELECT phase, blocks_done, blocks_total, tuples_done, tuples_total
FROM pg_stat_progress_create_index;`,
  },
  {
    id: 'MP105',
    name: 'warn-timescale-hypertable-ddl',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'DDL on a TimescaleDB hypertable propagates to every chunk, so its cost scales with chunk count.',
    whyItMatters: 'A hypertable is a facade. The data lives in chunks, each a real table, and TimescaleDB applies schema changes to the hypertable and to every one of them — so a statement that reads like one table\'s worth of work takes locks across the whole set and runs until the slowest chunk is done. Index creation has a specific catch: TimescaleDB does not support CREATE INDEX CONCURRENTLY on a hypertable at all, so that statement fails rather than running slowly. WITH (timescaledb.transaction_per_chunk) is the documented alternative.',
    badExample: `-- metrics is a hypertable with 420 chunks
CREATE INDEX CONCURRENTLY idx_metrics_device ON metrics (device_id);
-- ERROR: CREATE INDEX CONCURRENTLY is not supported on hypertables`,
    goodExample: `-- Check the fan-out before writing the DDL: the chunk count is what
-- the statement actually costs.
SELECT hypertable_name, num_chunks, compression_enabled
FROM timescaledb_information.hypertables
WHERE hypertable_name = 'metrics';`,
  },
  {
    id: 'MP106',
    name: 'prefer-timescale-drop-chunks',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'Time-ranged DELETE on a hypertable. drop_chunks() removes the same data far more cheaply.',
    whyItMatters: 'Deleting old data row by row is the most expensive way to do the job: a WAL record per row, a dead tuple per row for vacuum to clean up later, and bloat that stays until the vacuum finishes. On a hypertable that work is also unnecessary — chunks are already partitioned on the time column, so the rows in a retention window are whole chunks, and drop_chunks() drops them as tables. No per-row work, and the space comes back immediately rather than after a vacuum.',
    badExample: `DELETE FROM metrics WHERE time < now() - interval '30 days';`,
    goodExample: `SELECT drop_chunks('metrics', older_than => INTERVAL '30 days');

-- drop_chunks only removes chunks whose entire range falls outside the
-- bound, so rows in a partially-covered chunk survive.`,
  },
  {
    id: 'MP107',
    name: 'warn-citus-distributed-ddl',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'ALTER on a Citus distributed table propagates to every shard on every worker node.',
    whyItMatters: 'A distributed table is a set of shards spread across worker nodes, and Citus propagates DDL to all of them — so one line in the migration becomes a lock on the coordinator plus a lock per shard across the cluster, and the statement is not finished until the slowest worker is. Some forms are refused outright rather than propagated: changing the distribution column answers "cannot execute ALTER TABLE command involving partition column" and the migration stops there.',
    badExample: `-- orders is distributed by tenant_id across 32 shards
ALTER TABLE orders ALTER COLUMN tenant_id TYPE bigint;
-- ERROR: cannot execute ALTER TABLE command involving partition column`,
    goodExample: `-- See what the statement would fan out to before writing it:
SELECT table_name, citus_table_type, distribution_column, shard_count
FROM citus_tables;`,
  },
  {
    id: 'MP108',
    name: 'warn-partman-managed-parent',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'Manual partition DDL on a parent table managed by pg_partman.',
    whyItMatters: 'pg_partman decides which children exist, from what part_config says: run_maintenance pre-creates the next few partitions according to premake and drops old ones according to retention, on its own schedule. A partition created, attached, or detached by hand is not recorded there, so the next maintenance run can try to create a partition whose range you have already covered — which fails — or drop one it believes it owns. Nothing goes wrong at migration time; it surfaces later on a scheduled run nobody is watching.',
    badExample: `-- events is managed by pg_partman (interval 1 day, premake 4, retention 90 days)
CREATE TABLE events_p2024_01 PARTITION OF events
  FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');`,
    goodExample: `-- Check what partman thinks it owns, then let it make the partitions
-- by widening how far ahead it pre-creates.
SELECT parent_table, control, partition_interval, premake, retention
FROM part_config WHERE parent_table LIKE '%events';`,
  },
  {
    id: 'MP109',
    name: 'require-vector-index-params',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'pgvector HNSW or IVFFlat index created without explicit build parameters.',
    whyItMatters: 'These are build-time decisions and they are expensive to revisit. For HNSW, m and ef_construction set the shape of the graph and therefore the recall ceiling, and the defaults are conservative. For IVFFlat, lists decides how the vectors are clustered, and pgvector ties the right value to the row count — rows / 1000 up to a million rows, sqrt(rows) beyond that — so a default that ignores the row count is wrong at scale in one direction or the other. Changing any of them later means rebuilding the whole index.',
    badExample: `CREATE INDEX idx_items_embedding ON items USING hnsw (embedding vector_cosine_ops);

CREATE INDEX idx_docs_embedding ON documents USING ivfflat (embedding vector_l2_ops);`,
    goodExample: `CREATE INDEX idx_items_embedding ON items
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 128);

-- lists sized to the data: 4M rows -> sqrt(4,000,000) = 2,000
CREATE INDEX idx_docs_embedding ON documents
  USING ivfflat (embedding vector_l2_ops)
  WITH (lists = 2000);`,
  },
  {
    id: 'MP110',
    name: 'warn-partitioned-parent-fanout',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'DDL on a partitioned parent takes the lock on the parent and on every partition.',
    whyItMatters: 'DDL on a partitioned table recurses: PostgreSQL locks the parent and every partition, and holds all of those locks until the statement commits. The blocking window is therefore set by the slowest partition, not by the statement, and a lock_timeout only helps if it fires before the queue behind the parent lock has stalled everything else. The lock count scales with the partition count too, so on a table with a partition per day and a couple of years of history a single ALTER can exhaust max_locks_per_transaction and fail outright.',
    badExample: `-- events is partitioned by day, 365 partitions live
ALTER TABLE events ADD COLUMN note text;`,
    goodExample: `-- Confirm the fan-out and that the lock table can hold it before
-- writing the DDL:
SELECT count(*) AS partitions FROM pg_inherits WHERE inhparent = 'events'::regclass;
SHOW max_locks_per_transaction;`,
  },
  {
    id: 'MP111',
    name: 'warn-timescale-columnstore-ddl',
    severity: 'critical',
    tier: 'free',
    autoFixable: false,
    description: 'TimescaleDB rejects this ALTER on a hypertable that has compression / columnstore enabled.',
    whyItMatters: 'This is not a slow path — the statement fails. TimescaleDB answers "operation not supported on hypertables that have columnstore enabled", and the migration stops partway through with whatever ran before it already applied. Getting the change through is a procedure rather than a fix: stop the columnstore policy, convert the compressed chunks back to rowstore, disable the columnstore, apply the change, then re-enable and restore the policy. Two of those steps rewrite every chunk, so they belong in their own maintenance window.',
    badExample: `-- metrics is a hypertable with the columnstore enabled
ALTER TABLE metrics ALTER COLUMN value TYPE numeric;
-- ERROR: operation not supported on hypertables that have columnstore enabled`,
    goodExample: `-- Confirm the columnstore state first — it decides whether this is a
-- one-line ALTER or a whole-hypertable maintenance window.
SELECT hypertable_name, compression_enabled, num_chunks
FROM timescaledb_information.hypertables
WHERE hypertable_name = 'metrics';`,
  },
  {
    id: 'MP112',
    name: 'warn-hnsw-build-memory',
    severity: 'warning',
    tier: 'free',
    autoFixable: false,
    description: 'HNSW build on a large table with a small maintenance_work_mem will spill and slow down sharply.',
    whyItMatters: 'pgvector builds the HNSW graph in maintenance_work_mem. While the graph fits, the build is fast; once it does not, pgvector logs "hnsw graph no longer fits into maintenance_work_mem after N tuples" and finishes the rest on a much slower path. The statement is identical either way, which is what makes this hard to catch — a build that took minutes in staging can run for hours in production purely because the setting is lower there. The setting can be raised for the session that runs the build, so this is usually the cheapest fix available.',
    badExample: `-- items has 8M rows; maintenance_work_mem is 64MB
CREATE INDEX idx_items_embedding ON items
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);`,
    goodExample: `-- Raise the limits for the session that builds the index, then run the
-- CREATE INDEX in that same session.
SET maintenance_work_mem = '8GB';
SET max_parallel_maintenance_workers = 7;`,
  },
];
