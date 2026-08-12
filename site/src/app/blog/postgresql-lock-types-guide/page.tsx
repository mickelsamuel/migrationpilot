import type { Metadata } from 'next';
import Navbar from '@/components/navbar';
import { Footer } from '@/components/footer';
import { CodeBlock, CommandBlock } from '@/components/code-block';

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
              <span>5 min read</span>
            </div>

            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
              The Complete Guide to PostgreSQL Lock Types for Schema Changes
            </h1>

            <p className="text-xl text-muted mb-12 leading-relaxed">
              If you run DDL against a production PostgreSQL database without understanding locks, you will cause an outage.
              That is not a maybe. This guide covers every lock level, which statements acquire which locks, and what that
              means for your running application.
            </p>

            <img
              src="/charts/lock-types-mindmap.png"
              alt="PostgreSQL lock types mind map: ACCESS SHARE through ACCESS EXCLUSIVE with associated SQL operations"
              className="rounded-lg border border-line mb-12 w-full"
              width={900}
              height={500}
            />

            <div className="prose prose-invert max-w-none">
              <h2 className="text-2xl font-bold mt-12 mb-4 text-fg">PostgreSQL Lock Levels: The Full Hierarchy</h2>

              <p className="text-muted leading-relaxed mb-6">
                PostgreSQL has eight table-level lock modes, ordered from least restrictive to most restrictive.
                Two locks conflict when one would violate the guarantees of the other. Understanding this hierarchy
                is the foundation of safe schema changes.
              </p>

              <div className="overflow-x-auto mb-8">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-line">
                      <th className="text-left py-3 px-4 text-muted font-semibold">Lock Level</th>
                      <th className="text-left py-3 px-4 text-muted font-semibold">Blocks Reads?</th>
                      <th className="text-left py-3 px-4 text-muted font-semibold">Blocks Writes?</th>
                      <th className="text-left py-3 px-4 text-muted font-semibold">Acquired By</th>
                    </tr>
                  </thead>
                  <tbody className="text-muted">
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4 font-mono text-ok">ACCESS SHARE</td>
                      <td className="py-3 px-4">No</td>
                      <td className="py-3 px-4">No</td>
                      <td className="py-3 px-4">SELECT</td>
                    </tr>
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4 font-mono text-ok">ROW SHARE</td>
                      <td className="py-3 px-4">No</td>
                      <td className="py-3 px-4">No</td>
                      <td className="py-3 px-4">SELECT FOR UPDATE/SHARE</td>
                    </tr>
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4 font-mono text-ok">ROW EXCLUSIVE</td>
                      <td className="py-3 px-4">No</td>
                      <td className="py-3 px-4">No</td>
                      <td className="py-3 px-4">INSERT, UPDATE, DELETE</td>
                    </tr>
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4 font-mono text-warn">SHARE UPDATE EXCLUSIVE</td>
                      <td className="py-3 px-4">No</td>
                      <td className="py-3 px-4">No</td>
                      <td className="py-3 px-4">VACUUM, CREATE INDEX CONCURRENTLY, ALTER TABLE (some)</td>
                    </tr>
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4 font-mono text-warn">SHARE</td>
                      <td className="py-3 px-4">No</td>
                      <td className="py-3 px-4 text-danger font-medium">Yes</td>
                      <td className="py-3 px-4">CREATE INDEX (without CONCURRENTLY)</td>
                    </tr>
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4 font-mono text-warn">SHARE ROW EXCLUSIVE</td>
                      <td className="py-3 px-4">No</td>
                      <td className="py-3 px-4 text-danger font-medium">Yes</td>
                      <td className="py-3 px-4">CREATE TRIGGER, some ALTER TABLE</td>
                    </tr>
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4 font-mono text-warn">EXCLUSIVE</td>
                      <td className="py-3 px-4">No</td>
                      <td className="py-3 px-4 text-danger font-medium">Yes</td>
                      <td className="py-3 px-4">REFRESH MATERIALIZED VIEW CONCURRENTLY</td>
                    </tr>
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4 font-mono text-danger">ACCESS EXCLUSIVE</td>
                      <td className="py-3 px-4 text-danger font-medium">Yes</td>
                      <td className="py-3 px-4 text-danger font-medium">Yes</td>
                      <td className="py-3 px-4">DROP, TRUNCATE, most ALTER TABLE, VACUUM FULL, CLUSTER</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <p className="text-muted leading-relaxed mb-6">
                The key insight: ACCESS EXCLUSIVE is the only lock that blocks reads. Everything else allows
                SELECT queries to continue. But anything from SHARE upward blocks writes (INSERT, UPDATE, DELETE),
                which is still devastating for a production application.
              </p>

              <h2 className="text-2xl font-bold mt-12 mb-4 text-fg">ACCESS SHARE: The Harmless Lock</h2>

              <p className="text-muted leading-relaxed mb-4">
                Every <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">SELECT</code> statement acquires an ACCESS SHARE lock. It only conflicts
                with ACCESS EXCLUSIVE. This is why you can run queries while most DDL is happening, but
                a <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">DROP TABLE</code> will block all your reads.
              </p>

              <p className="text-muted leading-relaxed mb-6">
                ACCESS SHARE is automatically released at the end of the statement (or transaction if
                inside a transaction block). You never need to worry about this lock in practice.
              </p>

              <h2 className="text-2xl font-bold mt-12 mb-4 text-fg">SHARE UPDATE EXCLUSIVE: The Safe DDL Lock</h2>

              <p className="text-muted leading-relaxed mb-4">
                This lock is the sweet spot for online operations. It self-conflicts (you cannot run two
                concurrent operations that both need it) but does not block reads or writes. Operations
                that acquire this lock include:
              </p>

              <ul className="list-disc list-inside text-muted space-y-2 mb-6 ml-4">
                <li><code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">VACUUM</code> (without FULL)</li>
                <li><code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">CREATE INDEX CONCURRENTLY</code></li>
                <li><code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">ALTER TABLE VALIDATE CONSTRAINT</code></li>
                <li><code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">ALTER TABLE SET STATISTICS</code></li>
                <li><code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">REINDEX CONCURRENTLY</code> (PG 12+)</li>
              </ul>

              <p className="text-muted leading-relaxed mb-6">
                This is why <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">CREATE INDEX CONCURRENTLY</code> is the gold standard for adding indexes
                to production tables. It takes longer, but your application keeps running without any interruption.
              </p>

              <h2 className="text-2xl font-bold mt-12 mb-4 text-fg">SHARE: The Write-Blocking Lock</h2>

              <p className="text-muted leading-relaxed mb-4">
                A regular <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">CREATE INDEX</code> (without CONCURRENTLY) acquires a SHARE lock.
                This blocks all INSERT, UPDATE, and DELETE operations on the table for the entire duration
                of the index build.
              </p>

              <CodeBlock code={`-- This blocks all writes for the entire index build duration
-- On a 100M row table, this could be 10+ minutes
CREATE INDEX idx_users_email ON users (email);

-- This is the safe alternative — only blocks other DDL
CREATE INDEX CONCURRENTLY idx_users_email ON users (email);`} language="sql" />

              <p className="text-muted leading-relaxed mb-6">
                On a small table (under 100K rows), the difference is negligible. On a 50M row table, a regular
                CREATE INDEX might take several minutes, and every write to that table queues up behind it.
                Connection pools fill up, application requests time out, and your users see errors.
              </p>

              <h2 className="text-2xl font-bold mt-12 mb-4 text-fg">ACCESS EXCLUSIVE: The Total Lockout</h2>

              <p className="text-muted leading-relaxed mb-4">
                ACCESS EXCLUSIVE is the most dangerous lock in PostgreSQL. It blocks everything: reads, writes,
                and all other lock types. Nothing can touch the table until the lock is released.
              </p>

              <p className="text-muted leading-relaxed mb-4">
                These operations acquire ACCESS EXCLUSIVE:
              </p>

              <ul className="list-disc list-inside text-muted space-y-2 mb-6 ml-4">
                <li><code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">DROP TABLE</code></li>
                <li><code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">TRUNCATE</code></li>
                <li><code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">ALTER TABLE ADD COLUMN ... DEFAULT (volatile)</code></li>
                <li><code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">ALTER TABLE ALTER COLUMN TYPE</code></li>
                <li><code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">ALTER TABLE SET NOT NULL</code> (without CHECK pattern)</li>
                <li><code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">ALTER TABLE ADD CONSTRAINT ... UNIQUE</code> (without USING INDEX)</li>
                <li><code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">VACUUM FULL</code></li>
                <li><code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">CLUSTER</code></li>
                <li><code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">LOCK TABLE</code></li>
              </ul>

              <h2 className="text-2xl font-bold mt-12 mb-4 text-fg">The Lock Queue Problem</h2>

              <p className="text-muted leading-relaxed mb-4">
                Here is the part that surprises most engineers: PostgreSQL lock acquisition is a FIFO queue. If your
                DDL statement is waiting for an ACCESS EXCLUSIVE lock, every subsequent query that needs a conflicting
                lock queues up behind it.
              </p>

              <p className="text-muted leading-relaxed mb-4">
                Consider this scenario:
              </p>

              <ol className="list-decimal list-inside text-muted space-y-2 mb-6 ml-4">
                <li>A long-running analytics query holds ACCESS SHARE on the <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">users</code> table</li>
                <li>Your migration runs <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">ALTER TABLE users SET NOT NULL ...</code> which needs ACCESS EXCLUSIVE</li>
                <li>The ALTER waits behind the analytics query</li>
                <li>Every new SELECT on <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">users</code> queues behind the ALTER</li>
                <li>Your connection pool fills up within seconds</li>
                <li>Application outage</li>
              </ol>

              <p className="text-muted leading-relaxed mb-6">
                This is why <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">SET lock_timeout</code> is essential. If you set a lock timeout of 5 seconds,
                the ALTER will fail fast instead of queuing indefinitely:
              </p>

              <CodeBlock code={`-- Always set a lock_timeout before DDL in production
SET lock_timeout = '5s';
ALTER TABLE users ALTER COLUMN email SET NOT NULL;

-- If the lock cannot be acquired within 5 seconds,
-- PostgreSQL raises: ERROR: canceling statement due to lock timeout`} language="sql" />

              <h2 className="text-2xl font-bold mt-12 mb-4 text-fg">Lock Conflicts: Which Locks Block Which</h2>

              <p className="text-muted leading-relaxed mb-4">
                The lock conflict matrix is not obvious. Two locks conflict only when one would violate the
                guarantees the other provides. Here are the most important conflicts to remember:
              </p>

              <ul className="list-disc list-inside text-muted space-y-2 mb-6 ml-4">
                <li><strong className="text-fg">ACCESS EXCLUSIVE</strong> conflicts with everything, including ACCESS SHARE (SELECT)</li>
                <li><strong className="text-fg">SHARE</strong> conflicts with ROW EXCLUSIVE (INSERT/UPDATE/DELETE), so CREATE INDEX blocks writes</li>
                <li><strong className="text-fg">SHARE UPDATE EXCLUSIVE</strong> only conflicts with itself, SHARE, and the EXCLUSIVEs</li>
                <li><strong className="text-fg">ROW EXCLUSIVE</strong> does not conflict with itself (concurrent writes are fine) but conflicts with SHARE and above</li>
              </ul>

              <h2 className="text-2xl font-bold mt-12 mb-4 text-fg">Common DDL Statements and Their Lock Types</h2>

              <p className="text-muted leading-relaxed mb-4">
                Here is a practical reference for the DDL you are most likely to run in migrations:
              </p>

              <CodeBlock code={`-- ACCESS EXCLUSIVE (blocks everything)
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
DELETE FROM users ...`} language="sql" />

              <h2 className="text-2xl font-bold mt-12 mb-4 text-fg">Practical Guidelines</h2>

              <h3 className="text-xl font-semibold mt-8 mb-3 text-fg">1. Always set lock_timeout</h3>

              <p className="text-muted leading-relaxed mb-6">
                Before any DDL in production, set a lock_timeout. Five seconds is a good default. If the lock
                cannot be acquired in that time, it is better to fail and retry than to queue up all traffic.
              </p>

              <h3 className="text-xl font-semibold mt-8 mb-3 text-fg">2. Use CONCURRENTLY whenever possible</h3>

              <p className="text-muted leading-relaxed mb-6">
                CREATE INDEX, DROP INDEX, REINDEX, and REFRESH MATERIALIZED VIEW all have CONCURRENTLY variants.
                They take longer but do not block reads or writes. Use them in production without exception.
              </p>

              <h3 className="text-xl font-semibold mt-8 mb-3 text-fg">3. Avoid ACCESS EXCLUSIVE unless necessary</h3>

              <p className="text-muted leading-relaxed mb-6">
                Most ACCESS EXCLUSIVE operations have safer alternatives. Adding NOT NULL can use the CHECK pattern.
                Adding a UNIQUE constraint can use CREATE UNIQUE INDEX CONCURRENTLY + ADD CONSTRAINT USING INDEX.
                Column type changes can use expand-contract with a new column.
              </p>

              <h3 className="text-xl font-semibold mt-8 mb-3 text-fg">4. Keep transactions short</h3>

              <p className="text-muted leading-relaxed mb-6">
                Locks are held until the end of the transaction. If you wrap multiple DDL statements in a single
                transaction, you hold the most restrictive lock for the entire duration. Split large migrations
                into separate transactions when possible.
              </p>

              <h2 className="text-2xl font-bold mt-12 mb-4 text-fg">How to Check Current Locks</h2>

              <p className="text-muted leading-relaxed mb-4">
                You can inspect active locks with this query:
              </p>

              <CodeBlock code={`SELECT
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
ORDER BY a.query_start;`} language="sql" />

              <p className="text-muted leading-relaxed mb-4">
                And to see blocked queries:
              </p>

              <CodeBlock code={`SELECT
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
WHERE blocked.pid <> blocking.pid;`} language="sql" />

              <h2 className="text-2xl font-bold mt-12 mb-4 text-fg">Automate Lock Analysis</h2>

              <p className="text-muted leading-relaxed mb-6">
                Memorizing lock types is error-prone. Tools can catch lock issues before they reach production.{' '}
                <a href="https://github.com/mickelsamuel/migrationpilot" className="text-accent hover:text-accent-hover">MigrationPilot</a>{' '}
                analyzes your migration SQL and reports the exact lock type each statement will acquire, flags
                dangerous patterns like missing CONCURRENTLY or lock_timeout, and suggests safe alternatives.
                It runs as a CLI, GitHub Action, or Node.js library with 112 safety rules.
              </p>

              <CommandBlock command={`npx migrationpilot analyze migrations/002_add_index.sql`} />
            </div>
          </div>
        </article>
      </main>
      <Footer />
    </>
  );
}
