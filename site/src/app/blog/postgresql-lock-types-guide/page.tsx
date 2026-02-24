import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'The Complete Guide to PostgreSQL Lock Types for Schema Changes — MigrationPilot',
  description: 'Understand every PostgreSQL lock level from ACCESS SHARE to ACCESS EXCLUSIVE, which DDL statements acquire which locks, and how they impact your running application.',
  keywords: ['postgresql lock types', 'postgresql locks', 'access exclusive lock', 'share lock postgresql', 'ddl locks', 'postgresql schema changes'],
  alternates: {
    canonical: '/blog/postgresql-lock-types-guide',
  },
  openGraph: {
    title: 'The Complete Guide to PostgreSQL Lock Types for Schema Changes',
    description: 'Understand every PostgreSQL lock level from ACCESS SHARE to ACCESS EXCLUSIVE, which DDL statements acquire which locks, and how they impact your running application.',
    type: 'article',
    url: '/blog/postgresql-lock-types-guide',
  },
};

export default function PostgreSQLLockTypesGuide() {
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
            <span>12 min read</span>
          </div>

          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
            The Complete Guide to PostgreSQL Lock Types for Schema Changes
          </h1>

          <p className="text-xl text-slate-400 mb-12 leading-relaxed">
            If you run DDL against a production PostgreSQL database without understanding locks, you will cause an outage.
            That is not a maybe. This guide covers every lock level, which statements acquire which locks, and what that
            means for your running application.
          </p>

          <div className="prose prose-invert max-w-none">
            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">PostgreSQL Lock Levels: The Full Hierarchy</h2>

            <p className="text-slate-300 leading-relaxed mb-6">
              PostgreSQL has eight table-level lock modes, ordered from least restrictive to most restrictive.
              Two locks conflict when one would violate the guarantees of the other. Understanding this hierarchy
              is the foundation of safe schema changes.
            </p>

            <div className="overflow-x-auto mb-8">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left py-3 px-4 text-slate-300 font-semibold">Lock Level</th>
                    <th className="text-left py-3 px-4 text-slate-300 font-semibold">Blocks Reads?</th>
                    <th className="text-left py-3 px-4 text-slate-300 font-semibold">Blocks Writes?</th>
                    <th className="text-left py-3 px-4 text-slate-300 font-semibold">Acquired By</th>
                  </tr>
                </thead>
                <tbody className="text-slate-400">
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4 font-mono text-green-400">ACCESS SHARE</td>
                    <td className="py-3 px-4">No</td>
                    <td className="py-3 px-4">No</td>
                    <td className="py-3 px-4">SELECT</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4 font-mono text-green-400">ROW SHARE</td>
                    <td className="py-3 px-4">No</td>
                    <td className="py-3 px-4">No</td>
                    <td className="py-3 px-4">SELECT FOR UPDATE/SHARE</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4 font-mono text-green-400">ROW EXCLUSIVE</td>
                    <td className="py-3 px-4">No</td>
                    <td className="py-3 px-4">No</td>
                    <td className="py-3 px-4">INSERT, UPDATE, DELETE</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4 font-mono text-yellow-400">SHARE UPDATE EXCLUSIVE</td>
                    <td className="py-3 px-4">No</td>
                    <td className="py-3 px-4">No</td>
                    <td className="py-3 px-4">VACUUM, CREATE INDEX CONCURRENTLY, ALTER TABLE (some)</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4 font-mono text-yellow-400">SHARE</td>
                    <td className="py-3 px-4">No</td>
                    <td className="py-3 px-4 text-red-400 font-medium">Yes</td>
                    <td className="py-3 px-4">CREATE INDEX (without CONCURRENTLY)</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4 font-mono text-orange-400">SHARE ROW EXCLUSIVE</td>
                    <td className="py-3 px-4">No</td>
                    <td className="py-3 px-4 text-red-400 font-medium">Yes</td>
                    <td className="py-3 px-4">CREATE TRIGGER, some ALTER TABLE</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4 font-mono text-orange-400">EXCLUSIVE</td>
                    <td className="py-3 px-4">No</td>
                    <td className="py-3 px-4 text-red-400 font-medium">Yes</td>
                    <td className="py-3 px-4">REFRESH MATERIALIZED VIEW CONCURRENTLY</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4 font-mono text-red-400">ACCESS EXCLUSIVE</td>
                    <td className="py-3 px-4 text-red-400 font-medium">Yes</td>
                    <td className="py-3 px-4 text-red-400 font-medium">Yes</td>
                    <td className="py-3 px-4">DROP, TRUNCATE, most ALTER TABLE, VACUUM FULL, CLUSTER</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p className="text-slate-300 leading-relaxed mb-6">
              The key insight: ACCESS EXCLUSIVE is the only lock that blocks reads. Everything else allows
              SELECT queries to continue. But anything from SHARE upward blocks writes (INSERT, UPDATE, DELETE),
              which is still devastating for a production application.
            </p>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">ACCESS SHARE: The Harmless Lock</h2>

            <p className="text-slate-300 leading-relaxed mb-4">
              Every <code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">SELECT</code> statement acquires an ACCESS SHARE lock. It only conflicts
              with ACCESS EXCLUSIVE. This is why you can run queries while most DDL is happening, but
              a <code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">DROP TABLE</code> will block all your reads.
            </p>

            <p className="text-slate-300 leading-relaxed mb-6">
              ACCESS SHARE is automatically released at the end of the statement (or transaction if
              inside a transaction block). You never need to worry about this lock in practice.
            </p>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">SHARE UPDATE EXCLUSIVE: The Safe DDL Lock</h2>

            <p className="text-slate-300 leading-relaxed mb-4">
              This lock is the sweet spot for online operations. It self-conflicts (you cannot run two
              concurrent operations that both need it) but does not block reads or writes. Operations
              that acquire this lock include:
            </p>

            <ul className="list-disc list-inside text-slate-300 space-y-2 mb-6 ml-4">
              <li><code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">VACUUM</code> (without FULL)</li>
              <li><code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">CREATE INDEX CONCURRENTLY</code></li>
              <li><code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">ALTER TABLE VALIDATE CONSTRAINT</code></li>
              <li><code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">ALTER TABLE SET STATISTICS</code></li>
              <li><code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">REINDEX CONCURRENTLY</code> (PG 12+)</li>
            </ul>

            <p className="text-slate-300 leading-relaxed mb-6">
              This is why <code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">CREATE INDEX CONCURRENTLY</code> is the gold standard for adding indexes
              to production tables. It takes longer, but your application keeps running without any interruption.
            </p>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">SHARE: The Write-Blocking Lock</h2>

            <p className="text-slate-300 leading-relaxed mb-4">
              A regular <code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">CREATE INDEX</code> (without CONCURRENTLY) acquires a SHARE lock.
              This blocks all INSERT, UPDATE, and DELETE operations on the table for the entire duration
              of the index build.
            </p>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-6">
              <code className="text-sm text-slate-300 font-mono">{`-- This blocks all writes for the entire index build duration
-- On a 100M row table, this could be 10+ minutes
CREATE INDEX idx_users_email ON users (email);

-- This is the safe alternative — only blocks other DDL
CREATE INDEX CONCURRENTLY idx_users_email ON users (email);`}</code>
            </pre>

            <p className="text-slate-300 leading-relaxed mb-6">
              On a small table (under 100K rows), the difference is negligible. On a 50M row table, a regular
              CREATE INDEX might take several minutes, and every write to that table queues up behind it.
              Connection pools fill up, application requests time out, and your users see errors.
            </p>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">ACCESS EXCLUSIVE: The Total Lockout</h2>

            <p className="text-slate-300 leading-relaxed mb-4">
              ACCESS EXCLUSIVE is the most dangerous lock in PostgreSQL. It blocks everything: reads, writes,
              and all other lock types. Nothing can touch the table until the lock is released.
            </p>

            <p className="text-slate-300 leading-relaxed mb-4">
              These operations acquire ACCESS EXCLUSIVE:
            </p>

            <ul className="list-disc list-inside text-slate-300 space-y-2 mb-6 ml-4">
              <li><code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">DROP TABLE</code></li>
              <li><code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">TRUNCATE</code></li>
              <li><code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">ALTER TABLE ADD COLUMN ... DEFAULT (volatile)</code></li>
              <li><code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">ALTER TABLE ALTER COLUMN TYPE</code></li>
              <li><code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">ALTER TABLE SET NOT NULL</code> (without CHECK pattern)</li>
              <li><code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">ALTER TABLE ADD CONSTRAINT ... UNIQUE</code> (without USING INDEX)</li>
              <li><code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">VACUUM FULL</code></li>
              <li><code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">CLUSTER</code></li>
              <li><code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">LOCK TABLE</code></li>
            </ul>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">The Lock Queue Problem</h2>

            <p className="text-slate-300 leading-relaxed mb-4">
              Here is the part that surprises most engineers: PostgreSQL lock acquisition is a FIFO queue. If your
              DDL statement is waiting for an ACCESS EXCLUSIVE lock, every subsequent query that needs a conflicting
              lock queues up behind it.
            </p>

            <p className="text-slate-300 leading-relaxed mb-4">
              Consider this scenario:
            </p>

            <ol className="list-decimal list-inside text-slate-300 space-y-2 mb-6 ml-4">
              <li>A long-running analytics query holds ACCESS SHARE on the <code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">users</code> table</li>
              <li>Your migration runs <code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">ALTER TABLE users SET NOT NULL ...</code> which needs ACCESS EXCLUSIVE</li>
              <li>The ALTER waits behind the analytics query</li>
              <li>Every new SELECT on <code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">users</code> queues behind the ALTER</li>
              <li>Your connection pool fills up within seconds</li>
              <li>Application outage</li>
            </ol>

            <p className="text-slate-300 leading-relaxed mb-6">
              This is why <code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">SET lock_timeout</code> is essential. If you set a lock timeout of 5 seconds,
              the ALTER will fail fast instead of queuing indefinitely:
            </p>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-6">
              <code className="text-sm text-slate-300 font-mono">{`-- Always set a lock_timeout before DDL in production
SET lock_timeout = '5s';
ALTER TABLE users ALTER COLUMN email SET NOT NULL;

-- If the lock cannot be acquired within 5 seconds,
-- PostgreSQL raises: ERROR: canceling statement due to lock timeout`}</code>
            </pre>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">Lock Conflicts: Which Locks Block Which</h2>

            <p className="text-slate-300 leading-relaxed mb-4">
              The lock conflict matrix is not obvious. Two locks conflict only when one would violate the
              guarantees the other provides. Here are the most important conflicts to remember:
            </p>

            <ul className="list-disc list-inside text-slate-300 space-y-2 mb-6 ml-4">
              <li><strong className="text-slate-200">ACCESS EXCLUSIVE</strong> conflicts with everything, including ACCESS SHARE (SELECT)</li>
              <li><strong className="text-slate-200">SHARE</strong> conflicts with ROW EXCLUSIVE (INSERT/UPDATE/DELETE), so CREATE INDEX blocks writes</li>
              <li><strong className="text-slate-200">SHARE UPDATE EXCLUSIVE</strong> only conflicts with itself, SHARE, and the EXCLUSIVEs</li>
              <li><strong className="text-slate-200">ROW EXCLUSIVE</strong> does not conflict with itself (concurrent writes are fine) but conflicts with SHARE and above</li>
            </ul>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">Common DDL Statements and Their Lock Types</h2>

            <p className="text-slate-300 leading-relaxed mb-4">
              Here is a practical reference for the DDL you are most likely to run in migrations:
            </p>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-6">
              <code className="text-sm text-slate-300 font-mono">{`-- ACCESS EXCLUSIVE (blocks everything)
ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active';  -- PG < 11
ALTER TABLE users ALTER COLUMN age TYPE bigint;
ALTER TABLE users ADD CONSTRAINT uniq UNIQUE (email);
DROP TABLE old_users;
TRUNCATE users;
VACUUM FULL users;
CLUSTER users USING idx_id;

-- SHARE (blocks writes, allows reads)
CREATE INDEX idx_email ON users (email);

-- SHARE UPDATE EXCLUSIVE (blocks nothing important)
CREATE INDEX CONCURRENTLY idx_email ON users (email);
ALTER TABLE users VALIDATE CONSTRAINT chk_email;
VACUUM users;

-- SHARE ROW EXCLUSIVE (blocks writes)
ALTER TABLE users ADD CONSTRAINT fk_org
  FOREIGN KEY (org_id) REFERENCES orgs(id) NOT VALID;

-- ROW EXCLUSIVE (normal DML — no DDL concern)
INSERT INTO users ...
UPDATE users SET ...
DELETE FROM users ...`}</code>
            </pre>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">Practical Guidelines</h2>

            <h3 className="text-xl font-semibold mt-8 mb-3 text-slate-200">1. Always set lock_timeout</h3>

            <p className="text-slate-300 leading-relaxed mb-6">
              Before any DDL in production, set a lock_timeout. Five seconds is a good default. If the lock
              cannot be acquired in that time, it is better to fail and retry than to queue up all traffic.
            </p>

            <h3 className="text-xl font-semibold mt-8 mb-3 text-slate-200">2. Use CONCURRENTLY whenever possible</h3>

            <p className="text-slate-300 leading-relaxed mb-6">
              CREATE INDEX, DROP INDEX, REINDEX, and REFRESH MATERIALIZED VIEW all have CONCURRENTLY variants.
              They take longer but do not block reads or writes. Use them in production without exception.
            </p>

            <h3 className="text-xl font-semibold mt-8 mb-3 text-slate-200">3. Avoid ACCESS EXCLUSIVE unless necessary</h3>

            <p className="text-slate-300 leading-relaxed mb-6">
              Most ACCESS EXCLUSIVE operations have safer alternatives. Adding NOT NULL can use the CHECK pattern.
              Adding a UNIQUE constraint can use CREATE UNIQUE INDEX CONCURRENTLY + ADD CONSTRAINT USING INDEX.
              Column type changes can use expand-contract with a new column.
            </p>

            <h3 className="text-xl font-semibold mt-8 mb-3 text-slate-200">4. Keep transactions short</h3>

            <p className="text-slate-300 leading-relaxed mb-6">
              Locks are held until the end of the transaction. If you wrap multiple DDL statements in a single
              transaction, you hold the most restrictive lock for the entire duration. Split large migrations
              into separate transactions when possible.
            </p>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">How to Check Current Locks</h2>

            <p className="text-slate-300 leading-relaxed mb-4">
              You can inspect active locks with this query:
            </p>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-6">
              <code className="text-sm text-slate-300 font-mono">{`SELECT
  l.locktype,
  l.relation::regclass AS table_name,
  l.mode,
  l.granted,
  l.pid,
  a.query,
  a.state,
  age(now(), a.query_start) AS duration
FROM pg_locks l
JOIN pg_stat_activity a ON l.pid = a.pid
WHERE l.relation IS NOT NULL
  AND a.pid <> pg_backend_pid()
ORDER BY a.query_start;`}</code>
            </pre>

            <p className="text-slate-300 leading-relaxed mb-4">
              And to see blocked queries:
            </p>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-6">
              <code className="text-sm text-slate-300 font-mono">{`SELECT
  blocked.pid AS blocked_pid,
  blocked.query AS blocked_query,
  blocking.pid AS blocking_pid,
  blocking.query AS blocking_query,
  age(now(), blocked.query_start) AS waiting_duration
FROM pg_stat_activity blocked
JOIN pg_locks bl ON blocked.pid = bl.pid AND NOT bl.granted
JOIN pg_locks l ON bl.relation = l.relation
  AND bl.locktype = l.locktype AND l.granted
JOIN pg_stat_activity blocking ON l.pid = blocking.pid
WHERE blocked.pid <> blocking.pid;`}</code>
            </pre>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">Automate Lock Analysis</h2>

            <p className="text-slate-300 leading-relaxed mb-6">
              Memorizing lock types is error-prone. Tools can catch lock issues before they reach production.{' '}
              <a href="https://github.com/mickelsamuel/migrationpilot" className="text-blue-400 hover:text-blue-300">MigrationPilot</a>{' '}
              analyzes your migration SQL and reports the exact lock type each statement will acquire, flags
              dangerous patterns like missing CONCURRENTLY or lock_timeout, and suggests safe alternatives.
              It runs as a CLI, GitHub Action, or Node.js library with 80 safety rules.
            </p>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-8">
              <code className="text-sm text-slate-300 font-mono">{`npx migrationpilot analyze migrations/002_add_index.sql`}</code>
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
