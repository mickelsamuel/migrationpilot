import type { Metadata } from 'next';
import Navbar from '@/components/navbar';

export const metadata: Metadata = {
  title: 'The 5 PostgreSQL Migration Mistakes That Cause Production Outages — MigrationPilot',
  description: 'Real production incidents caused by unsafe PostgreSQL migrations: missing CONCURRENTLY, table rewrites, lock cascades, and the safe patterns to prevent them.',
  keywords: ['postgresql migration outage', 'postgresql lock timeout', 'create index concurrently', 'alter table lock', 'postgresql migration safety', 'database migration mistakes'],
  alternates: {
    canonical: '/blog/postgresql-migration-mistakes-outages',
  },
  openGraph: {
    title: 'The 5 PostgreSQL Migration Mistakes That Cause Production Outages',
    description: 'Real production incidents caused by unsafe PostgreSQL migrations: missing CONCURRENTLY, table rewrites, lock cascades, and the safe patterns to prevent them.',
    type: 'article',
    url: '/blog/postgresql-migration-mistakes-outages',
  },
};

export default function PostgresMigrationMistakes() {
  return (
    <main className="min-h-screen">
      <Navbar active="blog" />

      <article className="pt-32 pb-20 px-6">
        <div className="max-w-3xl mx-auto">
          <div className="mb-8">
            <a href="/blog" className="text-sm text-blue-400 hover:text-blue-300 transition-colors">&larr; Back to Blog</a>
          </div>

          <div className="flex items-center gap-3 text-sm text-slate-500 mb-4">
            <time dateTime="2026-02-28">February 28, 2026</time>
            <span className="w-1 h-1 rounded-full bg-slate-700" />
            <span>14 min read</span>
          </div>

          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
            The 5 PostgreSQL Migration Mistakes That Cause Production Outages
          </h1>

          <p className="text-xl text-slate-400 mb-12 leading-relaxed">
            Most PostgreSQL migration outages are caused by the same five patterns. Each one involves
            a lock that blocks queries longer than expected, a table rewrite that no one anticipated, or
            a cascade effect that turns a simple schema change into minutes of downtime. Here are the
            five mistakes, the production incidents they cause, and the safe patterns to avoid them.
          </p>

          <div className="prose prose-invert max-w-none">

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">Mistake #1: CREATE INDEX Without CONCURRENTLY</h2>

            <h3 className="text-xl font-semibold mt-8 mb-3 text-slate-200">The dangerous migration</h3>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-4">
              <code className="text-sm text-slate-300 font-mono">{`-- This looks harmless
CREATE INDEX idx_orders_customer_id ON orders (customer_id);`}</code>
            </pre>

            <h3 className="text-xl font-semibold mt-8 mb-3 text-slate-200">What happens in production</h3>

            <p className="text-slate-300 leading-relaxed mb-4">
              A regular <code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">CREATE INDEX</code> acquires
              a <strong className="text-slate-200">SHARE lock</strong> on the table. This lock blocks all INSERT, UPDATE,
              and DELETE operations for the entire duration of the index build.
            </p>

            <p className="text-slate-300 leading-relaxed mb-4">
              On a table with 1 million rows, an index build might take 5-30 seconds. On a table with 100 million
              rows, it can take minutes. During that entire time, every write to the table is blocked. Every API
              request that tries to insert or update a row in that table will queue up, waiting.
            </p>

            <p className="text-slate-300 leading-relaxed mb-4">
              The cascading effect is what makes this dangerous: as write queries queue up, they consume
              connection pool slots. When the connection pool is exhausted, new requests start failing. What
              started as an index build on one table becomes a total service outage.
            </p>

            <h3 className="text-xl font-semibold mt-8 mb-3 text-slate-200">The safe pattern</h3>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-4">
              <code className="text-sm text-slate-300 font-mono">{`-- Add CONCURRENTLY — builds the index without blocking writes
CREATE INDEX CONCURRENTLY idx_orders_customer_id ON orders (customer_id);`}</code>
            </pre>

            <p className="text-slate-300 leading-relaxed mb-4">
              <code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">CREATE INDEX CONCURRENTLY</code> acquires
              only a <strong className="text-slate-200">SHARE UPDATE EXCLUSIVE lock</strong>, which allows reads and writes
              to continue while the index is being built. It takes longer (two table scans instead of one), but
              your application stays up.
            </p>

            <p className="text-slate-300 leading-relaxed mb-6">
              <strong className="text-yellow-400">Important caveat:</strong> CONCURRENTLY cannot run inside a transaction.
              If your migration framework wraps migrations in transactions by default (Flyway, Liquibase, Knex),
              you need to disable the transaction for this specific migration.
            </p>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-6">
              <code className="text-sm text-slate-300 font-mono">{`-- Flyway: disable transaction for this migration
-- flyway:executeInTransaction=false
CREATE INDEX CONCURRENTLY idx_orders_customer_id ON orders (customer_id);

-- If the concurrent build fails, clean up the invalid index:
DROP INDEX CONCURRENTLY IF EXISTS idx_orders_customer_id;
-- Then retry the CREATE INDEX CONCURRENTLY`}</code>
            </pre>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">Mistake #2: ALTER TABLE SET NOT NULL Without the CHECK Pattern</h2>

            <h3 className="text-xl font-semibold mt-8 mb-3 text-slate-200">The dangerous migration</h3>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-4">
              <code className="text-sm text-slate-300 font-mono">{`-- Adding NOT NULL to an existing column
ALTER TABLE users ALTER COLUMN email SET NOT NULL;`}</code>
            </pre>

            <h3 className="text-xl font-semibold mt-8 mb-3 text-slate-200">What happens in production</h3>

            <p className="text-slate-300 leading-relaxed mb-4">
              <code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">SET NOT NULL</code> acquires
              an <strong className="text-slate-200">ACCESS EXCLUSIVE lock</strong> &mdash; the most restrictive lock
              in PostgreSQL. This lock blocks <em>everything</em>: reads, writes, even other
              <code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">SELECT</code> queries.
            </p>

            <p className="text-slate-300 leading-relaxed mb-4">
              While holding this lock, PostgreSQL scans the entire table to verify that no existing rows
              have NULL values in the column. On a 50-million-row table, this scan can take minutes. During
              those minutes, nothing else can touch the table. Not even reads.
            </p>

            <blockquote className="border-l-4 border-blue-500 pl-4 text-slate-400 italic mb-6">
              &quot;Nothing quite like the surprise you get the first time you rewrite every tuple on a table
              with 20M rows because you added a column with a default value.&quot; &mdash; Hacker News
            </blockquote>

            <h3 className="text-xl font-semibold mt-8 mb-3 text-slate-200">The safe pattern (PostgreSQL 12+)</h3>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-4">
              <code className="text-sm text-slate-300 font-mono">{`-- Step 1: Add a CHECK constraint with NOT VALID
-- This only checks new/modified rows, no full table scan
ALTER TABLE users ADD CONSTRAINT users_email_not_null
  CHECK (email IS NOT NULL) NOT VALID;

-- Step 2: Validate the constraint in a separate transaction
-- This scans the table but only holds a SHARE UPDATE EXCLUSIVE lock
-- (allows reads AND writes to continue)
ALTER TABLE users VALIDATE CONSTRAINT users_email_not_null;

-- Step 3: Now set NOT NULL — PostgreSQL sees the valid CHECK constraint
-- and skips the full table scan entirely
ALTER TABLE users ALTER COLUMN email SET NOT NULL;

-- Step 4: Drop the CHECK constraint (redundant now)
ALTER TABLE users DROP CONSTRAINT users_email_not_null;`}</code>
            </pre>

            <p className="text-slate-300 leading-relaxed mb-6">
              This four-step pattern is the standard safe approach. The key insight: once PostgreSQL sees a
              validated CHECK constraint that guarantees no NULLs exist, the <code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">SET NOT NULL</code> becomes
              a metadata-only operation that completes instantly.
            </p>

            <div className="bg-blue-950/30 border border-blue-800/50 rounded-lg p-4 mb-6">
              <p className="text-slate-300 text-sm">
                <strong className="text-blue-300">PostgreSQL 18 update:</strong> As of PostgreSQL 18 (September 2025),
                you can use <code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">ALTER TABLE ... ADD COLUMN ... NOT NULL NOT VALID</code> directly.
                This simplifies the pattern for new columns, though the CHECK pattern is still needed for
                existing columns.
              </p>
            </div>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">Mistake #3: ALTER COLUMN TYPE (Silent Table Rewrite)</h2>

            <h3 className="text-xl font-semibold mt-8 mb-3 text-slate-200">The dangerous migration</h3>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-4">
              <code className="text-sm text-slate-300 font-mono">{`-- Changing a column type
ALTER TABLE events ALTER COLUMN payload TYPE jsonb USING payload::jsonb;

-- Or seemingly innocent changes like:
ALTER TABLE users ALTER COLUMN name TYPE varchar(500);  -- was varchar(255)`}</code>
            </pre>

            <h3 className="text-xl font-semibold mt-8 mb-3 text-slate-200">What happens in production</h3>

            <p className="text-slate-300 leading-relaxed mb-4">
              Most column type changes trigger a <strong className="text-slate-200">full table rewrite</strong>.
              PostgreSQL creates a new copy of the table with the new column type, copies every row, then
              swaps the tables. The entire operation runs under an ACCESS EXCLUSIVE lock.
            </p>

            <p className="text-slate-300 leading-relaxed mb-4">
              On a 10GB table, a rewrite can take 10-30 minutes. During that time, no reads or writes are possible.
              Your application is completely blocked on that table. If the table is central to your application
              (users, orders, events), this is a full outage.
            </p>

            <p className="text-slate-300 leading-relaxed mb-4">
              What makes this especially dangerous is that many type changes <em>look</em> safe. Changing
              <code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">varchar(255)</code> to
              <code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">varchar(500)</code> seems like
              it should be a metadata change, but PostgreSQL rewrites the entire table.
            </p>

            <h3 className="text-xl font-semibold mt-8 mb-3 text-slate-200">Safe alternatives</h3>

            <p className="text-slate-300 leading-relaxed mb-4">
              There is no universal safe pattern for column type changes. The approach depends on the specific change:
            </p>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-4">
              <code className="text-sm text-slate-300 font-mono">{`-- varchar(255) → text: SAFE, no rewrite (just removes the length limit)
ALTER TABLE users ALTER COLUMN name TYPE text;

-- varchar(255) → varchar(500): REWRITES the table
-- Safe alternative: just use text instead
ALTER TABLE users ALTER COLUMN name TYPE text;

-- int → bigint: REWRITES the table
-- Safe alternative: expand-contract migration
-- 1. Add new column
ALTER TABLE events ADD COLUMN id_new bigint;
-- 2. Backfill in batches (application-level)
-- 3. Swap columns
-- 4. Drop old column`}</code>
            </pre>

            <p className="text-slate-300 leading-relaxed mb-6">
              The general principle: if the new type requires more storage per row or a different binary
              representation, PostgreSQL rewrites the table. The safe alternative is usually an expand-contract
              migration: add a new column, backfill, swap, drop.
            </p>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">Mistake #4: Running Migrations Without lock_timeout</h2>

            <h3 className="text-xl font-semibold mt-8 mb-3 text-slate-200">The dangerous migration</h3>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-4">
              <code className="text-sm text-slate-300 font-mono">{`-- No lock_timeout set — will wait indefinitely for the lock
ALTER TABLE orders ADD COLUMN discount_pct numeric(5,2);`}</code>
            </pre>

            <h3 className="text-xl font-semibold mt-8 mb-3 text-slate-200">What happens in production</h3>

            <p className="text-slate-300 leading-relaxed mb-4">
              Even a fast DDL operation like adding a nullable column needs to acquire a lock on the table.
              If there is a long-running query or transaction holding a conflicting lock on that table,
              your DDL statement will <strong className="text-slate-200">wait indefinitely</strong> for the lock.
            </p>

            <p className="text-slate-300 leading-relaxed mb-4">
              While your DDL statement is waiting, it goes into the lock queue. Here&apos;s the critical part:
              <strong className="text-slate-200"> every subsequent query on that table also gets queued behind your
              waiting DDL</strong>. Even simple SELECT queries. The lock queue is FIFO, and your DDL operation
              is blocking everything behind it.
            </p>

            <p className="text-slate-300 leading-relaxed mb-4">
              This is the &quot;lock cascade&quot; pattern. One long-running analytics query + one migration without
              lock_timeout = total table lockout. Your migration is waiting for the analytics query, and
              every application query is waiting for your migration.
            </p>

            <h3 className="text-xl font-semibold mt-8 mb-3 text-slate-200">The safe pattern</h3>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-4">
              <code className="text-sm text-slate-300 font-mono">{`-- Always set lock_timeout before DDL operations
SET lock_timeout = '5s';

-- Now if the lock can't be acquired within 5 seconds,
-- the statement fails instead of waiting indefinitely
ALTER TABLE orders ADD COLUMN discount_pct numeric(5,2);

-- Reset for safety
RESET lock_timeout;`}</code>
            </pre>

            <p className="text-slate-300 leading-relaxed mb-4">
              With <code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">lock_timeout</code> set,
              a failed lock acquisition gives you an error you can handle: retry after a short delay, kill the
              blocking query, or run the migration during a lower-traffic window. Without it, your only option
              is to manually kill the migration session while your application is down.
            </p>

            <p className="text-slate-300 leading-relaxed mb-6">
              A good deployment wrapper retries the migration 3-5 times with a short delay between attempts.
              If a 5-second lock_timeout fails 5 times in a row (25 seconds of retrying), something is genuinely
              blocking the table and you need to investigate &mdash; not wait forever.
            </p>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-6">
              <code className="text-sm text-slate-300 font-mono">{`-- Retry wrapper pattern (pseudocode)
for attempt in 1..5:
  BEGIN;
    SET LOCAL lock_timeout = '5s';
    ALTER TABLE orders ADD COLUMN discount_pct numeric(5,2);
  COMMIT;
  -- Success, exit loop

  -- On lock_timeout error:
  ROLLBACK;
  sleep(2 * attempt);  -- Exponential backoff

-- If all 5 attempts fail, alert and investigate`}</code>
            </pre>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">Mistake #5: Adding a Foreign Key Without NOT VALID</h2>

            <h3 className="text-xl font-semibold mt-8 mb-3 text-slate-200">The dangerous migration</h3>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-4">
              <code className="text-sm text-slate-300 font-mono">{`-- Adding a foreign key constraint
ALTER TABLE orders
  ADD CONSTRAINT orders_customer_fk
  FOREIGN KEY (customer_id) REFERENCES customers (id);`}</code>
            </pre>

            <h3 className="text-xl font-semibold mt-8 mb-3 text-slate-200">What happens in production</h3>

            <p className="text-slate-300 leading-relaxed mb-4">
              Adding a foreign key constraint acquires locks on <strong className="text-slate-200">both tables</strong> &mdash;
              the referencing table (orders) and the referenced table (customers). PostgreSQL needs to scan
              the entire referencing table to verify that every value in the foreign key column exists in the
              referenced table.
            </p>

            <p className="text-slate-300 leading-relaxed mb-4">
              GoCardless documented a 15-second API outage caused by exactly this pattern: a foreign key
              constraint that locked both tables simultaneously, blocking all queries on both.
            </p>

            <p className="text-slate-300 leading-relaxed mb-4">
              The lock on the referenced table (customers) is what most developers don&apos;t expect. You think
              you are modifying the orders table, but you are actually locking customers too. If customers
              is your most-queried table, this cascades quickly.
            </p>

            <h3 className="text-xl font-semibold mt-8 mb-3 text-slate-200">The safe pattern</h3>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-4">
              <code className="text-sm text-slate-300 font-mono">{`-- Step 1: Add the constraint with NOT VALID
-- This only checks new/modified rows, no full table scan
-- Still locks both tables briefly, but completes instantly
ALTER TABLE orders
  ADD CONSTRAINT orders_customer_fk
  FOREIGN KEY (customer_id) REFERENCES customers (id)
  NOT VALID;

-- Step 2: Validate the constraint in a separate transaction
-- This scans the table but holds a weaker lock (SHARE UPDATE EXCLUSIVE)
-- Reads and writes continue normally on both tables
ALTER TABLE orders VALIDATE CONSTRAINT orders_customer_fk;`}</code>
            </pre>

            <p className="text-slate-300 leading-relaxed mb-6">
              The NOT VALID + VALIDATE pattern splits the operation into two phases: a fast metadata change
              (milliseconds, locks both tables briefly) and a slow validation scan (seconds to minutes, but
              only holds a SHARE UPDATE EXCLUSIVE lock that allows reads and writes).
            </p>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">Common Thread: The Lock Queue Problem</h2>

            <p className="text-slate-300 leading-relaxed mb-4">
              All five mistakes share the same underlying mechanism: they acquire a lock that&apos;s too strong
              for too long. The PostgreSQL lock queue makes this worse than you&apos;d expect:
            </p>

            <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 mb-6">
              <ol className="text-slate-300 space-y-3 list-decimal list-inside">
                <li>Your DDL statement requests an ACCESS EXCLUSIVE lock</li>
                <li>A long-running query is holding a conflicting lock &mdash; your DDL waits</li>
                <li>While your DDL waits, all new queries on the table queue <em>behind</em> your DDL</li>
                <li>The lock queue grows: 10 queries, 50 queries, 200 queries</li>
                <li>Connection pool fills up with blocked queries</li>
                <li>New requests can&apos;t get a connection &mdash; service returns 5xx errors</li>
              </ol>
            </div>

            <p className="text-slate-300 leading-relaxed mb-6">
              The total outage duration is not the time your DDL takes. It&apos;s the time the blocking query
              was already running + the time your DDL takes + the time to drain the queued requests. A 3-second
              DDL operation behind a 60-second analytics query causes a 63+ second outage.
            </p>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">Preventing These Mistakes</h2>

            <p className="text-slate-300 leading-relaxed mb-4">
              The safe patterns above are well-documented but rarely enforced. A developer who writes migrations
              twice a month is unlikely to remember the NOT VALID + VALIDATE pattern or the lock_timeout
              requirement every time.
            </p>

            <p className="text-slate-300 leading-relaxed mb-4">
              The most effective prevention is automated linting in CI. When a migration is opened in a pull
              request, a linter can catch all five patterns before they reach production:
            </p>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-4">
              <code className="text-sm text-slate-300 font-mono">{`# Check all migration files for safety issues
npx migrationpilot check migrations/*.sql --fail-on critical

# Example output:
# migrations/V42__add_index.sql
#   MP001 [critical] CREATE INDEX without CONCURRENTLY
#     Acquires: SHARE lock (blocks writes)
#     Safe alternative:
#       CREATE INDEX CONCURRENTLY idx_orders_customer_id ON orders (customer_id);
#
#   MP004 [warning] Missing lock_timeout
#     Safe alternative:
#       SET lock_timeout = '5s';`}</code>
            </pre>

            <p className="text-slate-300 leading-relaxed mb-4">
              Free tools that catch these patterns:
            </p>

            <ul className="list-disc list-inside text-slate-300 space-y-2 mb-6 ml-4">
              <li><a href="https://github.com/sbdchd/squawk" className="text-blue-400 hover:text-blue-300">Squawk</a> &mdash; 32 rules, Rust, GitHub Action</li>
              <li><a href="https://github.com/ankane/strong_migrations" className="text-blue-400 hover:text-blue-300">strong_migrations</a> &mdash; Rails only, excellent error messages</li>
              <li><a href="https://github.com/mickelsamuel/migrationpilot" className="text-blue-400 hover:text-blue-300">MigrationPilot</a> &mdash; 83 rules, lock classification, auto-fix, GitHub Action</li>
            </ul>

            <p className="text-slate-300 leading-relaxed mb-6">
              The specific tool matters less than having <em>any</em> automated check. These five mistakes are
              repetitive patterns that a linter catches in milliseconds. The production incidents they cause
              take hours to diagnose and recover from.
            </p>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">Quick Reference</h2>

            <div className="overflow-x-auto mb-8">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left py-3 px-4 text-slate-300 font-semibold">Mistake</th>
                    <th className="text-left py-3 px-4 text-slate-300 font-semibold">Lock Acquired</th>
                    <th className="text-left py-3 px-4 text-slate-300 font-semibold">Safe Pattern</th>
                  </tr>
                </thead>
                <tbody className="text-slate-400">
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4">CREATE INDEX (no CONCURRENTLY)</td>
                    <td className="py-3 px-4 text-red-400">SHARE</td>
                    <td className="py-3 px-4">CREATE INDEX CONCURRENTLY</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4">SET NOT NULL (direct)</td>
                    <td className="py-3 px-4 text-red-400">ACCESS EXCLUSIVE</td>
                    <td className="py-3 px-4">CHECK NOT VALID + VALIDATE</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4">ALTER COLUMN TYPE</td>
                    <td className="py-3 px-4 text-red-400">ACCESS EXCLUSIVE</td>
                    <td className="py-3 px-4">Expand-contract migration</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4">No lock_timeout</td>
                    <td className="py-3 px-4 text-yellow-400">Any (queues indefinitely)</td>
                    <td className="py-3 px-4">SET lock_timeout = &apos;5s&apos;</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4">FK without NOT VALID</td>
                    <td className="py-3 px-4 text-red-400">SHARE ROW EXCLUSIVE (both tables)</td>
                    <td className="py-3 px-4">NOT VALID + VALIDATE</td>
                  </tr>
                </tbody>
              </table>
            </div>

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
