import type { Metadata } from 'next';
import Navbar from '@/components/navbar';
import { Footer } from '@/components/footer';
import { CodeBlock, CommandBlock } from '@/components/code-block';

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
              <span>3 min read</span>
            </div>

            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
              Which ALTER TABLE Operations Lock Your PostgreSQL Table?
            </h1>

            <p className="text-xl text-muted mb-12 leading-relaxed">
              ALTER TABLE is not a single operation. PostgreSQL has dozens of ALTER TABLE sub-commands,
              and they acquire different lock levels. Some are instant and harmless. Others lock
              your entire table and block all traffic. This is the complete reference.
            </p>

            <div className="prose prose-invert max-w-none">
              <h2 className="text-2xl font-bold mt-12 mb-4 text-fg">ACCESS EXCLUSIVE Operations (Block Everything)</h2>

              <p className="text-muted leading-relaxed mb-4">
                These ALTER TABLE operations acquire ACCESS EXCLUSIVE, which blocks all reads and writes
                on the table. On a busy production table, these are the operations most likely to cause
                outages.
              </p>

              <h3 className="text-xl font-semibold mt-8 mb-3 text-fg">ADD COLUMN with volatile DEFAULT</h3>

              <CodeBlock code={`-- Rewrites the entire table (all PostgreSQL versions)
ALTER TABLE users ADD COLUMN request_id UUID DEFAULT gen_random_uuid();

-- Safe alternative: three-step pattern
ALTER TABLE users ADD COLUMN request_id UUID;
ALTER TABLE users ALTER COLUMN request_id SET DEFAULT gen_random_uuid();
-- Backfill in batches...`} language="sql" />

              <p className="text-muted leading-relaxed mb-6">
                On PostgreSQL 11+, non-volatile defaults (constants like <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">{`'active'`}</code>,{' '}
                <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">0</code>, <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">false</code>)
                are instant and do not rewrite the table. Volatile defaults (<code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">now()</code>,{' '}
                <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">gen_random_uuid()</code>,{' '}
                <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">random()</code>) still rewrite the table.
              </p>

              <h3 className="text-xl font-semibold mt-8 mb-3 text-fg">ALTER COLUMN TYPE</h3>

              <CodeBlock code={`-- Rewrites the entire table under ACCESS EXCLUSIVE
ALTER TABLE orders ALTER COLUMN amount TYPE BIGINT;
ALTER TABLE users ALTER COLUMN name TYPE VARCHAR(100);

-- Safe alternative: expand-contract pattern
ALTER TABLE orders ADD COLUMN amount_v2 BIGINT;
-- Sync trigger + backfill + app code switch + drop old column`} language="sql" />

              <p className="text-muted leading-relaxed mb-6">
                There are a few exceptions where ALTER COLUMN TYPE does not rewrite the table:
                changing <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">VARCHAR(n)</code> to <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">VARCHAR(m)</code> where m &gt; n (widening),
                changing <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">VARCHAR(n)</code> to <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">TEXT</code>,
                and changing <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">NUMERIC(p,s)</code> to <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">NUMERIC</code> (removing precision constraint).
                These are metadata-only changes that still acquire ACCESS EXCLUSIVE but complete instantly.
              </p>

              <h3 className="text-xl font-semibold mt-8 mb-3 text-fg">SET NOT NULL</h3>

              <CodeBlock code={`-- Scans entire table under ACCESS EXCLUSIVE to verify no NULLs exist
ALTER TABLE users ALTER COLUMN email SET NOT NULL;

-- Safe alternative: CHECK + VALIDATE pattern
ALTER TABLE users ADD CONSTRAINT chk_email_nn
  CHECK (email IS NOT NULL) NOT VALID;
ALTER TABLE users VALIDATE CONSTRAINT chk_email_nn;

-- PG 12+: After validation, SET NOT NULL is instant
ALTER TABLE users ALTER COLUMN email SET NOT NULL;
ALTER TABLE users DROP CONSTRAINT chk_email_nn;`} language="sql" />

              <h3 className="text-xl font-semibold mt-8 mb-3 text-fg">ADD CONSTRAINT (UNIQUE, PRIMARY KEY, EXCLUDE)</h3>

              <CodeBlock code={`-- Scans table + builds index under ACCESS EXCLUSIVE
ALTER TABLE users ADD CONSTRAINT uniq_email UNIQUE (email);

-- Safe alternative: build index concurrently first
CREATE UNIQUE INDEX CONCURRENTLY idx_users_email ON users (email);
ALTER TABLE users ADD CONSTRAINT uniq_email UNIQUE USING INDEX idx_users_email;
-- The ADD CONSTRAINT USING INDEX is instant`} language="sql" />

              <h3 className="text-xl font-semibold mt-8 mb-3 text-fg">SET LOGGED / SET UNLOGGED</h3>

              <CodeBlock code={`-- Rewrites the entire table
ALTER TABLE events SET UNLOGGED;
ALTER TABLE events SET LOGGED;
-- No safe alternative — avoid in production`} language="sql" />

              <h3 className="text-xl font-semibold mt-8 mb-3 text-fg">Other ACCESS EXCLUSIVE operations</h3>

              <ul className="list-disc list-inside text-muted space-y-2 mb-6 ml-4">
                <li><code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">DROP COLUMN</code> — instant but holds ACCESS EXCLUSIVE briefly</li>
                <li><code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">RENAME COLUMN</code> — instant but holds ACCESS EXCLUSIVE briefly</li>
                <li><code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">RENAME TABLE</code> — instant but holds ACCESS EXCLUSIVE briefly</li>
                <li><code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">ADD COLUMN ... GENERATED ALWAYS AS (expr) STORED</code> — rewrites table</li>
                <li><code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">CLUSTER</code> — rewrites table</li>
              </ul>

              <h2 className="text-2xl font-bold mt-12 mb-4 text-fg">SHARE ROW EXCLUSIVE Operations (Block Writes)</h2>

              <p className="text-muted leading-relaxed mb-4">
                These operations block INSERT, UPDATE, DELETE but allow SELECT queries to continue.
              </p>

              <h3 className="text-xl font-semibold mt-8 mb-3 text-fg">ADD CONSTRAINT ... FOREIGN KEY (without NOT VALID)</h3>

              <CodeBlock code={`-- Validates all existing rows — blocks writes during scan
ALTER TABLE orders ADD CONSTRAINT fk_user
  FOREIGN KEY (user_id) REFERENCES users (id);

-- Safe alternative: NOT VALID + VALIDATE
ALTER TABLE orders ADD CONSTRAINT fk_user
  FOREIGN KEY (user_id) REFERENCES users (id) NOT VALID;
-- NOT VALID acquires SHARE ROW EXCLUSIVE but is instant

ALTER TABLE orders VALIDATE CONSTRAINT fk_user;
-- VALIDATE acquires SHARE UPDATE EXCLUSIVE (does not block writes)`} language="sql" />

              <p className="text-muted leading-relaxed mb-6">
                Note that foreign keys lock <strong className="text-fg">both</strong> the child table (orders)
                and the parent table (users). The lock on the parent table is SHARE ROW EXCLUSIVE as well.
                This is one of the most overlooked aspects of FK constraints — your migration might not touch
                the parent table, but it still locks it.
              </p>

              <h3 className="text-xl font-semibold mt-8 mb-3 text-fg">CREATE TRIGGER</h3>

              <CodeBlock code={`-- Acquires SHARE ROW EXCLUSIVE — blocks writes briefly
-- This is typically instant, so the lock duration is negligible
CREATE TRIGGER trg_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION update_modified_at();`} language="sql" />

              <h2 className="text-2xl font-bold mt-12 mb-4 text-fg">SHARE UPDATE EXCLUSIVE Operations (Safe)</h2>

              <p className="text-muted leading-relaxed mb-4">
                These operations do not block reads or writes. They only conflict with other SHARE UPDATE
                EXCLUSIVE operations and stronger locks.
              </p>

              <ul className="list-disc list-inside text-muted space-y-2 mb-6 ml-4">
                <li><code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">ALTER TABLE VALIDATE CONSTRAINT</code> — validates CHECK or FK constraints</li>
                <li><code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">ALTER TABLE SET STATISTICS</code> — changes column statistics target</li>
                <li><code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">ALTER TABLE SET (fillfactor = ...)</code> — changes storage parameters</li>
                <li><code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">ALTER TABLE SET (autovacuum_enabled = ...)</code> — changes autovacuum settings</li>
              </ul>

              <h2 className="text-2xl font-bold mt-12 mb-4 text-fg">Quick Reference Table</h2>

              <div className="overflow-x-auto mb-8">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-line">
                      <th className="text-left py-3 px-4 text-muted font-semibold">Operation</th>
                      <th className="text-left py-3 px-4 text-muted font-semibold">Lock</th>
                      <th className="text-left py-3 px-4 text-muted font-semibold">Duration</th>
                      <th className="text-left py-3 px-4 text-muted font-semibold">Safe Alternative</th>
                    </tr>
                  </thead>
                  <tbody className="text-muted">
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4 font-mono text-sm">ADD COLUMN (no default)</td>
                      <td className="py-3 px-4 text-ok">ACCESS EXCLUSIVE</td>
                      <td className="py-3 px-4">Instant</td>
                      <td className="py-3 px-4 text-faint">N/A (already safe)</td>
                    </tr>
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4 font-mono text-sm">ADD COLUMN (constant default, PG11+)</td>
                      <td className="py-3 px-4 text-ok">ACCESS EXCLUSIVE</td>
                      <td className="py-3 px-4">Instant</td>
                      <td className="py-3 px-4 text-faint">N/A (already safe)</td>
                    </tr>
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4 font-mono text-sm">ADD COLUMN (volatile default)</td>
                      <td className="py-3 px-4 text-danger">ACCESS EXCLUSIVE</td>
                      <td className="py-3 px-4 text-danger">Table rewrite</td>
                      <td className="py-3 px-4">Three-step pattern</td>
                    </tr>
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4 font-mono text-sm">ALTER COLUMN TYPE</td>
                      <td className="py-3 px-4 text-danger">ACCESS EXCLUSIVE</td>
                      <td className="py-3 px-4 text-danger">Table rewrite</td>
                      <td className="py-3 px-4">Expand-contract</td>
                    </tr>
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4 font-mono text-sm">SET NOT NULL</td>
                      <td className="py-3 px-4 text-danger">ACCESS EXCLUSIVE</td>
                      <td className="py-3 px-4 text-danger">Full scan</td>
                      <td className="py-3 px-4">CHECK + VALIDATE</td>
                    </tr>
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4 font-mono text-sm">DROP NOT NULL</td>
                      <td className="py-3 px-4 text-warn">ACCESS EXCLUSIVE</td>
                      <td className="py-3 px-4">Instant</td>
                      <td className="py-3 px-4 text-faint">N/A</td>
                    </tr>
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4 font-mono text-sm">ADD CONSTRAINT UNIQUE</td>
                      <td className="py-3 px-4 text-danger">ACCESS EXCLUSIVE</td>
                      <td className="py-3 px-4 text-danger">Index build</td>
                      <td className="py-3 px-4">CONCURRENTLY + USING INDEX</td>
                    </tr>
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4 font-mono text-sm">ADD CONSTRAINT FK</td>
                      <td className="py-3 px-4 text-warn">SHARE ROW EXCL</td>
                      <td className="py-3 px-4 text-danger">Full scan</td>
                      <td className="py-3 px-4">NOT VALID + VALIDATE</td>
                    </tr>
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4 font-mono text-sm">ADD CONSTRAINT CHECK</td>
                      <td className="py-3 px-4 text-warn">SHARE ROW EXCL</td>
                      <td className="py-3 px-4 text-danger">Full scan</td>
                      <td className="py-3 px-4">NOT VALID + VALIDATE</td>
                    </tr>
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4 font-mono text-sm">VALIDATE CONSTRAINT</td>
                      <td className="py-3 px-4 text-ok">SHARE UPDATE EXCL</td>
                      <td className="py-3 px-4">Full scan</td>
                      <td className="py-3 px-4 text-faint">N/A (already safe)</td>
                    </tr>
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4 font-mono text-sm">DROP COLUMN</td>
                      <td className="py-3 px-4 text-warn">ACCESS EXCLUSIVE</td>
                      <td className="py-3 px-4">Instant</td>
                      <td className="py-3 px-4 text-faint">N/A</td>
                    </tr>
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4 font-mono text-sm">RENAME COLUMN</td>
                      <td className="py-3 px-4 text-warn">ACCESS EXCLUSIVE</td>
                      <td className="py-3 px-4">Instant</td>
                      <td className="py-3 px-4">Expand-contract</td>
                    </tr>
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4 font-mono text-sm">SET DEFAULT</td>
                      <td className="py-3 px-4 text-ok">ACCESS EXCLUSIVE</td>
                      <td className="py-3 px-4">Instant</td>
                      <td className="py-3 px-4 text-faint">N/A</td>
                    </tr>
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4 font-mono text-sm">SET STATISTICS</td>
                      <td className="py-3 px-4 text-ok">SHARE UPDATE EXCL</td>
                      <td className="py-3 px-4">Instant</td>
                      <td className="py-3 px-4 text-faint">N/A</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <h2 className="text-2xl font-bold mt-12 mb-4 text-fg">The Key Insight: Lock Level vs Duration</h2>

              <p className="text-muted leading-relaxed mb-4">
                A common misconception is that ACCESS EXCLUSIVE always means danger. That is not quite right.
                The danger comes from <strong className="text-fg">ACCESS EXCLUSIVE held for a long time</strong>.
              </p>

              <p className="text-muted leading-relaxed mb-4">
                Adding a column without a default acquires ACCESS EXCLUSIVE, but it completes in milliseconds.
                The lock is barely noticeable. ALTER COLUMN TYPE also acquires ACCESS EXCLUSIVE, but it rewrites
                the entire table, which can take minutes. Both are ACCESS EXCLUSIVE, but only one is dangerous.
              </p>

              <p className="text-muted leading-relaxed mb-6">
                The risk formula is: <strong className="text-fg">Lock Severity x Duration x Traffic</strong>.
                A brief ACCESS EXCLUSIVE on a low-traffic table is fine. A long-running SHARE lock on a
                high-traffic table can bring down your application.
              </p>

              <h2 className="text-2xl font-bold mt-12 mb-4 text-fg">Catch Lock Issues Before Production</h2>

              <p className="text-muted leading-relaxed mb-6">
                Static analysis can catch most dangerous ALTER TABLE patterns before they reach production.{' '}
                <a href="https://github.com/mickelsamuel/migrationpilot" className="text-accent hover:text-accent-hover">MigrationPilot</a>{' '}
                reports the exact lock type each ALTER TABLE sub-command acquires, flags operations that
                cause table rewrites or full scans, and suggests the safe alternative pattern. All 112 rules
                run in milliseconds; 97 of them need no database connection at all.
              </p>

              <CommandBlock command={`npx migrationpilot analyze migrations/005_alter_users.sql`} />
            </div>
          </div>
        </article>
      </main>
      <Footer />
    </>
  );
}
