import type { Metadata } from 'next';
import Navbar from '@/components/navbar';

export const metadata: Metadata = {
  title: 'Which ALTER TABLE Operations Lock Your PostgreSQL Table? — MigrationPilot',
  description: 'A complete reference of which ALTER TABLE operations acquire ACCESS EXCLUSIVE locks, which are safe, and the workarounds for every dangerous operation.',
  keywords: ['alter table lock postgresql', 'postgresql alter table locks', 'access exclusive lock alter table', 'postgresql ddl locking', 'alter table safely postgresql'],
  alternates: {
    canonical: '/blog/alter-table-lock-postgresql',
  },
  openGraph: {
    title: 'Which ALTER TABLE Operations Lock Your PostgreSQL Table?',
    description: 'A complete reference of which ALTER TABLE operations acquire ACCESS EXCLUSIVE locks, which are safe, and the workarounds for every dangerous operation.',
    type: 'article',
    url: '/blog/alter-table-lock-postgresql',
  },
};

export default function AlterTableLockPostgreSQL() {
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
            <span>11 min read</span>
          </div>

          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
            Which ALTER TABLE Operations Lock Your PostgreSQL Table?
          </h1>

          <p className="text-xl text-slate-400 mb-12 leading-relaxed">
            ALTER TABLE is not a single operation. PostgreSQL has dozens of ALTER TABLE sub-commands,
            and they acquire different lock levels. Some are instant and harmless. Others lock
            your entire table and block all traffic. This is the complete reference.
          </p>

          <div className="prose prose-invert max-w-none">
            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">ACCESS EXCLUSIVE Operations (Block Everything)</h2>

            <p className="text-slate-300 leading-relaxed mb-4">
              These ALTER TABLE operations acquire ACCESS EXCLUSIVE, which blocks all reads and writes
              on the table. On a busy production table, these are the operations most likely to cause
              outages.
            </p>

            <h3 className="text-xl font-semibold mt-8 mb-3 text-slate-200">ADD COLUMN with volatile DEFAULT</h3>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-4">
              <code className="text-sm text-slate-300 font-mono">{`-- Rewrites the entire table (all PostgreSQL versions)
ALTER TABLE users ADD COLUMN request_id UUID DEFAULT gen_random_uuid();

-- Safe alternative: three-step pattern
ALTER TABLE users ADD COLUMN request_id UUID;
ALTER TABLE users ALTER COLUMN request_id SET DEFAULT gen_random_uuid();
-- Backfill in batches...`}</code>
            </pre>

            <p className="text-slate-300 leading-relaxed mb-6">
              On PostgreSQL 11+, non-volatile defaults (constants like <code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">{`'active'`}</code>,{' '}
              <code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">0</code>, <code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">false</code>)
              are instant and do not rewrite the table. Volatile defaults (<code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">now()</code>,{' '}
              <code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">gen_random_uuid()</code>,{' '}
              <code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">random()</code>) still rewrite the table.
            </p>

            <h3 className="text-xl font-semibold mt-8 mb-3 text-slate-200">ALTER COLUMN TYPE</h3>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-4">
              <code className="text-sm text-slate-300 font-mono">{`-- Rewrites the entire table under ACCESS EXCLUSIVE
ALTER TABLE orders ALTER COLUMN amount TYPE BIGINT;
ALTER TABLE users ALTER COLUMN name TYPE VARCHAR(100);

-- Safe alternative: expand-contract pattern
ALTER TABLE orders ADD COLUMN amount_v2 BIGINT;
-- Sync trigger + backfill + app code switch + drop old column`}</code>
            </pre>

            <p className="text-slate-300 leading-relaxed mb-6">
              There are a few exceptions where ALTER COLUMN TYPE does not rewrite the table:
              changing <code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">VARCHAR(n)</code> to <code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">VARCHAR(m)</code> where m &gt; n (widening),
              changing <code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">VARCHAR(n)</code> to <code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">TEXT</code>,
              and changing <code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">NUMERIC(p,s)</code> to <code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">NUMERIC</code> (removing precision constraint).
              These are metadata-only changes that still acquire ACCESS EXCLUSIVE but complete instantly.
            </p>

            <h3 className="text-xl font-semibold mt-8 mb-3 text-slate-200">SET NOT NULL</h3>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-4">
              <code className="text-sm text-slate-300 font-mono">{`-- Scans entire table under ACCESS EXCLUSIVE to verify no NULLs exist
ALTER TABLE users ALTER COLUMN email SET NOT NULL;

-- Safe alternative: CHECK + VALIDATE pattern
ALTER TABLE users ADD CONSTRAINT chk_email_nn
  CHECK (email IS NOT NULL) NOT VALID;
ALTER TABLE users VALIDATE CONSTRAINT chk_email_nn;

-- PG 12+: After validation, SET NOT NULL is instant
ALTER TABLE users ALTER COLUMN email SET NOT NULL;
ALTER TABLE users DROP CONSTRAINT chk_email_nn;`}</code>
            </pre>

            <h3 className="text-xl font-semibold mt-8 mb-3 text-slate-200">ADD CONSTRAINT (UNIQUE, PRIMARY KEY, EXCLUDE)</h3>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-4">
              <code className="text-sm text-slate-300 font-mono">{`-- Scans table + builds index under ACCESS EXCLUSIVE
ALTER TABLE users ADD CONSTRAINT uniq_email UNIQUE (email);

-- Safe alternative: build index concurrently first
CREATE UNIQUE INDEX CONCURRENTLY idx_users_email ON users (email);
ALTER TABLE users ADD CONSTRAINT uniq_email UNIQUE USING INDEX idx_users_email;
-- The ADD CONSTRAINT USING INDEX is instant`}</code>
            </pre>

            <h3 className="text-xl font-semibold mt-8 mb-3 text-slate-200">SET LOGGED / SET UNLOGGED</h3>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-6">
              <code className="text-sm text-slate-300 font-mono">{`-- Rewrites the entire table
ALTER TABLE events SET UNLOGGED;
ALTER TABLE events SET LOGGED;
-- No safe alternative — avoid in production`}</code>
            </pre>

            <h3 className="text-xl font-semibold mt-8 mb-3 text-slate-200">Other ACCESS EXCLUSIVE operations</h3>

            <ul className="list-disc list-inside text-slate-300 space-y-2 mb-6 ml-4">
              <li><code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">DROP COLUMN</code> — instant but holds ACCESS EXCLUSIVE briefly</li>
              <li><code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">RENAME COLUMN</code> — instant but holds ACCESS EXCLUSIVE briefly</li>
              <li><code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">RENAME TABLE</code> — instant but holds ACCESS EXCLUSIVE briefly</li>
              <li><code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">ADD COLUMN ... GENERATED ALWAYS AS (expr) STORED</code> — rewrites table</li>
              <li><code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">CLUSTER</code> — rewrites table</li>
            </ul>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">SHARE ROW EXCLUSIVE Operations (Block Writes)</h2>

            <p className="text-slate-300 leading-relaxed mb-4">
              These operations block INSERT, UPDATE, DELETE but allow SELECT queries to continue.
            </p>

            <h3 className="text-xl font-semibold mt-8 mb-3 text-slate-200">ADD CONSTRAINT ... FOREIGN KEY (without NOT VALID)</h3>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-4">
              <code className="text-sm text-slate-300 font-mono">{`-- Validates all existing rows — blocks writes during scan
ALTER TABLE orders ADD CONSTRAINT fk_user
  FOREIGN KEY (user_id) REFERENCES users (id);

-- Safe alternative: NOT VALID + VALIDATE
ALTER TABLE orders ADD CONSTRAINT fk_user
  FOREIGN KEY (user_id) REFERENCES users (id) NOT VALID;
-- NOT VALID acquires SHARE ROW EXCLUSIVE but is instant

ALTER TABLE orders VALIDATE CONSTRAINT fk_user;
-- VALIDATE acquires SHARE UPDATE EXCLUSIVE (does not block writes)`}</code>
            </pre>

            <p className="text-slate-300 leading-relaxed mb-6">
              Note that foreign keys lock <strong className="text-slate-200">both</strong> the child table (orders)
              and the parent table (users). The lock on the parent table is SHARE ROW EXCLUSIVE as well.
              This is one of the most overlooked aspects of FK constraints — your migration might not touch
              the parent table, but it still locks it.
            </p>

            <h3 className="text-xl font-semibold mt-8 mb-3 text-slate-200">CREATE TRIGGER</h3>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-6">
              <code className="text-sm text-slate-300 font-mono">{`-- Acquires SHARE ROW EXCLUSIVE — blocks writes briefly
-- This is typically instant, so the lock duration is negligible
CREATE TRIGGER trg_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION update_modified_at();`}</code>
            </pre>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">SHARE UPDATE EXCLUSIVE Operations (Safe)</h2>

            <p className="text-slate-300 leading-relaxed mb-4">
              These operations do not block reads or writes. They only conflict with other SHARE UPDATE
              EXCLUSIVE operations and stronger locks.
            </p>

            <ul className="list-disc list-inside text-slate-300 space-y-2 mb-6 ml-4">
              <li><code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">ALTER TABLE VALIDATE CONSTRAINT</code> — validates CHECK or FK constraints</li>
              <li><code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">ALTER TABLE SET STATISTICS</code> — changes column statistics target</li>
              <li><code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">ALTER TABLE SET (fillfactor = ...)</code> — changes storage parameters</li>
              <li><code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">ALTER TABLE SET (autovacuum_enabled = ...)</code> — changes autovacuum settings</li>
            </ul>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">Quick Reference Table</h2>

            <div className="overflow-x-auto mb-8">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left py-3 px-4 text-slate-300 font-semibold">Operation</th>
                    <th className="text-left py-3 px-4 text-slate-300 font-semibold">Lock</th>
                    <th className="text-left py-3 px-4 text-slate-300 font-semibold">Duration</th>
                    <th className="text-left py-3 px-4 text-slate-300 font-semibold">Safe Alternative</th>
                  </tr>
                </thead>
                <tbody className="text-slate-400">
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4 font-mono text-sm">ADD COLUMN (no default)</td>
                    <td className="py-3 px-4 text-green-400">ACCESS EXCLUSIVE</td>
                    <td className="py-3 px-4">Instant</td>
                    <td className="py-3 px-4 text-slate-500">N/A (already safe)</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4 font-mono text-sm">ADD COLUMN (constant default, PG11+)</td>
                    <td className="py-3 px-4 text-green-400">ACCESS EXCLUSIVE</td>
                    <td className="py-3 px-4">Instant</td>
                    <td className="py-3 px-4 text-slate-500">N/A (already safe)</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4 font-mono text-sm">ADD COLUMN (volatile default)</td>
                    <td className="py-3 px-4 text-red-400">ACCESS EXCLUSIVE</td>
                    <td className="py-3 px-4 text-red-400">Table rewrite</td>
                    <td className="py-3 px-4">Three-step pattern</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4 font-mono text-sm">ALTER COLUMN TYPE</td>
                    <td className="py-3 px-4 text-red-400">ACCESS EXCLUSIVE</td>
                    <td className="py-3 px-4 text-red-400">Table rewrite</td>
                    <td className="py-3 px-4">Expand-contract</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4 font-mono text-sm">SET NOT NULL</td>
                    <td className="py-3 px-4 text-red-400">ACCESS EXCLUSIVE</td>
                    <td className="py-3 px-4 text-red-400">Full scan</td>
                    <td className="py-3 px-4">CHECK + VALIDATE</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4 font-mono text-sm">DROP NOT NULL</td>
                    <td className="py-3 px-4 text-yellow-400">ACCESS EXCLUSIVE</td>
                    <td className="py-3 px-4">Instant</td>
                    <td className="py-3 px-4 text-slate-500">N/A</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4 font-mono text-sm">ADD CONSTRAINT UNIQUE</td>
                    <td className="py-3 px-4 text-red-400">ACCESS EXCLUSIVE</td>
                    <td className="py-3 px-4 text-red-400">Index build</td>
                    <td className="py-3 px-4">CONCURRENTLY + USING INDEX</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4 font-mono text-sm">ADD CONSTRAINT FK</td>
                    <td className="py-3 px-4 text-yellow-400">SHARE ROW EXCL</td>
                    <td className="py-3 px-4 text-red-400">Full scan</td>
                    <td className="py-3 px-4">NOT VALID + VALIDATE</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4 font-mono text-sm">ADD CONSTRAINT CHECK</td>
                    <td className="py-3 px-4 text-yellow-400">SHARE ROW EXCL</td>
                    <td className="py-3 px-4 text-red-400">Full scan</td>
                    <td className="py-3 px-4">NOT VALID + VALIDATE</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4 font-mono text-sm">VALIDATE CONSTRAINT</td>
                    <td className="py-3 px-4 text-green-400">SHARE UPDATE EXCL</td>
                    <td className="py-3 px-4">Full scan</td>
                    <td className="py-3 px-4 text-slate-500">N/A (already safe)</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4 font-mono text-sm">DROP COLUMN</td>
                    <td className="py-3 px-4 text-yellow-400">ACCESS EXCLUSIVE</td>
                    <td className="py-3 px-4">Instant</td>
                    <td className="py-3 px-4 text-slate-500">N/A</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4 font-mono text-sm">RENAME COLUMN</td>
                    <td className="py-3 px-4 text-yellow-400">ACCESS EXCLUSIVE</td>
                    <td className="py-3 px-4">Instant</td>
                    <td className="py-3 px-4">Expand-contract</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4 font-mono text-sm">SET DEFAULT</td>
                    <td className="py-3 px-4 text-green-400">ACCESS EXCLUSIVE</td>
                    <td className="py-3 px-4">Instant</td>
                    <td className="py-3 px-4 text-slate-500">N/A</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4 font-mono text-sm">SET STATISTICS</td>
                    <td className="py-3 px-4 text-green-400">SHARE UPDATE EXCL</td>
                    <td className="py-3 px-4">Instant</td>
                    <td className="py-3 px-4 text-slate-500">N/A</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">The Key Insight: Lock Level vs Duration</h2>

            <p className="text-slate-300 leading-relaxed mb-4">
              A common misconception is that ACCESS EXCLUSIVE always means danger. That is not quite right.
              The danger comes from <strong className="text-slate-200">ACCESS EXCLUSIVE held for a long time</strong>.
            </p>

            <p className="text-slate-300 leading-relaxed mb-4">
              Adding a column without a default acquires ACCESS EXCLUSIVE, but it completes in milliseconds.
              The lock is barely noticeable. ALTER COLUMN TYPE also acquires ACCESS EXCLUSIVE, but it rewrites
              the entire table, which can take minutes. Both are ACCESS EXCLUSIVE, but only one is dangerous.
            </p>

            <p className="text-slate-300 leading-relaxed mb-6">
              The risk formula is: <strong className="text-slate-200">Lock Severity x Duration x Traffic</strong>.
              A brief ACCESS EXCLUSIVE on a low-traffic table is fine. A long-running SHARE lock on a
              high-traffic table can bring down your application.
            </p>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">Catch Lock Issues Before Production</h2>

            <p className="text-slate-300 leading-relaxed mb-6">
              Static analysis can catch most dangerous ALTER TABLE patterns before they reach production.{' '}
              <a href="https://github.com/mickelsamuel/migrationpilot" className="text-blue-400 hover:text-blue-300">MigrationPilot</a>{' '}
              reports the exact lock type each ALTER TABLE sub-command acquires, flags operations that
              cause table rewrites or full scans, and suggests the safe alternative pattern. All 80 rules
              run in milliseconds without any database connection.
            </p>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-8">
              <code className="text-sm text-slate-300 font-mono">{`npx migrationpilot analyze migrations/005_alter_users.sql`}</code>
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
