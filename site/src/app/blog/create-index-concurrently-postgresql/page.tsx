import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'CREATE INDEX CONCURRENTLY: The Complete PostgreSQL Guide — MigrationPilot',
  description: 'Everything you need to know about CREATE INDEX CONCURRENTLY in PostgreSQL: why it matters, failure modes, retry patterns, and REINDEX CONCURRENTLY.',
  keywords: ['create index concurrently postgresql', 'postgresql concurrent index', 'postgresql index without locking', 'reindex concurrently', 'postgresql index creation'],
  alternates: {
    canonical: '/blog/create-index-concurrently-postgresql',
  },
  openGraph: {
    title: 'CREATE INDEX CONCURRENTLY: The Complete PostgreSQL Guide',
    description: 'Everything you need to know about CREATE INDEX CONCURRENTLY in PostgreSQL: why it matters, failure modes, retry patterns, and REINDEX CONCURRENTLY.',
    type: 'article',
    url: '/blog/create-index-concurrently-postgresql',
  },
};

export default function CreateIndexConcurrentlyGuide() {
  return (
    <main className="min-h-screen">
      <nav className="fixed top-0 w-full z-50 border-b border-slate-800/50 bg-slate-950/80 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-6 py-4">
          <a href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-sm">MP</div>
            <span className="font-semibold text-lg">MigrationPilot</span>
          </a>
          <div className="hidden md:flex items-center gap-6 text-sm text-slate-400">
            <a href="/docs" className="hover:text-white transition-colors">Docs</a>
            <a href="/blog" className="hover:text-white transition-colors">Blog</a>
            <a href="/#pricing" className="hover:text-white transition-colors">Pricing</a>
            <a href="https://github.com/mickelsamuel/migrationpilot" className="hover:text-white transition-colors">GitHub</a>
          </div>
        </div>
      </nav>

      <article className="pt-32 pb-20 px-6">
        <div className="max-w-3xl mx-auto">
          <div className="mb-8">
            <a href="/blog" className="text-sm text-blue-400 hover:text-blue-300 transition-colors">&larr; Back to Blog</a>
          </div>

          <div className="flex items-center gap-3 text-sm text-slate-500 mb-4">
            <time dateTime="2026-02-24">February 24, 2026</time>
            <span className="w-1 h-1 rounded-full bg-slate-700" />
            <span>11 min read</span>
          </div>

          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
            CREATE INDEX CONCURRENTLY: The Complete PostgreSQL Guide
          </h1>

          <p className="text-xl text-slate-400 mb-12 leading-relaxed">
            CREATE INDEX CONCURRENTLY is the single most important command for safely adding indexes
            to production PostgreSQL tables. This guide covers how it works, why it sometimes fails,
            how to handle failures, and the related REINDEX CONCURRENTLY command.
          </p>

          <div className="prose prose-invert max-w-none">
            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">Why Regular CREATE INDEX Is Dangerous</h2>

            <p className="text-slate-300 leading-relaxed mb-4">
              A regular <code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">CREATE INDEX</code> acquires a SHARE lock on the table.
              This lock blocks all INSERT, UPDATE, and DELETE operations for the entire duration of the
              index build. On a large table, that can mean minutes or even hours of write downtime.
            </p>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-6">
              <code className="text-sm text-slate-300 font-mono">{`-- DANGEROUS: Blocks all writes for the entire build duration
CREATE INDEX idx_orders_customer_id ON orders (customer_id);

-- On a 50M row table, this might take 3-5 minutes
-- Every INSERT, UPDATE, DELETE queues behind this lock
-- Connection pools fill up, application errors cascade`}</code>
            </pre>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">How CREATE INDEX CONCURRENTLY Works</h2>

            <p className="text-slate-300 leading-relaxed mb-4">
              CREATE INDEX CONCURRENTLY builds the index without holding a lock that blocks writes. Instead
              of scanning the table once under a SHARE lock, it performs the build in three phases:
            </p>

            <ol className="list-decimal list-inside text-slate-300 space-y-4 mb-6 ml-4">
              <li>
                <strong className="text-slate-200">Phase 1 — Catalog entry:</strong> PostgreSQL creates the index
                entry in the system catalog with an &quot;invalid&quot; flag. This requires a brief SHARE UPDATE EXCLUSIVE lock
                (does not block reads or writes). The index is not yet usable by the query planner.
              </li>
              <li>
                <strong className="text-slate-200">Phase 2 — First table scan:</strong> PostgreSQL scans the entire table
                and builds the index entries. This happens under a SHARE UPDATE EXCLUSIVE lock, which allows
                concurrent INSERT, UPDATE, and DELETE operations to continue. Changes that happen during
                the scan are tracked.
              </li>
              <li>
                <strong className="text-slate-200">Phase 3 — Second table scan:</strong> PostgreSQL does a second pass
                to catch any rows that were modified during Phase 2. Once this is complete, the index is
                marked as valid and becomes usable by the query planner. Another brief SHARE UPDATE EXCLUSIVE
                lock is acquired to wait for any transactions that started before Phase 2 to complete.
              </li>
            </ol>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-6">
              <code className="text-sm text-slate-300 font-mono">{`-- SAFE: Does not block reads or writes
CREATE INDEX CONCURRENTLY idx_orders_customer_id ON orders (customer_id);

-- Takes longer than regular CREATE INDEX (roughly 2-3x)
-- but your application continues running normally`}</code>
            </pre>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">The Transaction Restriction</h2>

            <p className="text-slate-300 leading-relaxed mb-4">
              CREATE INDEX CONCURRENTLY cannot run inside a transaction block. This is a hard PostgreSQL
              limitation. If you try, you get an error:
            </p>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-6">
              <code className="text-sm text-slate-300 font-mono">{`-- This fails immediately
BEGIN;
CREATE INDEX CONCURRENTLY idx_email ON users (email);
COMMIT;
-- ERROR: CREATE INDEX CONCURRENTLY cannot run inside a transaction block

-- The solution: run it outside a transaction
CREATE INDEX CONCURRENTLY idx_email ON users (email);`}</code>
            </pre>

            <p className="text-slate-300 leading-relaxed mb-6">
              This matters because many migration frameworks wrap each migration file in a transaction by default.
              If your framework does this (Flyway, Alembic, Django, Rails), you need to configure it to run
              specific migrations outside a transaction. Check your framework&apos;s documentation for how to do this.
            </p>

            <div className="overflow-x-auto mb-8">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left py-3 px-4 text-slate-300 font-semibold">Framework</th>
                    <th className="text-left py-3 px-4 text-slate-300 font-semibold">How to Disable Transaction</th>
                  </tr>
                </thead>
                <tbody className="text-slate-400">
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4 font-semibold text-slate-300">Django</td>
                    <td className="py-3 px-4 font-mono text-sm">atomic = False on the Migration class</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4 font-semibold text-slate-300">Rails</td>
                    <td className="py-3 px-4 font-mono text-sm">disable_ddl_transaction!</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4 font-semibold text-slate-300">Flyway</td>
                    <td className="py-3 px-4 font-mono text-sm">executeInTransaction=false (in SQL comment)</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4 font-semibold text-slate-300">Alembic</td>
                    <td className="py-3 px-4 font-mono text-sm">{`op.execute() with connection.execution_options(isolation_level="AUTOCOMMIT")`}</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4 font-semibold text-slate-300">Knex</td>
                    <td className="py-3 px-4 font-mono text-sm">knex.schema.raw() outside transaction</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">Failure Modes and Recovery</h2>

            <p className="text-slate-300 leading-relaxed mb-4">
              CREATE INDEX CONCURRENTLY can fail partway through. Unlike a regular CREATE INDEX (which rolls
              back cleanly on failure), a failed CONCURRENTLY operation leaves behind an <strong className="text-slate-200">invalid index</strong>.
            </p>

            <p className="text-slate-300 leading-relaxed mb-4">
              Common failure causes:
            </p>

            <ul className="list-disc list-inside text-slate-300 space-y-2 mb-6 ml-4">
              <li>Deadlock with another transaction</li>
              <li>Unique constraint violation (for UNIQUE indexes)</li>
              <li>Out of disk space</li>
              <li>statement_timeout or lock_timeout reached</li>
              <li>A long-running transaction that prevents Phase 3 from completing</li>
            </ul>

            <h3 className="text-xl font-semibold mt-8 mb-3 text-slate-200">Detecting invalid indexes</h3>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-6">
              <code className="text-sm text-slate-300 font-mono">{`-- Find all invalid indexes in the database
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE indexname IN (
  SELECT indexrelid::regclass::text
  FROM pg_index
  WHERE NOT indisvalid
);`}</code>
            </pre>

            <h3 className="text-xl font-semibold mt-8 mb-3 text-slate-200">Recovering from a failed build</h3>

            <p className="text-slate-300 leading-relaxed mb-4">
              You have two options when a concurrent index build fails:
            </p>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-6">
              <code className="text-sm text-slate-300 font-mono">{`-- Option 1: Drop and rebuild
DROP INDEX CONCURRENTLY idx_orders_customer_id;
CREATE INDEX CONCURRENTLY idx_orders_customer_id ON orders (customer_id);

-- Option 2: Use REINDEX CONCURRENTLY (PG 12+)
-- This replaces the invalid index in-place
REINDEX INDEX CONCURRENTLY idx_orders_customer_id;`}</code>
            </pre>

            <p className="text-slate-300 leading-relaxed mb-6">
              REINDEX CONCURRENTLY (available since PostgreSQL 12) is generally preferred because it
              rebuilds the index in a single operation. It creates a new index with a temporary name,
              swaps it with the old one, and drops the old one — all without blocking writes.
            </p>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">REINDEX CONCURRENTLY (PostgreSQL 12+)</h2>

            <p className="text-slate-300 leading-relaxed mb-4">
              REINDEX CONCURRENTLY was added in PostgreSQL 12. It rebuilds an existing index without
              blocking writes, similar to how CREATE INDEX CONCURRENTLY works. This is useful for:
            </p>

            <ul className="list-disc list-inside text-slate-300 space-y-2 mb-6 ml-4">
              <li>Rebuilding invalid indexes left by failed CONCURRENTLY operations</li>
              <li>Rebuilding bloated indexes (index bloat can slow down queries significantly)</li>
              <li>Rebuilding corrupt indexes</li>
              <li>Upgrading index parameters (e.g., changing fillfactor)</li>
            </ul>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-6">
              <code className="text-sm text-slate-300 font-mono">{`-- Rebuild a single index without blocking writes
REINDEX INDEX CONCURRENTLY idx_orders_customer_id;

-- Rebuild all indexes on a table
REINDEX TABLE CONCURRENTLY orders;

-- Rebuild all indexes in a schema
REINDEX SCHEMA CONCURRENTLY public;

-- DANGEROUS: Without CONCURRENTLY, REINDEX holds ACCESS EXCLUSIVE
-- This blocks all reads and writes
REINDEX INDEX idx_orders_customer_id;  -- Don't do this in production`}</code>
            </pre>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">Performance Considerations</h2>

            <p className="text-slate-300 leading-relaxed mb-4">
              CREATE INDEX CONCURRENTLY is slower than regular CREATE INDEX. Expect roughly 2-3x the
              build time because:
            </p>

            <ul className="list-disc list-inside text-slate-300 space-y-2 mb-6 ml-4">
              <li>It scans the table twice instead of once</li>
              <li>It needs to track concurrent modifications between the two scans</li>
              <li>It waits for existing transactions to complete before finalizing</li>
            </ul>

            <p className="text-slate-300 leading-relaxed mb-4">
              You can speed up concurrent index builds by tuning these settings (for the session only):
            </p>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-6">
              <code className="text-sm text-slate-300 font-mono">{`-- Increase maintenance_work_mem for faster index builds
-- Default is typically 64MB — increase for large tables
SET maintenance_work_mem = '1GB';

-- Increase max_parallel_maintenance_workers (PG 11+)
-- Allows parallel index builds
SET max_parallel_maintenance_workers = 4;

-- Then create the index
CREATE INDEX CONCURRENTLY idx_orders_created_at ON orders (created_at);

-- Reset settings
RESET maintenance_work_mem;
RESET max_parallel_maintenance_workers;`}</code>
            </pre>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">DROP INDEX CONCURRENTLY</h2>

            <p className="text-slate-300 leading-relaxed mb-4">
              Just like creation, dropping an index normally acquires an ACCESS EXCLUSIVE lock. Use
              DROP INDEX CONCURRENTLY to avoid blocking reads and writes:
            </p>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-6">
              <code className="text-sm text-slate-300 font-mono">{`-- DANGEROUS: Blocks all reads and writes
DROP INDEX idx_orders_old;

-- SAFE: Does not block reads or writes
DROP INDEX CONCURRENTLY idx_orders_old;

-- Note: Like CREATE, DROP INDEX CONCURRENTLY cannot run
-- inside a transaction block`}</code>
            </pre>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">Retry Pattern for CI/CD</h2>

            <p className="text-slate-300 leading-relaxed mb-4">
              Since CREATE INDEX CONCURRENTLY can fail due to transient conditions (deadlocks, long-running
              transactions), a robust migration strategy includes retry logic:
            </p>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-6">
              <code className="text-sm text-slate-300 font-mono">{`#!/bin/bash
# retry-create-index.sh
MAX_RETRIES=3
RETRY_DELAY=10

for i in $(seq 1 $MAX_RETRIES); do
  echo "Attempt $i: Creating index..."

  # Drop invalid index if it exists from a previous failed attempt
  psql -c "DROP INDEX CONCURRENTLY IF EXISTS idx_orders_customer_id;" 2>/dev/null

  # Try to create the index
  if psql -c "CREATE INDEX CONCURRENTLY idx_orders_customer_id ON orders (customer_id);"; then
    echo "Index created successfully"
    exit 0
  fi

  echo "Failed on attempt $i, waiting $RETRY_DELAY seconds..."
  sleep $RETRY_DELAY
done

echo "Failed after $MAX_RETRIES attempts"
exit 1`}</code>
            </pre>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">Unique Index Considerations</h2>

            <p className="text-slate-300 leading-relaxed mb-4">
              Creating a UNIQUE index concurrently has an additional failure mode: if duplicate values exist
              in the column, the build fails and leaves an invalid index. Always check for duplicates first:
            </p>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-6">
              <code className="text-sm text-slate-300 font-mono">{`-- Check for duplicates before creating a unique index
SELECT email, count(*)
FROM users
GROUP BY email
HAVING count(*) > 1
LIMIT 10;

-- If duplicates exist, resolve them first
-- Then create the unique index
CREATE UNIQUE INDEX CONCURRENTLY idx_users_email ON users (email);`}</code>
            </pre>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">Summary: The Rules</h2>

            <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 mb-8">
              <ul className="list-disc list-inside text-slate-300 space-y-3">
                <li>Always use CONCURRENTLY for CREATE INDEX, DROP INDEX, and REINDEX in production</li>
                <li>Never run CONCURRENTLY operations inside a transaction block</li>
                <li>Check for invalid indexes after failed CONCURRENTLY operations</li>
                <li>Use REINDEX CONCURRENTLY (PG 12+) to rebuild failed or bloated indexes</li>
                <li>Implement retry logic in your deployment scripts</li>
                <li>Increase maintenance_work_mem for large table index builds</li>
              </ul>
            </div>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">Automate the Check</h2>

            <p className="text-slate-300 leading-relaxed mb-6">
              Forgetting CONCURRENTLY on a CREATE INDEX is one of the most common migration mistakes.{' '}
              <a href="https://github.com/mickelsamuel/migrationpilot" className="text-blue-400 hover:text-blue-300">MigrationPilot</a>{' '}
              catches this with rule MP001 (require-concurrent-index) and can auto-fix it — adding CONCURRENTLY
              and flagging if the statement is inside a transaction block. It also catches missing CONCURRENTLY
              on DROP INDEX (MP009) and REINDEX (MP021). Add it to your CI pipeline to enforce these patterns
              automatically.
            </p>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-8">
              <code className="text-sm text-slate-300 font-mono">{`npx migrationpilot analyze migrations/004_add_indexes.sql --fix`}</code>
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
