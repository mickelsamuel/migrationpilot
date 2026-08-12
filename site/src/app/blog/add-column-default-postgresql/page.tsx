import type { Metadata } from 'next';
import Navbar from '@/components/navbar';
import { Footer } from '@/components/footer';
import { CodeBlock, CommandBlock } from '@/components/code-block';

export const metadata: Metadata = {
  title: 'How to Safely Add a Column with a Default Value in PostgreSQL — MigrationPilot',
  description: 'Learn when adding a column with a DEFAULT value rewrites the entire table, what changed in PostgreSQL 11, and the safe patterns for every scenario.',
  keywords: ['add column default postgresql', 'alter table add column default', 'postgresql add column', 'postgresql table rewrite', 'postgresql 11 default'],
  alternates: {
    canonical: '/blog/add-column-default-postgresql',
  },
  openGraph: {
    title: 'How to Safely Add a Column with a Default Value in PostgreSQL',
    description: 'Learn when adding a column with a DEFAULT value rewrites the entire table, what changed in PostgreSQL 11, and the safe patterns for every scenario.',
    type: 'article',
    url: '/blog/add-column-default-postgresql',
  },
};

export default function AddColumnDefaultPostgreSQL() {
  return (
    <>
      <Navbar active="blog" />
      <main className="pt-14">
        <article className="mp-container pt-16 md:pt-20 pb-20">
          <div className="max-w-3xl">
            <div className="mb-8">
              <a href="/blog" className="text-sm text-accent hover:text-accent-hover transition-colors">&larr; Back to Blog</a>
            </div>

            <div className="flex items-center gap-3 text-sm text-faint mb-4">
              <time dateTime="2026-02-24">February 24, 2026</time>
              <span className="w-1 h-1 rounded-full bg-line" />
              <span>4 min read</span>
            </div>

            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
              How to Safely Add a Column with a Default Value in PostgreSQL
            </h1>

            <p className="text-xl text-muted mb-12 leading-relaxed">
              Adding a column with a DEFAULT value is one of the most common migration operations. It is also
              one of the most misunderstood. Whether it takes milliseconds or causes a full table rewrite depends
              on your PostgreSQL version and what your DEFAULT expression looks like.
            </p>

            <div className="prose prose-invert max-w-none">
              <h2 className="text-2xl font-bold mt-12 mb-4 text-fg">The Problem: Table Rewrites</h2>

              <p className="text-muted leading-relaxed mb-4">
                Before PostgreSQL 11, adding a column with a DEFAULT value always rewrote the entire table.
                PostgreSQL had to physically write the default value into every existing row. During this rewrite,
                the table was locked with an ACCESS EXCLUSIVE lock, blocking all reads and writes.
              </p>

              <CodeBlock code={`-- PostgreSQL 10 and earlier: FULL TABLE REWRITE
-- On a 100M row table, this could take 10+ minutes
-- The table is completely locked during the entire operation
ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active';`} language="sql" />

              <p className="text-muted leading-relaxed mb-6">
                On a table with 100 million rows, this could take 10 minutes or more. During that time,
                every query against the table — reads included — queues up. Connection pools exhaust.
                Application timeouts cascade. Users see errors. This was one of the most common causes
                of database outages in production PostgreSQL deployments.
              </p>

              <h2 className="text-2xl font-bold mt-12 mb-4 text-fg">PostgreSQL 11: The Fast-Path Default</h2>

              <p className="text-muted leading-relaxed mb-4">
                PostgreSQL 11 (released October 2018) introduced a significant optimization. When you add a
                column with a non-volatile DEFAULT, PostgreSQL stores the default value in the catalog
                (<code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">pg_attribute.attmissingval</code>) instead of writing it to every row.
                The operation completes in milliseconds regardless of table size.
              </p>

              <CodeBlock code={`-- PostgreSQL 11+: INSTANT operation (no table rewrite)
-- Works because 'active' is a constant (non-volatile)
ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active';

-- Also instant — integer constant
ALTER TABLE orders ADD COLUMN version INT DEFAULT 1;

-- Also instant — boolean constant
ALTER TABLE features ADD COLUMN enabled BOOLEAN DEFAULT false;

-- Also instant — NULL default (always was instant)
ALTER TABLE users ADD COLUMN middle_name TEXT;`} language="sql" />

              <p className="text-muted leading-relaxed mb-6">
                When a query reads a row that was created before the column was added, PostgreSQL automatically
                returns the stored default value. Rows created after the ALTER TABLE include the column value
                physically. Over time, as rows are updated, the default value gets written to disk naturally
                through MVCC.
              </p>

              <h2 className="text-2xl font-bold mt-12 mb-4 text-fg">Volatile vs Non-Volatile Defaults</h2>

              <p className="text-muted leading-relaxed mb-4">
                The optimization only works for <strong className="text-fg">non-volatile</strong> defaults.
                A non-volatile expression always returns the same value. A volatile expression might return
                a different value each time it is evaluated.
              </p>

              <div className="overflow-x-auto mb-8">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-line">
                      <th className="text-left py-3 px-4 text-muted font-semibold">Expression</th>
                      <th className="text-left py-3 px-4 text-muted font-semibold">Volatility</th>
                      <th className="text-left py-3 px-4 text-muted font-semibold">Table Rewrite?</th>
                    </tr>
                  </thead>
                  <tbody className="text-muted">
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4 font-mono text-sm">{`'active'`}</td>
                      <td className="py-3 px-4 text-ok">Immutable</td>
                      <td className="py-3 px-4 text-ok">No (instant)</td>
                    </tr>
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4 font-mono text-sm">42</td>
                      <td className="py-3 px-4 text-ok">Immutable</td>
                      <td className="py-3 px-4 text-ok">No (instant)</td>
                    </tr>
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4 font-mono text-sm">true / false</td>
                      <td className="py-3 px-4 text-ok">Immutable</td>
                      <td className="py-3 px-4 text-ok">No (instant)</td>
                    </tr>
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4 font-mono text-sm">{`'{}'::jsonb`}</td>
                      <td className="py-3 px-4 text-ok">Immutable</td>
                      <td className="py-3 px-4 text-ok">No (instant)</td>
                    </tr>
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4 font-mono text-sm">now()</td>
                      <td className="py-3 px-4 text-danger">Volatile</td>
                      <td className="py-3 px-4 text-danger">Yes (full rewrite)</td>
                    </tr>
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4 font-mono text-sm">gen_random_uuid()</td>
                      <td className="py-3 px-4 text-danger">Volatile</td>
                      <td className="py-3 px-4 text-danger">Yes (full rewrite)</td>
                    </tr>
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4 font-mono text-sm">random()</td>
                      <td className="py-3 px-4 text-danger">Volatile</td>
                      <td className="py-3 px-4 text-danger">Yes (full rewrite)</td>
                    </tr>
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4 font-mono text-sm">clock_timestamp()</td>
                      <td className="py-3 px-4 text-danger">Volatile</td>
                      <td className="py-3 px-4 text-danger">Yes (full rewrite)</td>
                    </tr>
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4 font-mono text-sm">nextval()</td>
                      <td className="py-3 px-4 text-danger">Volatile</td>
                      <td className="py-3 px-4 text-danger">Yes (full rewrite)</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <p className="text-muted leading-relaxed mb-6">
                The distinction matters because a volatile function must produce a unique value per row. PostgreSQL
                cannot store a single value in the catalog and use it for all existing rows — it needs to evaluate
                the function for each one, which requires a table rewrite.
              </p>

              <h2 className="text-2xl font-bold mt-12 mb-4 text-fg">The Safe Pattern for Volatile Defaults</h2>

              <p className="text-muted leading-relaxed mb-4">
                When you need a volatile default (like <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">gen_random_uuid()</code> or{' '}
                <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">now()</code>), split the operation into three steps:
              </p>

              <CodeBlock code={`-- Step 1: Add the column without a default (instant, no rewrite)
ALTER TABLE users ADD COLUMN created_at TIMESTAMPTZ;

-- Step 2: Set the default for new rows (instant, metadata-only)
ALTER TABLE users ALTER COLUMN created_at SET DEFAULT now();

-- Step 3: Backfill existing rows in batches (no lock)
UPDATE users SET created_at = now()
WHERE id BETWEEN 1 AND 10000 AND created_at IS NULL;

UPDATE users SET created_at = now()
WHERE id BETWEEN 10001 AND 20000 AND created_at IS NULL;
-- ... continue in batches`} language="sql" />

              <p className="text-muted leading-relaxed mb-6">
                This approach never locks the table for more than milliseconds. The backfill runs as normal DML,
                which only acquires ROW EXCLUSIVE locks. You can batch the updates to avoid holding locks for
                too long and to give autovacuum time to clean up dead tuples between batches.
              </p>

              <h2 className="text-2xl font-bold mt-12 mb-4 text-fg">Common Pitfall: UUID Primary Keys</h2>

              <p className="text-muted leading-relaxed mb-4">
                One of the most common mistakes is adding a UUID column with{' '}
                <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">gen_random_uuid()</code> as the default:
              </p>

              <CodeBlock code={`-- DANGEROUS: gen_random_uuid() is volatile
-- This rewrites the entire table on PG 11+
ALTER TABLE orders ADD COLUMN external_id UUID DEFAULT gen_random_uuid();

-- SAFE: Split into separate operations
ALTER TABLE orders ADD COLUMN external_id UUID;
ALTER TABLE orders ALTER COLUMN external_id SET DEFAULT gen_random_uuid();
-- Then backfill existing rows in batches`} language="sql" />

              <h2 className="text-2xl font-bold mt-12 mb-4 text-fg">Common Pitfall: Timestamps</h2>

              <p className="text-muted leading-relaxed mb-4">
                Another frequent mistake is adding a <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">created_at</code> or{' '}
                <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">updated_at</code> column with <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">now()</code>:
              </p>

              <CodeBlock code={`-- DANGEROUS: now() is stable within a transaction
-- but PostgreSQL classifies it as volatile for this purpose
ALTER TABLE events ADD COLUMN created_at TIMESTAMPTZ DEFAULT now();

-- SAFE: Use the three-step pattern
ALTER TABLE events ADD COLUMN created_at TIMESTAMPTZ;
ALTER TABLE events ALTER COLUMN created_at SET DEFAULT now();
-- Backfill in batches...`} language="sql" />

              <p className="text-muted leading-relaxed mb-6">
                A subtle detail: <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">now()</code> is technically STABLE (returns the same value within
                a transaction), but PostgreSQL still treats it as volatile for the purposes of the fast-path
                default optimization. The reason is that a STABLE function could still return different values
                across transactions, so PostgreSQL cannot store a single value in the catalog.
              </p>

              <h2 className="text-2xl font-bold mt-12 mb-4 text-fg">Backfill Strategies</h2>

              <p className="text-muted leading-relaxed mb-4">
                When backfilling existing rows, there are several approaches:
              </p>

              <h3 className="text-xl font-semibold mt-8 mb-3 text-fg">Batched updates by primary key range</h3>

              <CodeBlock code={`-- Process 10,000 rows at a time
DO $$
DECLARE
  batch_size INT := 10000;
  min_id BIGINT;
  max_id BIGINT;
  current_id BIGINT;
BEGIN
  SELECT min(id), max(id) INTO min_id, max_id FROM users;
  current_id := min_id;

  WHILE current_id <= max_id LOOP
    UPDATE users
    SET status = 'active'
    WHERE id >= current_id
      AND id < current_id + batch_size
      AND status IS NULL;

    current_id := current_id + batch_size;
    COMMIT;  -- Release locks between batches (PG 11+ procedures)
  END LOOP;
END $$;`} language="sql" />

              <h3 className="text-xl font-semibold mt-8 mb-3 text-fg">Using a temporary helper function</h3>

              <CodeBlock code={`-- For large backfills, a loop in a script is often simpler
-- Run this from your application or a migration runner:

-- Bash / psql loop:
for offset in $(seq 0 10000 1000000); do
  psql -c "UPDATE users SET status = 'active'
           WHERE id IN (SELECT id FROM users
                        WHERE status IS NULL
                        ORDER BY id LIMIT 10000)"
done`} />

              <h2 className="text-2xl font-bold mt-12 mb-4 text-fg">How to Check if a Default Triggers a Rewrite</h2>

              <p className="text-muted leading-relaxed mb-4">
                You can check the volatility of a function using:
              </p>

              <CodeBlock code={`SELECT proname, provolatile
FROM pg_proc
WHERE proname = 'now';

-- provolatile values:
-- 'i' = immutable (safe)
-- 's' = stable (triggers rewrite in ADD COLUMN DEFAULT)
-- 'v' = volatile (triggers rewrite)`} language="sql" />

              <p className="text-muted leading-relaxed mb-6">
                If <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">provolatile</code> is anything other than <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">{`'i'`}</code> (immutable),
                the default will trigger a table rewrite when used in ADD COLUMN. Use the three-step pattern instead.
              </p>

              <h2 className="text-2xl font-bold mt-12 mb-4 text-fg">Version-Specific Summary</h2>

              <div className="overflow-x-auto mb-8">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-line">
                      <th className="text-left py-3 px-4 text-muted font-semibold">PG Version</th>
                      <th className="text-left py-3 px-4 text-muted font-semibold">Constant Default</th>
                      <th className="text-left py-3 px-4 text-muted font-semibold">Volatile Default</th>
                    </tr>
                  </thead>
                  <tbody className="text-muted">
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4 font-semibold text-faint">PG 10 and earlier</td>
                      <td className="py-3 px-4 text-danger">Full table rewrite</td>
                      <td className="py-3 px-4 text-danger">Full table rewrite</td>
                    </tr>
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4 font-semibold text-faint">PG 11+</td>
                      <td className="py-3 px-4 text-ok">Instant (catalog-only)</td>
                      <td className="py-3 px-4 text-danger">Full table rewrite</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <h2 className="text-2xl font-bold mt-12 mb-4 text-fg">Catch This Automatically</h2>

              <p className="text-muted leading-relaxed mb-6">
                Remembering which defaults are volatile and which are safe is easy to get wrong under pressure.{' '}
                <a href="https://github.com/mickelsamuel/migrationpilot" className="text-accent hover:text-accent-hover">MigrationPilot</a>{' '}
                detects volatile defaults in ADD COLUMN statements (rule MP003) and suggests the safe three-step
                pattern automatically. It also auto-detects your PostgreSQL version and adjusts its advice accordingly.
                Run it in your CI pipeline to catch these issues before they reach production.
              </p>

              <CommandBlock command={`npx migrationpilot analyze migrations/003_add_timestamps.sql`} />
            </div>
          </div>
        </article>
      </main>
      <Footer />
    </>
  );
}
