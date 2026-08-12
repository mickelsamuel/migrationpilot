import type { Metadata } from 'next';
import Navbar from '@/components/navbar';
import { Footer } from '@/components/footer';
import { CodeBlock } from '@/components/code-block';
import { ButtonLink } from '@/components/button';

export const metadata: Metadata = {
  title: 'PostgreSQL 18 Changed NOT NULL — Update Your Migration Rules',
  description: 'PostgreSQL 18 introduces NOT NULL constraints that can be added NOT VALID, plus NOT ENFORCED constraints. Learn what changed, how it affects your migration safety, and how to update your tooling.',
  keywords: [
    'postgresql 18 not null not valid',
    'postgresql 18 not enforced',
    'postgresql 18 migration',
    'set not null not valid postgresql',
    'postgresql 18 new features',
    'postgresql not null constraint',
    'postgresql 18 schema changes',
  ],
  alternates: {
    canonical: '/blog/postgresql-18-not-null-not-valid',
  },
  openGraph: {
    title: 'PostgreSQL 18 Changed NOT NULL — Update Your Migration Rules',
    description: 'PostgreSQL 18 introduces NOT NULL constraints that can be added NOT VALID, plus NOT ENFORCED constraints. Learn what changed and how to update your migration tooling.',
    type: 'article',
    url: '/blog/postgresql-18-not-null-not-valid',
  },
};

export default function PostgreSQL18NotNull() {
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
              <time dateTime="2026-03-07">March 7, 2026</time>
              <span className="w-1 h-1 rounded-full bg-line" />
              <span>5 min read</span>
            </div>

            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
              PostgreSQL 18 Changed NOT NULL &mdash; Update Your Migration Rules
            </h1>

            <p className="text-xl text-muted mb-12 leading-relaxed">
              PostgreSQL 18 shipped three features that change how you write safe schema migrations:
              native <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">NOT NULL ... NOT VALID</code> constraints,{' '}
              <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">NOT ENFORCED</code> constraints, and
              stricter foreign key collation validation. If your migration tooling doesn&apos;t know about
              these, you&apos;re either missing simpler patterns or silently introducing risk.
            </p>

            <div className="prose prose-invert max-w-none">

              {/* --- Section 1: The Old Workaround --- */}
              <h2 className="text-2xl font-bold mt-12 mb-4 text-fg">
                The Old NOT NULL Workaround (PG 12&ndash;17)
              </h2>

              <p className="text-muted leading-relaxed mb-4">
                Before PostgreSQL 18, adding a NOT NULL constraint to an existing column was dangerous.
                The naive approach &mdash; <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">ALTER TABLE ... SET NOT NULL</code> &mdash;
                scans the entire table under an ACCESS EXCLUSIVE lock. On a table with millions of rows,
                this blocks all queries for seconds or minutes.
              </p>

              <p className="text-muted leading-relaxed mb-4">
                The community workaround has been the same since PostgreSQL 12:
              </p>

              <CodeBlock code={`-- Step 1: Add a CHECK constraint with NOT VALID (instant, no scan)
ALTER TABLE users
  ADD CONSTRAINT users_email_not_null
  CHECK (email IS NOT NULL) NOT VALID;

-- Step 2: Validate the constraint (scans table, but only SHARE lock)
ALTER TABLE users
  VALIDATE CONSTRAINT users_email_not_null;

-- Step 3: Now SET NOT NULL is instant (PG sees the CHECK)
ALTER TABLE users ALTER COLUMN email SET NOT NULL;

-- Step 4: Drop the redundant CHECK
ALTER TABLE users DROP CONSTRAINT users_email_not_null;`} language="sql" />

              <p className="text-muted leading-relaxed mb-6">
                This 4-step dance works, but it&apos;s verbose, easy to get wrong, and requires
                remembering to clean up the temporary CHECK constraint afterward.
                Every migration linter &mdash; Squawk, strong_migrations, MigrationPilot &mdash;
                teaches this pattern.
              </p>

              {/* --- Section 2: PG18 Native NOT NULL NOT VALID --- */}
              <h2 className="text-2xl font-bold mt-12 mb-4 text-fg">
                PG18: Native NOT NULL NOT VALID
              </h2>

              <p className="text-muted leading-relaxed mb-4">
                PostgreSQL 18 made NOT NULL a real named constraint, so it can be added{' '}
                <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">NOT VALID</code>{' '}
                and validated later. The 4-step workaround collapses to 2 steps:
              </p>

              <CodeBlock code={`-- PG18+: Native approach (2 steps instead of 4)

-- Step 1: Add the NOT NULL constraint without scanning (instant)
ALTER TABLE users
  ADD CONSTRAINT users_email_not_null NOT NULL email NOT VALID;

-- Step 2: Validate (scans table under SHARE lock, not ACCESS EXCLUSIVE)
ALTER TABLE users VALIDATE CONSTRAINT users_email_not_null;`} language="sql" />

              <div className="bg-ok-soft border border-ok/40 rounded-lg p-4 mb-6">
                <p className="text-ok text-sm leading-relaxed">
                  <strong>Why this matters:</strong> The CHECK constraint workaround is no longer needed
                  on PG18+. Using the native syntax is simpler, less error-prone, and achieves the same
                  safety guarantees. Fewer steps means fewer places for mistakes.
                </p>
              </div>

              <h3 className="text-xl font-semibold mt-8 mb-3 text-fg">What happens under the hood</h3>

              <p className="text-muted leading-relaxed mb-4">
                PG18 stores NOT NULL constraints as rows in pg_constraint (contype{' '}
                <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">n</code>), which is
                what makes them nameable and markable NOT VALID in the first place. Adding one writes a
                catalog row with <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">convalidated = false</code>.
                PostgreSQL will enforce the constraint for new INSERTs and UPDATEs immediately, but does
                not verify existing rows.
              </p>

              <p className="text-muted leading-relaxed mb-6">
                <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">VALIDATE CONSTRAINT</code>{' '}
                then scans existing rows under a SHARE UPDATE EXCLUSIVE lock (concurrent reads and writes
                are allowed) and, once all rows pass, marks the constraint as fully validated. It is the
                same statement you already use for CHECK and foreign key constraints &mdash; there is no
                separate validation syntax for NOT NULL.
              </p>

              <h3 className="text-xl font-semibold mt-8 mb-3 text-fg">Migration linter implications</h3>

              <p className="text-muted leading-relaxed mb-4">
                If you&apos;re running PG18+ and your migration linter still suggests the CHECK constraint
                workaround, it&apos;s giving you outdated advice. Worse, if you&apos;re still <em>writing</em>{' '}
                the old pattern, you&apos;re adding unnecessary complexity.
              </p>

              <p className="text-muted leading-relaxed mb-6">
                MigrationPilot v1.5.1 includes rule{' '}
                <a href="/rules/mp081" className="text-accent hover:text-accent-hover">MP081</a> that
                detects the old CHECK workaround on PG18+ and suggests the simpler native syntax.
              </p>

              {/* --- Section 3: NOT ENFORCED Constraints --- */}
              <h2 className="text-2xl font-bold mt-12 mb-4 text-fg">
                PG18: NOT ENFORCED Constraints
              </h2>

              <p className="text-muted leading-relaxed mb-4">
                PostgreSQL 18 also introduced{' '}
                <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">NOT ENFORCED</code>{' '}
                constraints, borrowed from the SQL standard. A NOT ENFORCED constraint exists in metadata
                but PostgreSQL does <strong>not</strong> actually enforce it:
              </p>

              <CodeBlock code={`-- This constraint exists in pg_constraint but does NOT reject invalid data
ALTER TABLE orders
  ADD CONSTRAINT orders_total_positive
  CHECK (total > 0) NOT ENFORCED;

-- This INSERT will succeed even though total is negative!
INSERT INTO orders (total) VALUES (-100);  -- No error`} language="sql" />

              <div className="bg-warn-soft border border-warn/30 rounded-lg p-4 mb-6">
                <p className="text-warn text-sm leading-relaxed">
                  <strong>Warning:</strong> NOT ENFORCED constraints do NOT protect data integrity.
                  They serve as hints to the query planner and as documentation, but invalid data
                  <em> can and will</em> be inserted. If you expect the constraint to reject bad data,
                  do not use NOT ENFORCED.
                </p>
              </div>

              <h3 className="text-xl font-semibold mt-8 mb-3 text-fg">When NOT ENFORCED is useful</h3>

              <ul className="list-disc list-inside text-muted space-y-2 mb-6 ml-4">
                <li>
                  <strong className="text-fg">Query planner hints:</strong> Foreign key constraints
                  with NOT ENFORCED can help the planner generate better join plans without the overhead
                  of enforcing referential integrity at write time.
                </li>
                <li>
                  <strong className="text-fg">Gradual migration:</strong> Add a NOT ENFORCED
                  constraint first, fix existing bad data, then ALTER the constraint to be enforced.
                </li>
                <li>
                  <strong className="text-fg">Documentation:</strong> Record business rules in the
                  schema even when enforcement happens at the application layer.
                </li>
              </ul>

              <h3 className="text-xl font-semibold mt-8 mb-3 text-fg">The risk</h3>

              <p className="text-muted leading-relaxed mb-6">
                The danger is that a developer sees a CHECK constraint in the schema and assumes the
                database enforces it. NOT ENFORCED silently allows invalid data. Six months later,
                someone queries the table expecting all rows to satisfy the constraint, and gets
                corrupted results.
              </p>

              <p className="text-muted leading-relaxed mb-6">
                MigrationPilot v1.5.1 includes rule{' '}
                <a href="/rules/mp082" className="text-accent hover:text-accent-hover">MP082</a> that
                warns whenever it detects NOT ENFORCED in a migration, ensuring teams consciously
                acknowledge the trade-off.
              </p>

              {/* --- Section 4: FK Collation Validation --- */}
              <h2 className="text-2xl font-bold mt-12 mb-4 text-fg">
                PG18: Foreign Key Collation Validation
              </h2>

              <p className="text-muted leading-relaxed mb-4">
                PostgreSQL 18 tightened validation of foreign key constraints involving
                non-deterministic collations (ICU collations like{' '}
                <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">und-x-icu</code>).
                Previously, you could create a FK between columns using ICU collations even though
                equality comparisons with non-deterministic collations can be ambiguous.
              </p>

              <CodeBlock code={`-- PG18 may reject this if the columns use non-deterministic collation
CREATE TABLE child (
  parent_name TEXT COLLATE "und-x-icu",
  FOREIGN KEY (parent_name) REFERENCES parent(name)
);

-- The problem: with non-deterministic collation, 'cafe' and 'caf\\u00e9'
-- might compare as equal, making FK lookups unreliable`} language="sql" />

              <p className="text-muted leading-relaxed mb-6">
                This is a subtle correctness issue. Most teams won&apos;t hit it unless they&apos;re
                using ICU collations for internationalization. But if you are, a migration that worked
                on PG17 might fail on PG18 &mdash; or worse, succeed but produce incorrect referential
                integrity checks.
              </p>

              <p className="text-muted leading-relaxed mb-6">
                MigrationPilot v1.5.1 includes rule{' '}
                <a href="/rules/mp083" className="text-accent hover:text-accent-hover">MP083</a> that
                flags foreign key constraints involving non-deterministic collations on PG18+.
              </p>

              {/* --- Section 5: What to Do --- */}
              <h2 className="text-2xl font-bold mt-12 mb-4 text-fg">
                What You Should Do
              </h2>

              <h3 className="text-xl font-semibold mt-8 mb-3 text-fg">If you&apos;re upgrading to PG18</h3>

              <ol className="list-decimal list-inside text-muted space-y-3 mb-6 ml-4">
                <li>
                  <strong className="text-fg">Search your migration files for CHECK ... IS NOT NULL ... NOT VALID.</strong>{' '}
                  These are candidates for the simpler PG18 native syntax.
                </li>
                <li>
                  <strong className="text-fg">Audit any NOT ENFORCED constraints.</strong>{' '}
                  Make sure every NOT ENFORCED usage has a comment explaining why enforcement is
                  intentionally skipped.
                </li>
                <li>
                  <strong className="text-fg">Check FK columns for ICU collations.</strong>{' '}
                  If you use <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">und-x-icu</code>{' '}
                  or locale-specific ICU collations, verify that your FK references still work correctly.
                </li>
                <li>
                  <strong className="text-fg">Update your migration linter.</strong>{' '}
                  Make sure it&apos;s PG18-aware. Set{' '}
                  <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">--pg-version 18</code>{' '}
                  to enable PG18-specific rules.
                </li>
              </ol>

              <h3 className="text-xl font-semibold mt-8 mb-3 text-fg">If you&apos;re staying on PG16/17</h3>

              <p className="text-muted leading-relaxed mb-6">
                Nothing changes. The CHECK constraint workaround remains the correct approach for
                PG12&ndash;17. MigrationPilot&apos;s existing rules (MP002, MP018) continue to guide you
                to the right pattern for your PostgreSQL version.
              </p>

              {/* --- Section 6: Linter Comparison --- */}
              <h2 className="text-2xl font-bold mt-12 mb-4 text-fg">
                Which Linters Are PG18-Aware?
              </h2>

              <div className="overflow-x-auto mb-8">
                <table className="text-sm border border-line rounded-lg overflow-hidden">
                  <thead>
                    <tr className="bg-raised">
                      <th className="text-left px-4 py-3 font-medium text-faint">Feature</th>
                      <th className="text-center px-4 py-3 font-medium text-faint">Squawk</th>
                      <th className="text-center px-4 py-3 font-medium text-faint">strong_migrations</th>
                      <th className="text-center px-4 py-3 font-medium text-accent">MigrationPilot</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { feature: 'PG18 NOT NULL NOT VALID detection', squawk: 'No', strong: 'No', mp: 'Yes (MP081)' },
                      { feature: 'NOT ENFORCED constraint warnings', squawk: 'No', strong: 'No', mp: 'Yes (MP082)' },
                      { feature: 'FK collation validation', squawk: 'No', strong: 'No', mp: 'Yes (MP083)' },
                      { feature: 'PG version-specific advice', squawk: 'Partial', strong: 'Yes', mp: 'Yes (PG 9-20)' },
                      { feature: '--pg-version flag', squawk: 'No', strong: 'N/A', mp: 'Yes' },
                    ].map((row) => (
                      <tr key={row.feature} className="border-t border-line-soft">
                        <td className="py-3 px-4 font-semibold text-faint">{row.feature}</td>
                        <td className="py-3 px-4 text-center text-danger">{row.squawk}</td>
                        <td className="py-3 px-4 text-center text-danger">{row.strong}</td>
                        <td className="py-3 px-4 text-center text-ok">{row.mp}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="text-muted leading-relaxed mb-6">
                As of August 2026, MigrationPilot is the only linter we know of that ships rules written
                against PG18&apos;s new syntax. Squawk does track new PostgreSQL releases &mdash; v2.59.0
                (June 2026) added PG19 parser support &mdash; but it has no rule that tells you to prefer
                <code className="text-accent text-sm mx-1">NOT NULL ... NOT VALID</code> over the old CHECK
                workaround, and none that flags a <code className="text-accent text-sm mx-1">NOT ENFORCED</code>
                constraint. strong_migrations provides version-specific advice for Rails but hasn&apos;t added
                PG18 patterns yet.
              </p>

              {/* --- Section 7: Quick Start --- */}
              <h2 className="text-2xl font-bold mt-12 mb-4 text-fg">
                Try It Now
              </h2>

              <CodeBlock code={`# Check a migration against PG18 rules
npx migrationpilot analyze migration.sql --pg-version 18

# Or add to your GitHub Action
- uses: mickelsamuel/migrationpilot@v1
  with:
    migration-path: "migrations/*.sql"
    pg-version: "18"`} />

              <p className="text-muted leading-relaxed mb-6">
                MigrationPilot is open-source (MIT), runs 112 safety rules in milliseconds; 97 of them
                need no database connection at all. The PG18 rules (MP081&ndash;MP083) are included, free.
              </p>

              <div className="flex flex-col sm:flex-row items-center gap-4 mt-8">
                <ButtonLink href="https://github.com/mickelsamuel/migrationpilot" variant="primary">
                  View on GitHub
                </ButtonLink>
                <ButtonLink href="/docs" variant="secondary">
                  Read the Docs
                </ButtonLink>
              </div>
            </div>
          </div>
        </article>
      </main>
      <Footer />
    </>
  );
}
