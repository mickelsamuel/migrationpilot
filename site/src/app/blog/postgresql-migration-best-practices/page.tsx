import type { Metadata } from 'next';
import Navbar from '@/components/navbar';

export const metadata: Metadata = {
  title: 'PostgreSQL Migration Best Practices for Zero-Downtime Deployments — MigrationPilot',
  description: 'A practical guide to running PostgreSQL schema migrations safely in production: lock_timeout, batched backfills, expand-contract, and CI integration.',
  keywords: ['postgresql migration best practices', 'zero downtime migration postgresql', 'postgresql schema migration', 'database migration strategy', 'expand contract migration'],
  alternates: {
    canonical: '/blog/postgresql-migration-best-practices',
  },
  openGraph: {
    title: 'PostgreSQL Migration Best Practices for Zero-Downtime Deployments',
    description: 'A practical guide to running PostgreSQL schema migrations safely in production: lock_timeout, batched backfills, expand-contract, and CI integration.',
    type: 'article',
    url: '/blog/postgresql-migration-best-practices',
  },
};

export default function PostgreSQLMigrationBestPractices() {
  return (
    <main className="min-h-screen">
      <Navbar active="blog" />

      <article className="pt-32 pb-20 px-6">
        <div className="max-w-3xl mx-auto">
          <div className="mb-8">
            <a href="/blog" className="text-sm text-blue-400 hover:text-blue-300 transition-colors">&larr; Back to Blog</a>
          </div>

          <div className="flex items-center gap-3 text-sm text-slate-500 mb-4">
            <time dateTime="2026-02-24">February 24, 2026</time>
            <span className="w-1 h-1 rounded-full bg-slate-700" />
            <span>14 min read</span>
          </div>

          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
            PostgreSQL Migration Best Practices for Zero-Downtime Deployments
          </h1>

          <p className="text-xl text-slate-400 mb-12 leading-relaxed">
            Zero-downtime schema migrations are not about a single trick. They require a combination of
            techniques: lock management, phased rollouts, backfill strategies, and CI enforcement. This
            guide covers the full playbook.
          </p>

          <div className="prose prose-invert max-w-none">
            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">1. Always Set lock_timeout</h2>

            <p className="text-slate-300 leading-relaxed mb-4">
              The single most important practice for safe migrations. Every DDL statement that acquires
              a table lock should be preceded by a lock_timeout:
            </p>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-6">
              <code className="text-sm text-slate-300 font-mono">{`-- Set a 5-second lock timeout
-- If the lock cannot be acquired in 5s, the statement fails
-- This prevents the lock queue problem (see below)
SET lock_timeout = '5s';

ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active';

-- Reset after DDL
RESET lock_timeout;`}</code>
            </pre>

            <p className="text-slate-300 leading-relaxed mb-4">
              Without lock_timeout, a DDL statement will wait indefinitely for a lock. While it waits,
              every subsequent query that needs a conflicting lock queues behind it. A single long-running
              analytics query can trigger a cascading outage:
            </p>

            <ol className="list-decimal list-inside text-slate-300 space-y-2 mb-6 ml-4">
              <li>Long query holds ACCESS SHARE on the table</li>
              <li>ALTER TABLE waits for ACCESS EXCLUSIVE lock</li>
              <li>All new queries queue behind the ALTER TABLE</li>
              <li>Connection pool exhausts within seconds</li>
              <li>Application-wide outage</li>
            </ol>

            <p className="text-slate-300 leading-relaxed mb-6">
              With lock_timeout, the ALTER fails fast. Your deployment script can retry after a delay,
              and the application continues serving traffic in the meantime.
            </p>

            <h3 className="text-xl font-semibold mt-8 mb-3 text-slate-200">The retry wrapper pattern</h3>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-6">
              <code className="text-sm text-slate-300 font-mono">{`-- Retry wrapper: try up to 5 times with increasing delays
DO $$
DECLARE
  retries INT := 0;
  max_retries INT := 5;
BEGIN
  LOOP
    BEGIN
      SET lock_timeout = '5s';
      ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active';
      RESET lock_timeout;
      RETURN;  -- Success
    EXCEPTION WHEN lock_not_available THEN
      retries := retries + 1;
      IF retries >= max_retries THEN
        RAISE EXCEPTION 'Failed to acquire lock after % attempts', max_retries;
      END IF;
      PERFORM pg_sleep(retries * 2);  -- Backoff: 2s, 4s, 6s, 8s, 10s
    END;
  END LOOP;
END $$;`}</code>
            </pre>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">2. Use statement_timeout for Long-Running DDL</h2>

            <p className="text-slate-300 leading-relaxed mb-4">
              While lock_timeout limits how long you wait to <em>acquire</em> a lock, statement_timeout
              limits how long the statement itself can <em>run</em>. Set both:
            </p>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-6">
              <code className="text-sm text-slate-300 font-mono">{`-- Prevent DDL from running longer than expected
SET lock_timeout = '5s';
SET statement_timeout = '30s';

ALTER TABLE users ALTER COLUMN email SET NOT NULL;

RESET lock_timeout;
RESET statement_timeout;`}</code>
            </pre>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">3. The Expand-Contract Pattern</h2>

            <p className="text-slate-300 leading-relaxed mb-4">
              The expand-contract pattern (also called parallel change) is the safest way to make
              backwards-incompatible schema changes. It splits a dangerous change into three deployments:
            </p>

            <h3 className="text-xl font-semibold mt-8 mb-3 text-slate-200">Example: Renaming a column</h3>

            <p className="text-slate-300 leading-relaxed mb-4">
              Directly renaming a column breaks all existing queries and application code that references
              the old name. The expand-contract approach:
            </p>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-6">
              <code className="text-sm text-slate-300 font-mono">{`-- DEPLOY 1: Expand — add the new column alongside the old one
ALTER TABLE users ADD COLUMN full_name TEXT;

-- Create a trigger to keep both columns in sync
CREATE OR REPLACE FUNCTION sync_name_columns()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF NEW.full_name IS NULL AND NEW.name IS NOT NULL THEN
      NEW.full_name := NEW.name;
    ELSIF NEW.name IS NULL AND NEW.full_name IS NOT NULL THEN
      NEW.name := NEW.full_name;
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_names
BEFORE INSERT OR UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION sync_name_columns();

-- Backfill existing rows
UPDATE users SET full_name = name WHERE full_name IS NULL;`}</code>
            </pre>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-6">
              <code className="text-sm text-slate-300 font-mono">{`-- DEPLOY 2: Migrate — update application to use "full_name"
-- All reads and writes now use the new column name
-- Deploy this code change and verify in production`}</code>
            </pre>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-6">
              <code className="text-sm text-slate-300 font-mono">{`-- DEPLOY 3: Contract — remove the old column and trigger
DROP TRIGGER trg_sync_names ON users;
DROP FUNCTION sync_name_columns();
ALTER TABLE users DROP COLUMN name;`}</code>
            </pre>

            <h3 className="text-xl font-semibold mt-8 mb-3 text-slate-200">Example: Changing a column type</h3>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-6">
              <code className="text-sm text-slate-300 font-mono">{`-- Changing INT to BIGINT directly acquires ACCESS EXCLUSIVE
-- and rewrites the entire table. Instead, use expand-contract:

-- DEPLOY 1: Add new column
ALTER TABLE orders ADD COLUMN amount_v2 BIGINT;

-- Sync trigger + backfill (same pattern as above)

-- DEPLOY 2: Switch reads/writes to amount_v2

-- DEPLOY 3: Drop old column
ALTER TABLE orders DROP COLUMN amount;
-- Optionally: ALTER TABLE orders RENAME COLUMN amount_v2 TO amount;`}</code>
            </pre>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">4. Batched Backfills</h2>

            <p className="text-slate-300 leading-relaxed mb-4">
              Never run a single UPDATE against millions of rows. A single large UPDATE:
            </p>

            <ul className="list-disc list-inside text-slate-300 space-y-2 mb-6 ml-4">
              <li>Holds ROW EXCLUSIVE locks for the entire duration</li>
              <li>Generates massive WAL (write-ahead log) volume</li>
              <li>Creates millions of dead tuples that autovacuum must clean up</li>
              <li>Can cause replication lag on replicas</li>
              <li>Might fill up your disk with WAL and dead tuples</li>
            </ul>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-6">
              <code className="text-sm text-slate-300 font-mono">{`-- BAD: Single update that touches all 50M rows
UPDATE users SET status = 'active' WHERE status IS NULL;

-- GOOD: Batched update with pauses for autovacuum
DO $$
DECLARE
  rows_updated INT;
  total_updated INT := 0;
  batch_size INT := 10000;
BEGIN
  LOOP
    UPDATE users
    SET status = 'active'
    WHERE id IN (
      SELECT id FROM users
      WHERE status IS NULL
      ORDER BY id
      LIMIT batch_size
    );

    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    total_updated := total_updated + rows_updated;

    RAISE NOTICE 'Updated % rows (% total)', rows_updated, total_updated;

    EXIT WHEN rows_updated = 0;

    -- Give autovacuum time to clean up dead tuples
    PERFORM pg_sleep(0.5);

    -- Commit each batch independently (PG 11+ procedures)
    COMMIT;
  END LOOP;
END $$;`}</code>
            </pre>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">5. Safe Constraint Addition</h2>

            <h3 className="text-xl font-semibold mt-8 mb-3 text-slate-200">NOT NULL constraints</h3>

            <p className="text-slate-300 leading-relaxed mb-4">
              Adding NOT NULL directly acquires ACCESS EXCLUSIVE and scans the entire table. Use the
              CHECK constraint pattern instead:
            </p>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-6">
              <code className="text-sm text-slate-300 font-mono">{`-- BAD: Scans entire table under ACCESS EXCLUSIVE
ALTER TABLE users ALTER COLUMN email SET NOT NULL;

-- GOOD: Two-step pattern
-- Step 1: Add CHECK constraint as NOT VALID (instant, no scan)
ALTER TABLE users ADD CONSTRAINT chk_email_not_null
  CHECK (email IS NOT NULL) NOT VALID;

-- Step 2: Validate the constraint (scans table but only holds
-- SHARE UPDATE EXCLUSIVE — does not block reads or writes)
ALTER TABLE users VALIDATE CONSTRAINT chk_email_not_null;

-- PG 12+: Once a valid CHECK (col IS NOT NULL) exists,
-- you can SET NOT NULL without a table scan:
ALTER TABLE users ALTER COLUMN email SET NOT NULL;
ALTER TABLE users DROP CONSTRAINT chk_email_not_null;`}</code>
            </pre>

            <h3 className="text-xl font-semibold mt-8 mb-3 text-slate-200">Foreign key constraints</h3>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-6">
              <code className="text-sm text-slate-300 font-mono">{`-- BAD: Validates all existing rows under SHARE ROW EXCLUSIVE
ALTER TABLE orders ADD CONSTRAINT fk_user
  FOREIGN KEY (user_id) REFERENCES users (id);

-- GOOD: Add NOT VALID, then validate separately
ALTER TABLE orders ADD CONSTRAINT fk_user
  FOREIGN KEY (user_id) REFERENCES users (id) NOT VALID;

ALTER TABLE orders VALIDATE CONSTRAINT fk_user;`}</code>
            </pre>

            <h3 className="text-xl font-semibold mt-8 mb-3 text-slate-200">Unique constraints</h3>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-6">
              <code className="text-sm text-slate-300 font-mono">{`-- BAD: Creates an index + validates under ACCESS EXCLUSIVE
ALTER TABLE users ADD CONSTRAINT uniq_email UNIQUE (email);

-- GOOD: Build the index concurrently, then attach it
CREATE UNIQUE INDEX CONCURRENTLY idx_users_email ON users (email);
ALTER TABLE users ADD CONSTRAINT uniq_email UNIQUE USING INDEX idx_users_email;`}</code>
            </pre>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">6. One DDL Per Transaction</h2>

            <p className="text-slate-300 leading-relaxed mb-4">
              Multiple DDL statements in a single transaction compound lock duration. Each statement
              acquires its own locks, and all locks are held until COMMIT:
            </p>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-6">
              <code className="text-sm text-slate-300 font-mono">{`-- BAD: Three DDL statements in one transaction
-- ACCESS EXCLUSIVE held for the entire combined duration
BEGIN;
ALTER TABLE users ADD COLUMN phone TEXT;
ALTER TABLE users ADD COLUMN address TEXT;
ALTER TABLE users ADD COLUMN city TEXT;
COMMIT;

-- GOOD: Separate transactions (or separate migration files)
ALTER TABLE users ADD COLUMN phone TEXT;
-- locks released
ALTER TABLE users ADD COLUMN address TEXT;
-- locks released
ALTER TABLE users ADD COLUMN city TEXT;
-- locks released`}</code>
            </pre>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">7. Test Migrations Against Production Data</h2>

            <p className="text-slate-300 leading-relaxed mb-4">
              Migrations that work on a dev database with 100 rows can cause outages on a production
              database with 100 million rows. The locking behavior is the same, but the duration is
              completely different.
            </p>

            <p className="text-slate-300 leading-relaxed mb-4">
              Best practices for migration testing:
            </p>

            <ul className="list-disc list-inside text-slate-300 space-y-2 mb-6 ml-4">
              <li>Maintain a staging database with production-sized data (or at least production-like volumes)</li>
              <li>Time your migrations on staging and set alerts for migrations that take longer than expected</li>
              <li>Use <code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">EXPLAIN</code> on any data migration queries to check for sequential scans</li>
              <li>Monitor <code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">pg_stat_activity</code> and <code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">pg_locks</code> during staging runs</li>
              <li>Run static analysis on migration files in CI to catch common issues early</li>
            </ul>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">8. Deployment Ordering</h2>

            <p className="text-slate-300 leading-relaxed mb-4">
              The order of application deployment vs migration execution matters:
            </p>

            <div className="overflow-x-auto mb-8">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left py-3 px-4 text-slate-300 font-semibold">Change Type</th>
                    <th className="text-left py-3 px-4 text-slate-300 font-semibold">Deploy Order</th>
                    <th className="text-left py-3 px-4 text-slate-300 font-semibold">Why</th>
                  </tr>
                </thead>
                <tbody className="text-slate-400">
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4">Add column</td>
                    <td className="py-3 px-4">Migration first, then app code</td>
                    <td className="py-3 px-4">Old code ignores new columns</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4">Remove column</td>
                    <td className="py-3 px-4">App code first, then migration</td>
                    <td className="py-3 px-4">Old code still references the column</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4">Rename column</td>
                    <td className="py-3 px-4">Expand-contract (3 deploys)</td>
                    <td className="py-3 px-4">Both old and new code need to work</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4">Add NOT NULL</td>
                    <td className="py-3 px-4">App code first (ensure no NULLs), then constraint</td>
                    <td className="py-3 px-4">Constraint validation fails if NULLs exist</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4">Add index</td>
                    <td className="py-3 px-4">Migration (CONCURRENTLY) anytime</td>
                    <td className="py-3 px-4">Indexes are transparent to app code</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">9. Monitor During Migrations</h2>

            <p className="text-slate-300 leading-relaxed mb-4">
              Always monitor these metrics during migration execution:
            </p>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-6">
              <code className="text-sm text-slate-300 font-mono">{`-- Active locks on the table being migrated
SELECT mode, granted, count(*)
FROM pg_locks
WHERE relation = 'users'::regclass
GROUP BY mode, granted;

-- Queries waiting for locks
SELECT pid, query, wait_event_type, wait_event,
       age(now(), query_start) AS duration
FROM pg_stat_activity
WHERE wait_event_type = 'Lock'
ORDER BY query_start;

-- Replication lag (if using replicas)
SELECT client_addr, state,
       pg_wal_lsn_diff(sent_lsn, replay_lsn) AS bytes_behind,
       replay_lag
FROM pg_stat_replication;`}</code>
            </pre>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">10. Enforce Best Practices in CI</h2>

            <p className="text-slate-300 leading-relaxed mb-4">
              The best migration practices are worthless if they are not enforced. Add automated checks
              to your CI pipeline that catch common mistakes before they reach production:
            </p>

            <ul className="list-disc list-inside text-slate-300 space-y-2 mb-6 ml-4">
              <li>Missing CONCURRENTLY on index operations</li>
              <li>Missing lock_timeout before DDL</li>
              <li>Volatile defaults that cause table rewrites</li>
              <li>Direct NOT NULL additions without the CHECK pattern</li>
              <li>Multiple DDL in a single transaction</li>
              <li>Unbatched backfills</li>
            </ul>

            <p className="text-slate-300 leading-relaxed mb-6">
              <a href="https://github.com/mickelsamuel/migrationpilot" className="text-blue-400 hover:text-blue-300">MigrationPilot</a>{' '}
              checks all of these patterns (and 80 more) as a CLI, GitHub Action, or Node.js library.
              It runs in under a second, requires no database connection for static analysis, and posts
              results as PR comments so your team catches issues during code review.
            </p>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-8">
              <code className="text-sm text-slate-300 font-mono">{`# Add to .github/workflows/migration-check.yml
- uses: mickelsamuel/migrationpilot@v1
  with:
    migration-path: "migrations/*.sql"
    fail-on: critical`}</code>
            </pre>
          </div>
        </div>
      </article>

      <footer className="border-t border-slate-800/50 py-12 px-6">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-blue-600 flex items-center justify-center font-bold text-xs">MP</div>
            <span className="text-sm text-slate-400">MigrationPilot</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-slate-500">
            <a href="/" className="hover:text-slate-300 transition-colors">Home</a>
            <a href="/blog" className="hover:text-slate-300 transition-colors">Blog</a>
            <a href="/docs" className="hover:text-slate-300 transition-colors">Docs</a>
            <a href="https://github.com/mickelsamuel/migrationpilot" className="hover:text-slate-300 transition-colors">GitHub</a>
          </div>
          <p className="text-xs text-slate-600">&copy; 2026 MigrationPilot</p>
        </div>
      </footer>
    </main>
  );
}
