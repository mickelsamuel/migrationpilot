import type { Metadata } from 'next';
import Navbar from '@/components/navbar';

export const metadata: Metadata = {
  title: 'Adding NOT NULL Constraints to Existing PostgreSQL Columns Safely — MigrationPilot',
  description: 'The CHECK constraint NOT VALID + VALIDATE pattern for adding NOT NULL without locking your table. Includes version-specific advice for PG 11 and below vs PG 12+.',
  keywords: ['postgresql add not null constraint', 'postgresql not null safely', 'check constraint not valid', 'alter column set not null', 'postgresql not null without downtime'],
  alternates: {
    canonical: '/blog/postgresql-not-null-constraint-safely',
  },
  openGraph: {
    title: 'Adding NOT NULL Constraints to Existing PostgreSQL Columns Safely',
    description: 'The CHECK constraint NOT VALID + VALIDATE pattern for adding NOT NULL without locking your table.',
    type: 'article',
    url: '/blog/postgresql-not-null-constraint-safely',
  },
};

export default function PostgreSQLNotNullSafely() {
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
            <span>9 min read</span>
          </div>

          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
            Adding NOT NULL Constraints to Existing PostgreSQL Columns Safely
          </h1>

          <p className="text-xl text-slate-400 mb-12 leading-relaxed">
            Adding a NOT NULL constraint to an existing column is one of the most common schema changes,
            and one of the most dangerous. The naive approach scans the entire table under an ACCESS
            EXCLUSIVE lock. On a large table, this causes an outage. Here is the safe pattern.
          </p>

          <div className="prose prose-invert max-w-none">
            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">The Problem with SET NOT NULL</h2>

            <p className="text-slate-300 leading-relaxed mb-4">
              When you run <code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">ALTER TABLE ... ALTER COLUMN ... SET NOT NULL</code>,
              PostgreSQL must verify that no existing rows have NULL values in that column. To do this,
              it scans the entire table while holding an ACCESS EXCLUSIVE lock.
            </p>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-6">
              <code className="text-sm text-slate-300 font-mono">{`-- DANGEROUS: Full table scan under ACCESS EXCLUSIVE
-- On a 50M row table, this blocks ALL queries for minutes
ALTER TABLE users ALTER COLUMN email SET NOT NULL;

-- What happens internally:
-- 1. Acquires ACCESS EXCLUSIVE lock (blocks everything)
-- 2. Scans every row to verify email IS NOT NULL
-- 3. If any NULL found: fails with error
-- 4. If all rows pass: sets the constraint
-- 5. Releases lock

-- During step 2, no query can read or write the table`}</code>
            </pre>

            <p className="text-slate-300 leading-relaxed mb-6">
              ACCESS EXCLUSIVE means nothing else can happen on this table. No SELECT, no INSERT, no UPDATE,
              no DELETE. And it queues — any query that tries to access the table while the scan is
              running gets queued, filling up your connection pool.
            </p>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">The Safe Pattern: CHECK + VALIDATE</h2>

            <p className="text-slate-300 leading-relaxed mb-4">
              The safe approach uses a CHECK constraint with NOT VALID to split the operation into two
              steps with different lock levels:
            </p>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-6">
              <code className="text-sm text-slate-300 font-mono">{`-- Step 1: Add the constraint as NOT VALID
-- Acquires ACCESS EXCLUSIVE but is INSTANT (no table scan)
-- Only new inserts/updates are checked going forward
ALTER TABLE users ADD CONSTRAINT chk_email_not_null
  CHECK (email IS NOT NULL) NOT VALID;

-- Step 2: Validate the constraint
-- Acquires SHARE UPDATE EXCLUSIVE (does NOT block reads or writes)
-- Scans the entire table to verify existing rows
ALTER TABLE users VALIDATE CONSTRAINT chk_email_not_null;`}</code>
            </pre>

            <p className="text-slate-300 leading-relaxed mb-4">
              The key differences from the direct SET NOT NULL approach:
            </p>

            <div className="overflow-x-auto mb-8">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left py-3 px-4 text-slate-300 font-semibold">Aspect</th>
                    <th className="text-left py-3 px-4 text-slate-300 font-semibold">SET NOT NULL</th>
                    <th className="text-left py-3 px-4 text-slate-300 font-semibold">CHECK + VALIDATE</th>
                  </tr>
                </thead>
                <tbody className="text-slate-400">
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4">Lock type (add)</td>
                    <td className="py-3 px-4 text-red-400">ACCESS EXCLUSIVE</td>
                    <td className="py-3 px-4 text-green-400">ACCESS EXCLUSIVE (instant)</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4">Lock type (validate)</td>
                    <td className="py-3 px-4 text-red-400">Same lock, same operation</td>
                    <td className="py-3 px-4 text-green-400">SHARE UPDATE EXCLUSIVE</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4">Blocks reads?</td>
                    <td className="py-3 px-4 text-red-400">Yes (during scan)</td>
                    <td className="py-3 px-4 text-green-400">No</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4">Blocks writes?</td>
                    <td className="py-3 px-4 text-red-400">Yes (during scan)</td>
                    <td className="py-3 px-4 text-green-400">No</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4">New rows checked?</td>
                    <td className="py-3 px-4">After constraint set</td>
                    <td className="py-3 px-4">Immediately after Step 1</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">PostgreSQL 12+: Converting CHECK to NOT NULL</h2>

            <p className="text-slate-300 leading-relaxed mb-4">
              Starting with PostgreSQL 12, if a validated CHECK constraint of the form{' '}
              <code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">CHECK (column IS NOT NULL)</code> exists,
              PostgreSQL recognizes that the column already has a not-null guarantee. In this case,{' '}
              <code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">SET NOT NULL</code> skips the table scan
              and completes instantly:
            </p>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-6">
              <code className="text-sm text-slate-300 font-mono">{`-- Full safe pattern for PG 12+:

-- Step 1: Add NOT VALID CHECK constraint (instant)
ALTER TABLE users ADD CONSTRAINT chk_email_not_null
  CHECK (email IS NOT NULL) NOT VALID;

-- Step 2: Validate (scans table, but under safe lock)
ALTER TABLE users VALIDATE CONSTRAINT chk_email_not_null;

-- Step 3: Convert to real NOT NULL (instant — no scan needed!)
-- PG 12+ skips the scan because it sees the validated CHECK
ALTER TABLE users ALTER COLUMN email SET NOT NULL;

-- Step 4: Drop the now-redundant CHECK constraint
ALTER TABLE users DROP CONSTRAINT chk_email_not_null;`}</code>
            </pre>

            <p className="text-slate-300 leading-relaxed mb-6">
              The result is identical to running SET NOT NULL directly, but without the dangerous
              full-table scan under ACCESS EXCLUSIVE. The total lock time is a few milliseconds
              in Steps 1, 3, and 4. Step 2 scans the table but does not block any queries.
            </p>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">PostgreSQL 11 and Earlier</h2>

            <p className="text-slate-300 leading-relaxed mb-4">
              On PostgreSQL 11 and earlier, the SET NOT NULL optimization does not exist. After
              validating the CHECK constraint, you have two options:
            </p>

            <h3 className="text-xl font-semibold mt-8 mb-3 text-slate-200">Option A: Keep the CHECK constraint (recommended)</h3>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-6">
              <code className="text-sm text-slate-300 font-mono">{`-- Just use the CHECK constraint as your not-null guarantee
-- This provides the same data integrity as SET NOT NULL
ALTER TABLE users ADD CONSTRAINT chk_email_not_null
  CHECK (email IS NOT NULL) NOT VALID;
ALTER TABLE users VALIDATE CONSTRAINT chk_email_not_null;

-- Done. The CHECK constraint enforces not-null for all
-- existing and future rows. No need for SET NOT NULL.`}</code>
            </pre>

            <p className="text-slate-300 leading-relaxed mb-6">
              The CHECK constraint provides the same guarantee as SET NOT NULL. The only difference is
              cosmetic: <code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">\d users</code> will not show
              &quot;not null&quot; next to the column, but the constraint is visible in the constraints section. Some ORMs
              may not recognize the CHECK constraint as a not-null guarantee, but the data integrity
              is identical.
            </p>

            <h3 className="text-xl font-semibold mt-8 mb-3 text-slate-200">Option B: Accept the brief lock (small tables only)</h3>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-6">
              <code className="text-sm text-slate-300 font-mono">{`-- If the table is small enough (< 100K rows), the scan
-- under ACCESS EXCLUSIVE is fast enough to be acceptable
-- Use lock_timeout to prevent the lock queue problem
SET lock_timeout = '5s';
ALTER TABLE users ALTER COLUMN email SET NOT NULL;
RESET lock_timeout;`}</code>
            </pre>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">Handling Existing NULL Values</h2>

            <p className="text-slate-300 leading-relaxed mb-4">
              Before adding a NOT NULL constraint, you need to ensure no NULL values exist. The
              VALIDATE step will fail if it finds any. Backfill NULLs first:
            </p>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-6">
              <code className="text-sm text-slate-300 font-mono">{`-- Step 0: Backfill NULL values (before adding the constraint)
-- Do this in batches to avoid long-running transactions

-- Check how many NULLs exist
SELECT count(*) FROM users WHERE email IS NULL;

-- Backfill in batches
UPDATE users
SET email = 'unknown@example.com'
WHERE id IN (
  SELECT id FROM users
  WHERE email IS NULL
  ORDER BY id
  LIMIT 10000
);
-- Repeat until no NULLs remain

-- Then proceed with the CHECK + VALIDATE pattern
ALTER TABLE users ADD CONSTRAINT chk_email_not_null
  CHECK (email IS NOT NULL) NOT VALID;
ALTER TABLE users VALIDATE CONSTRAINT chk_email_not_null;`}</code>
            </pre>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">Common Mistakes</h2>

            <h3 className="text-xl font-semibold mt-8 mb-3 text-slate-200">1. Forgetting NOT VALID</h3>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-6">
              <code className="text-sm text-slate-300 font-mono">{`-- BAD: Without NOT VALID, ADD CONSTRAINT scans the table
-- under SHARE ROW EXCLUSIVE (blocks writes)
ALTER TABLE users ADD CONSTRAINT chk_email_not_null
  CHECK (email IS NOT NULL);

-- GOOD: NOT VALID makes it instant
ALTER TABLE users ADD CONSTRAINT chk_email_not_null
  CHECK (email IS NOT NULL) NOT VALID;`}</code>
            </pre>

            <h3 className="text-xl font-semibold mt-8 mb-3 text-slate-200">2. Running SET NOT NULL on PG 11 after CHECK validation</h3>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-6">
              <code className="text-sm text-slate-300 font-mono">{`-- BAD (on PG 11): SET NOT NULL still scans the table
-- even though the CHECK constraint is validated
ALTER TABLE users ALTER COLUMN email SET NOT NULL;
-- This does a full scan under ACCESS EXCLUSIVE!

-- On PG 11: Just keep the CHECK constraint
-- On PG 12+: SET NOT NULL is instant (skips scan)`}</code>
            </pre>

            <h3 className="text-xl font-semibold mt-8 mb-3 text-slate-200">3. Not setting lock_timeout</h3>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-6">
              <code className="text-sm text-slate-300 font-mono">{`-- BAD: Both steps should have lock_timeout
-- Even though the locks are brief, they can queue

-- GOOD: Set lock_timeout for both operations
SET lock_timeout = '5s';
ALTER TABLE users ADD CONSTRAINT chk_email_not_null
  CHECK (email IS NOT NULL) NOT VALID;
RESET lock_timeout;

-- VALIDATE doesn't need lock_timeout (it uses a safe lock)
ALTER TABLE users VALIDATE CONSTRAINT chk_email_not_null;`}</code>
            </pre>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">The Complete Pattern</h2>

            <p className="text-slate-300 leading-relaxed mb-4">
              Here is the full, production-safe pattern for adding NOT NULL to an existing column:
            </p>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-6">
              <code className="text-sm text-slate-300 font-mono">{`-- Migration file: 005_add_email_not_null.sql

-- 1. Backfill any existing NULLs (if they exist)
-- Run this in a separate migration or script before this one
-- UPDATE users SET email = 'unknown@example.com' WHERE email IS NULL;

-- 2. Add NOT VALID CHECK constraint (instant, brief ACCESS EXCLUSIVE)
SET lock_timeout = '5s';
ALTER TABLE users ADD CONSTRAINT chk_email_not_null
  CHECK (email IS NOT NULL) NOT VALID;
RESET lock_timeout;

-- 3. Validate (full scan, but SHARE UPDATE EXCLUSIVE — safe)
ALTER TABLE users VALIDATE CONSTRAINT chk_email_not_null;

-- 4. Convert to formal NOT NULL (PG 12+ only — instant)
SET lock_timeout = '5s';
ALTER TABLE users ALTER COLUMN email SET NOT NULL;
RESET lock_timeout;

-- 5. Drop redundant CHECK (PG 12+ only)
SET lock_timeout = '5s';
ALTER TABLE users DROP CONSTRAINT chk_email_not_null;
RESET lock_timeout;`}</code>
            </pre>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">Automate This Check</h2>

            <p className="text-slate-300 leading-relaxed mb-6">
              Catching a direct SET NOT NULL before it reaches production is exactly the kind of thing
              that should be automated.{' '}
              <a href="https://github.com/mickelsamuel/migrationpilot" className="text-blue-400 hover:text-blue-300">MigrationPilot</a>{' '}
              flags SET NOT NULL without the CHECK pattern (rule MP002) and direct ADD CONSTRAINT without
              NOT VALID (rule MP030). It is version-aware, so on PG 12+ it knows that SET NOT NULL after
              a validated CHECK is safe. Add it to your CI pipeline to catch these patterns automatically.
            </p>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-8">
              <code className="text-sm text-slate-300 font-mono">{`npx migrationpilot analyze migrations/005_add_email_not_null.sql`}</code>
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
