import type { Metadata } from 'next';
import Navbar from '@/components/navbar';

export const metadata: Metadata = {
  title: 'PostgreSQL 18 Changed NOT NULL — Update Your Migration Rules',
  description: 'PostgreSQL 18 introduces SET NOT NULL NOT VALID and NOT ENFORCED constraints. Learn what changed, how it affects your migration safety, and how to update your tooling.',
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
    description: 'PostgreSQL 18 introduces SET NOT NULL NOT VALID and NOT ENFORCED constraints. Learn what changed and how to update your migration tooling.',
    type: 'article',
    url: '/blog/postgresql-18-not-null-not-valid',
  },
};

export default function PostgreSQL18NotNull() {
  return (
    <main className="min-h-screen">
      <Navbar active="blog" />

      <article className="pt-32 pb-20 px-6">
        <div className="max-w-3xl mx-auto">
          <div className="mb-8">
            <a href="/blog" className="text-sm text-blue-400 hover:text-blue-300 transition-colors">&larr; Back to Blog</a>
          </div>

          <div className="flex items-center gap-3 text-sm text-slate-500 mb-4">
            <time dateTime="2026-03-07">March 7, 2026</time>
            <span className="w-1 h-1 rounded-full bg-slate-700" />
            <span>12 min read</span>
          </div>

          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
            PostgreSQL 18 Changed NOT NULL &mdash; Update Your Migration Rules
          </h1>

          <p className="text-xl text-slate-400 mb-12 leading-relaxed">
            PostgreSQL 18 shipped three features that change how you write safe schema migrations:
            native <code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">SET NOT NULL NOT VALID</code>,{' '}
            <code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">NOT ENFORCED</code> constraints, and
            stricter foreign key collation validation. If your migration tooling doesn&apos;t know about
            these, you&apos;re either missing simpler patterns or silently introducing risk.
          </p>

          <div className="prose prose-invert max-w-none">

            {/* --- Section 1: The Old Workaround --- */}
            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">
              The Old NOT NULL Workaround (PG 12&ndash;17)
            </h2>

            <p className="text-slate-300 leading-relaxed mb-4">
              Before PostgreSQL 18, adding a NOT NULL constraint to an existing column was dangerous.
              The naive approach &mdash; <code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">ALTER TABLE ... SET NOT NULL</code> &mdash;
              scans the entire table under an ACCESS EXCLUSIVE lock. On a table with millions of rows,
              this blocks all queries for seconds or minutes.
            </p>

            <p className="text-slate-300 leading-relaxed mb-4">
              The community workaround has been the same since PostgreSQL 12:
            </p>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-6">
              <code className="text-sm text-slate-300 font-mono">{`-- Step 1: Add a CHECK constraint with NOT VALID (instant, no scan)
ALTER TABLE users
  ADD CONSTRAINT users_email_not_null
  CHECK (email IS NOT NULL) NOT VALID;

-- Step 2: Validate the constraint (scans table, but only SHARE lock)
ALTER TABLE users
  VALIDATE CONSTRAINT users_email_not_null;

-- Step 3: Now SET NOT NULL is instant (PG sees the CHECK)
ALTER TABLE users ALTER COLUMN email SET NOT NULL;

-- Step 4: Drop the redundant CHECK
ALTER TABLE users DROP CONSTRAINT users_email_not_null;`}</code>
            </pre>

            <p className="text-slate-300 leading-relaxed mb-6">
              This 4-step dance works, but it&apos;s verbose, easy to get wrong, and requires
              remembering to clean up the temporary CHECK constraint afterward.
              Every migration linter &mdash; Squawk, strong_migrations, MigrationPilot &mdash;
              teaches this pattern.
            </p>

            {/* --- Section 2: PG18 Native NOT NULL NOT VALID --- */}
            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">
              PG18: Native SET NOT NULL NOT VALID
            </h2>

            <p className="text-slate-300 leading-relaxed mb-4">
              PostgreSQL 18 added native support for{' '}
              <code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">SET NOT NULL NOT VALID</code>.
              The 4-step workaround collapses to 2 steps:
            </p>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-6">
              <code className="text-sm text-slate-300 font-mono">{`-- PG18+: Native approach (2 steps instead of 4)

-- Step 1: Mark column NOT NULL without scanning (instant)
ALTER TABLE users ALTER COLUMN email SET NOT NULL NOT VALID;

-- Step 2: Validate (scans table under SHARE lock, not ACCESS EXCLUSIVE)
ALTER TABLE users VALIDATE NOT NULL email;`}</code>
            </pre>

            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4 mb-6">
              <p className="text-emerald-300 text-sm leading-relaxed">
                <strong>Why this matters:</strong> The CHECK constraint workaround is no longer needed
                on PG18+. Using the native syntax is simpler, less error-prone, and achieves the same
                safety guarantees. Fewer steps means fewer places for mistakes.
              </p>
            </div>

            <h3 className="text-xl font-semibold mt-8 mb-3 text-slate-200">What happens under the hood</h3>

            <p className="text-slate-300 leading-relaxed mb-4">
              <code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">SET NOT NULL NOT VALID</code>{' '}
              records the NOT NULL constraint in the system catalog (pg_attribute.attnotnull) but marks
              it as not-yet-validated. PostgreSQL will enforce the constraint for new INSERTs and UPDATEs
              immediately, but does not verify existing rows.
            </p>

            <p className="text-slate-300 leading-relaxed mb-6">
              <code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">VALIDATE NOT NULL</code>{' '}
              then scans existing rows under a SHARE lock (concurrent reads and writes are allowed)
              and, once all rows pass, marks the constraint as fully validated.
            </p>

            <h3 className="text-xl font-semibold mt-8 mb-3 text-slate-200">Migration linter implications</h3>

            <p className="text-slate-300 leading-relaxed mb-4">
              If you&apos;re running PG18+ and your migration linter still suggests the CHECK constraint
              workaround, it&apos;s giving you outdated advice. Worse, if you&apos;re still <em>writing</em>{' '}
              the old pattern, you&apos;re adding unnecessary complexity.
            </p>

            <p className="text-slate-300 leading-relaxed mb-6">
              MigrationPilot v1.5.0 includes rule{' '}
              <a href="/rules/mp081" className="text-blue-400 hover:text-blue-300">MP081</a> that
              detects the old CHECK workaround on PG18+ and suggests the simpler native syntax.
            </p>

            {/* --- Section 3: NOT ENFORCED Constraints --- */}
            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">
              PG18: NOT ENFORCED Constraints
            </h2>

            <p className="text-slate-300 leading-relaxed mb-4">
              PostgreSQL 18 also introduced{' '}
              <code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">NOT ENFORCED</code>{' '}
              constraints, borrowed from the SQL standard. A NOT ENFORCED constraint exists in metadata
              but PostgreSQL does <strong>not</strong> actually enforce it:
            </p>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-6">
              <code className="text-sm text-slate-300 font-mono">{`-- This constraint exists in pg_constraint but does NOT reject invalid data
ALTER TABLE orders
  ADD CONSTRAINT orders_total_positive
  CHECK (total > 0) NOT ENFORCED;

-- This INSERT will succeed even though total is negative!
INSERT INTO orders (total) VALUES (-100);  -- No error`}</code>
            </pre>

            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 mb-6">
              <p className="text-amber-300 text-sm leading-relaxed">
                <strong>Warning:</strong> NOT ENFORCED constraints do NOT protect data integrity.
                They serve as hints to the query planner and as documentation, but invalid data
                <em> can and will</em> be inserted. If you expect the constraint to reject bad data,
                do not use NOT ENFORCED.
              </p>
            </div>

            <h3 className="text-xl font-semibold mt-8 mb-3 text-slate-200">When NOT ENFORCED is useful</h3>

            <ul className="list-disc list-inside text-slate-300 space-y-2 mb-6 ml-4">
              <li>
                <strong className="text-slate-200">Query planner hints:</strong> Foreign key constraints
                with NOT ENFORCED can help the planner generate better join plans without the overhead
                of enforcing referential integrity at write time.
              </li>
              <li>
                <strong className="text-slate-200">Gradual migration:</strong> Add a NOT ENFORCED
                constraint first, fix existing bad data, then ALTER the constraint to be enforced.
              </li>
              <li>
                <strong className="text-slate-200">Documentation:</strong> Record business rules in the
                schema even when enforcement happens at the application layer.
              </li>
            </ul>

            <h3 className="text-xl font-semibold mt-8 mb-3 text-slate-200">The risk</h3>

            <p className="text-slate-300 leading-relaxed mb-6">
              The danger is that a developer sees a CHECK constraint in the schema and assumes the
              database enforces it. NOT ENFORCED silently allows invalid data. Six months later,
              someone queries the table expecting all rows to satisfy the constraint, and gets
              corrupted results.
            </p>

            <p className="text-slate-300 leading-relaxed mb-6">
              MigrationPilot v1.5.0 includes rule{' '}
              <a href="/rules/mp082" className="text-blue-400 hover:text-blue-300">MP082</a> that
              warns whenever it detects NOT ENFORCED in a migration, ensuring teams consciously
              acknowledge the trade-off.
            </p>

            {/* --- Section 4: FK Collation Validation --- */}
            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">
              PG18: Foreign Key Collation Validation
            </h2>

            <p className="text-slate-300 leading-relaxed mb-4">
              PostgreSQL 18 tightened validation of foreign key constraints involving
              non-deterministic collations (ICU collations like{' '}
              <code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">und-x-icu</code>).
              Previously, you could create a FK between columns using ICU collations even though
              equality comparisons with non-deterministic collations can be ambiguous.
            </p>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-6">
              <code className="text-sm text-slate-300 font-mono">{`-- PG18 may reject this if the columns use non-deterministic collation
CREATE TABLE child (
  parent_name TEXT COLLATE "und-x-icu",
  FOREIGN KEY (parent_name) REFERENCES parent(name)
);

-- The problem: with non-deterministic collation, 'cafe' and 'caf\\u00e9'
-- might compare as equal, making FK lookups unreliable`}</code>
            </pre>

            <p className="text-slate-300 leading-relaxed mb-6">
              This is a subtle correctness issue. Most teams won&apos;t hit it unless they&apos;re
              using ICU collations for internationalization. But if you are, a migration that worked
              on PG17 might fail on PG18 &mdash; or worse, succeed but produce incorrect referential
              integrity checks.
            </p>

            <p className="text-slate-300 leading-relaxed mb-6">
              MigrationPilot v1.5.0 includes rule{' '}
              <a href="/rules/mp083" className="text-blue-400 hover:text-blue-300">MP083</a> that
              flags foreign key constraints involving non-deterministic collations on PG18+.
            </p>

            {/* --- Section 5: What to Do --- */}
            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">
              What You Should Do
            </h2>

            <h3 className="text-xl font-semibold mt-8 mb-3 text-slate-200">If you&apos;re upgrading to PG18</h3>

            <ol className="list-decimal list-inside text-slate-300 space-y-3 mb-6 ml-4">
              <li>
                <strong className="text-slate-200">Search your migration files for CHECK ... IS NOT NULL ... NOT VALID.</strong>{' '}
                These are candidates for the simpler PG18 native syntax.
              </li>
              <li>
                <strong className="text-slate-200">Audit any NOT ENFORCED constraints.</strong>{' '}
                Make sure every NOT ENFORCED usage has a comment explaining why enforcement is
                intentionally skipped.
              </li>
              <li>
                <strong className="text-slate-200">Check FK columns for ICU collations.</strong>{' '}
                If you use <code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">und-x-icu</code>{' '}
                or locale-specific ICU collations, verify that your FK references still work correctly.
              </li>
              <li>
                <strong className="text-slate-200">Update your migration linter.</strong>{' '}
                Make sure it&apos;s PG18-aware. Set{' '}
                <code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">--pg-version 18</code>{' '}
                to enable PG18-specific rules.
              </li>
            </ol>

            <h3 className="text-xl font-semibold mt-8 mb-3 text-slate-200">If you&apos;re staying on PG16/17</h3>

            <p className="text-slate-300 leading-relaxed mb-6">
              Nothing changes. The CHECK constraint workaround remains the correct approach for
              PG12&ndash;17. MigrationPilot&apos;s existing rules (MP002, MP018) continue to guide you
              to the right pattern for your PostgreSQL version.
            </p>

            {/* --- Section 6: Linter Comparison --- */}
            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">
              Which Linters Are PG18-Aware?
            </h2>

            <div className="overflow-x-auto mb-8">
              <table className="text-sm border border-slate-800 rounded-lg overflow-hidden">
                <thead>
                  <tr className="bg-slate-800/50">
                    <th className="text-left px-4 py-3 font-medium text-slate-300">Feature</th>
                    <th className="text-center px-4 py-3 font-medium text-slate-300">Squawk</th>
                    <th className="text-center px-4 py-3 font-medium text-slate-300">strong_migrations</th>
                    <th className="text-center px-4 py-3 font-medium text-blue-400">MigrationPilot</th>
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
                    <tr key={row.feature} className="border-t border-slate-800">
                      <td className="py-3 px-4 font-semibold text-slate-300">{row.feature}</td>
                      <td className="py-3 px-4 text-center text-red-400">{row.squawk}</td>
                      <td className="py-3 px-4 text-center text-red-400">{row.strong}</td>
                      <td className="py-3 px-4 text-center text-green-400">{row.mp}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-slate-300 leading-relaxed mb-6">
              As of March 2026, no other PostgreSQL migration linter has PG18-specific rules.
              Squawk&apos;s last PostgreSQL-version-specific update targeted PG12 features.
              strong_migrations provides version-specific advice for Rails but hasn&apos;t added
              PG18 patterns yet.
            </p>

            {/* --- Section 7: Quick Start --- */}
            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">
              Try It Now
            </h2>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-6">
              <code className="text-sm text-slate-300 font-mono">{`# Check a migration against PG18 rules
npx migrationpilot analyze migration.sql --pg-version 18

# Or add to your GitHub Action
- uses: mickelsamuel/migrationpilot@v1
  with:
    migration-path: "migrations/*.sql"
    pg-version: "18"`}</code>
            </pre>

            <p className="text-slate-300 leading-relaxed mb-6">
              MigrationPilot is open-source (MIT), runs 83 safety rules in milliseconds, and requires
              no database connection. The PG18 rules (MP081&ndash;MP083) are included in the free tier.
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-4 mt-8">
              <a
                href="https://github.com/mickelsamuel/migrationpilot"
                className="px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-500 font-medium transition-colors text-center"
              >
                View on GitHub
              </a>
              <a
                href="/docs"
                className="px-6 py-3 rounded-lg border border-slate-700 hover:border-slate-600 font-medium transition-colors text-center"
              >
                Read the Docs
              </a>
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
            <a href="/docs" className="hover:text-slate-300 transition-colors">Docs</a>
            <a href="https://github.com/mickelsamuel/migrationpilot" className="hover:text-slate-300 transition-colors">GitHub</a>
            <a href="https://www.npmjs.com/package/migrationpilot" className="hover:text-slate-300 transition-colors">npm</a>
          </div>
          <p className="text-xs text-slate-600">&copy; 2026 MigrationPilot</p>
        </div>
      </footer>
    </main>
  );
}
