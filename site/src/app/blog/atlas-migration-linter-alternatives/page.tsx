import type { Metadata } from 'next';
import Navbar from '@/components/navbar';
import { Footer } from '@/components/footer';
import { CodeBlock } from '@/components/code-block';

export const metadata: Metadata = {
  title: 'Atlas Paywalled Their Migration Linter — Here Are Your Free Alternatives — MigrationPilot',
  description: 'Atlas removed migrate lint from their free tier in v0.38. Here are the free, open-source PostgreSQL migration linters you can switch to today.',
  keywords: ['atlas alternative', 'atlas migrate lint', 'postgresql migration linter', 'squawk postgresql', 'migration linter free', 'database migration safety'],
  alternates: {
    canonical: '/blog/atlas-migration-linter-alternatives',
  },
  openGraph: {
    title: 'Atlas Paywalled Their Migration Linter — Here Are Your Free Alternatives',
    description: 'Atlas removed migrate lint from their free tier in v0.38. Here are the free, open-source PostgreSQL migration linters you can switch to today.',
    type: 'article',
    url: '/blog/atlas-migration-linter-alternatives',
  },
};

export default function AtlasMigrationLinterAlternatives() {
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
              <time dateTime="2026-02-28">February 28, 2026</time>
              <span className="w-1 h-1 rounded-full bg-line" />
              <span>8 min read</span>
            </div>

            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
              Atlas Paywalled Their Migration Linter &mdash; Here Are Your Free Alternatives
            </h1>

            <p className="text-xl text-muted mb-12 leading-relaxed">
              In October 2025, Atlas moved <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">atlas migrate lint</code> out
              of their free Starter plan. If you relied on Atlas for catching dangerous PostgreSQL migrations in CI,
              you now need a paid plan or a new tool. This guide covers what changed, what&apos;s still available for free,
              and the open-source alternatives you can adopt today.
            </p>

            <div className="prose prose-invert max-w-none">

              <h2 className="text-2xl font-bold mt-12 mb-4 text-fg">What Changed in Atlas v0.38</h2>

              <p className="text-muted leading-relaxed mb-4">
                Atlas v0.38, released October 30, 2025, restructured its pricing tiers. The key change:
                the <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">atlas migrate lint</code> command
                is no longer available in the free Starter plan. Linting moved to Pro, at
                <strong className="text-fg"> $9/developer/month</strong>, with Pipelines billed separately at
                <strong className="text-fg"> $59/month per project</strong>.
              </p>

              <p className="text-muted leading-relaxed mb-4">
                There is still a Community Edition build (Apache 2.0) that ships <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">migrate lint</code> with
                a basic analyzer set &mdash; destructive changes, data-dependent changes, backward-incompatible
                changes, naming conventions. But every PostgreSQL lock-safety analyzer &mdash; the concurrent-index
                policy (PG101&ndash;PG103) and the blocking table changes family (PG301&ndash;PG311) &mdash; is
                Pro-only. The generic checks are free; the Postgres safety analysis is not.
              </p>

              <p className="text-muted leading-relaxed mb-4">
                For a team of 5 engineers with 2 pipelines, that&apos;s $163/month for migration linting alone.
                Not unreasonable for a well-funded team, but a significant cost for startups, open-source projects,
                and smaller teams that were getting this for free.
              </p>

              <h3 className="text-xl font-semibold mt-8 mb-3 text-fg">What Atlas lint actually checked</h3>

              <p className="text-muted leading-relaxed mb-4">
                Atlas&apos;s PostgreSQL-specific analyzers were genuinely useful. Their Pro-only rules include:
              </p>

              <ul className="list-disc list-inside text-muted space-y-2 mb-6 ml-4">
                <li><strong className="text-fg">PG101</strong>: Creating an index non-concurrently</li>
                <li><strong className="text-fg">PG301</strong>: Column type change rewrites the table</li>
                <li><strong className="text-fg">PG302</strong>: Adding a column with a volatile default</li>
                <li><strong className="text-fg">PG303</strong>: Making a nullable column NOT NULL</li>
                <li><strong className="text-fg">PG305</strong>: CHECK constraint without NOT VALID</li>
                <li><strong className="text-fg">PG306</strong>: Foreign key without NOT VALID</li>
                <li><strong className="text-fg">PG309</strong>: STORED generated column rewrites the table</li>
              </ul>

              <p className="text-muted leading-relaxed mb-6">
                These are real production safety checks. If your team was relying on Atlas to catch these in CI,
                the paywall means you either pay up or lose that safety net.
              </p>

              <h3 className="text-xl font-semibold mt-8 mb-3 text-fg">The Community Edition and Hacker License</h3>

              <p className="text-muted leading-relaxed mb-4">
                Atlas still offers two free options, but with limitations:
              </p>

              <p className="text-muted leading-relaxed mb-4">
                <strong className="text-fg">Community Edition</strong> (Apache 2.0): An open-source build of Atlas
                with the migration engine and <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">migrate lint</code> limited
                to a basic analyzer set (destructive changes, backward-incompatible changes, naming conventions).
                The PostgreSQL-specific analyzers &mdash; PG101&ndash;PG105 and PG301&ndash;PG311 &mdash; are Pro-only.
                The migration engine is free; the Postgres safety analysis is not.
              </p>

              <p className="text-muted leading-relaxed mb-6">
                <strong className="text-fg">Hacker License</strong>: Free for students, open-source contributors,
                and hobby projects. This is generous, but it explicitly excludes commercial use. If your company
                is running PostgreSQL in production, you cannot use the Hacker License for your CI pipeline.
              </p>

              <h2 className="text-2xl font-bold mt-12 mb-4 text-fg">The Broader Trend: Paywalls Everywhere</h2>

              <p className="text-muted leading-relaxed mb-4">
                Atlas is not alone in restricting free tiers. Within a 6-month window in 2025:
              </p>

              <ul className="list-disc list-inside text-muted space-y-2 mb-6 ml-4">
                <li>
                  <strong className="text-fg">Liquibase</strong> changed to a Functional Source License (FSL) in October 2025.
                  FSL is not OSI-approved open source. Apache Fineract has already downgraded their Liquibase dependency,
                  and CNCF projects cannot use FSL-licensed software.
                </li>
                <li>
                  <strong className="text-fg">Flyway</strong> discontinued their Teams tier in May 2025, leaving only
                  Community (limited) and Enterprise (expensive, quote-based).
                </li>
                <li>
                  <strong className="text-fg">Atlas</strong> moved lint to Pro in October 2025.
                </li>
              </ul>

              <p className="text-muted leading-relaxed mb-6">
                Three major migration tools restricting access within six months is not a coincidence &mdash; it&apos;s
                a market consolidation pattern. If you want migration safety tooling that will remain free and open source,
                the options are now more limited than they were a year ago.
              </p>

              <h2 className="text-2xl font-bold mt-12 mb-4 text-fg">Free, Open-Source Alternatives</h2>

              <p className="text-muted leading-relaxed mb-6">
                If you need a free PostgreSQL migration linter in CI, here are your options, assessed honestly:
              </p>

              <h3 className="text-xl font-semibold mt-8 mb-3 text-fg">1. Squawk</h3>

              <p className="text-muted leading-relaxed mb-4">
                Squawk is the most established free migration linter. Written in Rust, it&apos;s fast and focused.
              </p>

              <div className="bg-surface border border-line rounded-lg p-6 mb-6">
                <ul className="text-muted space-y-2">
                  <li><strong className="text-fg">Rules:</strong> 40 (v2.62.0, Aug 2026)</li>
                  <li><strong className="text-fg">Language:</strong> Rust (CLI binary + npm wrapper)</li>
                  <li><strong className="text-fg">GitHub:</strong> ~1,150 stars</li>
                  <li><strong className="text-fg">Downloads:</strong> ~1.4M/month on npm</li>
                  <li><strong className="text-fg">License:</strong> Apache-2.0 / MIT</li>
                  <li><strong className="text-fg">GitHub Action:</strong> Yes (free)</li>
                </ul>
              </div>

              <p className="text-muted leading-relaxed mb-4">
                <strong className="text-ok">Strengths:</strong> Fast execution (Rust native), well-tested rules for
                common PostgreSQL lock hazards, active development. The core rules cover CREATE INDEX without CONCURRENTLY,
                adding columns with volatile defaults, and other common issues.
              </p>

              <p className="text-muted leading-relaxed mb-6">
                <strong className="text-warn">Limitations:</strong> No lock type classification (doesn&apos;t tell you
                <em>which</em> lock a statement acquires). No production context awareness &mdash; it can&apos;t factor in
                table sizes or active queries. No auto-fix suggestions. Exit code 1 for both errors and warnings
                (no distinction). Cannot analyze PL/pgSQL function bodies or DO blocks.
              </p>

              <CodeBlock code={`# Install and run Squawk
npm install -g squawk-cli

# Analyze a migration file
squawk migrations/V1__add_users_email.sql

# In CI (GitHub Action)
# Uses: sbdchd/squawk-action@v1`} />

              <h3 className="text-xl font-semibold mt-8 mb-3 text-fg">2. strong_migrations (Rails only)</h3>

              <p className="text-muted leading-relaxed mb-4">
                If your team uses Ruby on Rails, strong_migrations is the gold standard. It integrates directly
                with ActiveRecord and catches dangerous migrations at the ORM level.
              </p>

              <div className="bg-surface border border-line rounded-lg p-6 mb-6">
                <ul className="text-muted space-y-2">
                  <li><strong className="text-fg">GitHub:</strong> ~4,400 stars</li>
                  <li><strong className="text-fg">Language:</strong> Ruby (Rails gem)</li>
                  <li><strong className="text-fg">License:</strong> MIT</li>
                  <li><strong className="text-fg">Used by:</strong> Instacart, many Rails shops</li>
                </ul>
              </div>

              <p className="text-muted leading-relaxed mb-4">
                <strong className="text-ok">Strengths:</strong> Excellent developer experience &mdash; when a migration
                is dangerous, it shows you the exact safe alternative with a clear explanation of why. This &quot;explain
                the risk, show the fix&quot; UX is what every migration linter should aspire to.
              </p>

              <p className="text-muted leading-relaxed mb-6">
                <strong className="text-warn">Limitations:</strong> Rails and ActiveRecord only. If your team
                uses Go, Python, Node.js, or plain SQL files, strong_migrations is not an option. This is the
                most common complaint in migration safety discussions:
              </p>

              <blockquote className="border-l-4 border-line pl-4 text-muted italic mb-6">
                &quot;My conundrum is we don&apos;t use Django lol. Wish this sort of thoroughness existed in standalone
                pg migration tooling.&quot; &mdash; Hacker News commenter
              </blockquote>

              <h3 className="text-xl font-semibold mt-8 mb-3 text-fg">3. Eugene</h3>

              <p className="text-muted leading-relaxed mb-4">
                Eugene is a newer tool that takes a unique approach: both static lint and dynamic lock tracing.
                It can run your migration against a temporary PostgreSQL server and observe which locks are actually acquired.
              </p>

              <div className="bg-surface border border-line rounded-lg p-6 mb-6">
                <ul className="text-muted space-y-2">
                  <li><strong className="text-fg">GitHub:</strong> ~52 stars</li>
                  <li><strong className="text-fg">Language:</strong> Rust</li>
                  <li><strong className="text-fg">Approach:</strong> Static lint + dynamic lock tracing</li>
                  <li><strong className="text-fg">Status:</strong> Active but early-stage</li>
                </ul>
              </div>

              <p className="text-muted leading-relaxed mb-4">
                <strong className="text-ok">Strengths:</strong> The dynamic tracing approach can catch issues that
                static analysis misses. Supabase&apos;s postgres-language-server team has acknowledged that
                Eugene is &quot;more advanced&quot; than their Squawk-based port for lock analysis.
              </p>

              <p className="text-muted leading-relaxed mb-6">
                <strong className="text-warn">Limitations:</strong> Very early-stage (52 stars). Requires a running
                PostgreSQL instance for dynamic tracing. No GitHub Action in the marketplace. Smaller community and
                less documentation.
              </p>

              <h3 className="text-xl font-semibold mt-8 mb-3 text-fg">4. MigrationPilot</h3>

              <p className="text-muted leading-relaxed mb-4">
                MigrationPilot is a newer entry with the deepest free rule set. Disclaimer: this article is published
                on the MigrationPilot blog, so take this section with appropriate skepticism and verify the claims
                against the open-source repository.
              </p>

              <div className="bg-surface border border-line rounded-lg p-6 mb-6">
                <ul className="text-muted space-y-2">
                  <li><strong className="text-fg">Rules:</strong> 112 (all free)</li>
                  <li><strong className="text-fg">Language:</strong> TypeScript</li>
                  <li><strong className="text-fg">License:</strong> MIT</li>
                  <li><strong className="text-fg">GitHub Action:</strong> Yes (free)</li>
                  <li><strong className="text-fg">Auto-fix:</strong> 20 rules</li>
                </ul>
              </div>

              <p className="text-muted leading-relaxed mb-4">
                <strong className="text-ok">Strengths:</strong> Lock type classification (tells you which lock each
                statement acquires). Risk scoring (RED/YELLOW/GREEN). Auto-fix suggestions for 20 rules.
                Works with any framework &mdash; analyzes plain SQL. Free GitHub Action. VS Code extension.
                Every rule includes an explanation of why the operation is dangerous and the safe alternative.
              </p>

              <p className="text-muted leading-relaxed mb-6">
                <strong className="text-warn">Limitations:</strong> New project with a small community. Fewer
                real-world battle-testing hours than Squawk. TypeScript, not Rust &mdash; slower on very large
                migration files (though still sub-second for typical migrations). 15 of the rules
                (including MP013, MP014, MP019) do nothing without a live database connection to read stats from.
              </p>

              <CodeBlock code={`# Install and run MigrationPilot
npx migrationpilot analyze migrations/*.sql

# Auto-fix common issues
npx migrationpilot analyze migrations/*.sql --fix

# In CI (GitHub Action)
# Uses: mickelsamuel/migrationpilot@v1`} />

              <h2 className="text-2xl font-bold mt-12 mb-4 text-fg">Comparison Table</h2>

              <div className="overflow-x-auto mb-8">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-line">
                      <th className="text-left py-3 px-4 text-muted font-semibold">Feature</th>
                      <th className="text-left py-3 px-4 text-muted font-semibold">Atlas (free)</th>
                      <th className="text-left py-3 px-4 text-muted font-semibold">Squawk</th>
                      <th className="text-left py-3 px-4 text-muted font-semibold">MigrationPilot</th>
                    </tr>
                  </thead>
                  <tbody className="text-muted">
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4 font-semibold text-faint">Free CI linting</td>
                      <td className="py-3 px-4 text-danger">No (since v0.38)</td>
                      <td className="py-3 px-4 text-ok">Yes</td>
                      <td className="py-3 px-4 text-ok">Yes</td>
                    </tr>
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4 font-semibold text-faint">PostgreSQL rules</td>
                      <td className="py-3 px-4">Basic only (PG-specific paywalled)</td>
                      <td className="py-3 px-4">40</td>
                      <td className="py-3 px-4">112, all free</td>
                    </tr>
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4 font-semibold text-faint">Lock classification</td>
                      <td className="py-3 px-4 text-warn">Partial</td>
                      <td className="py-3 px-4 text-danger">No</td>
                      <td className="py-3 px-4 text-ok">Yes</td>
                    </tr>
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4 font-semibold text-faint">Auto-fix</td>
                      <td className="py-3 px-4 text-danger">No</td>
                      <td className="py-3 px-4 text-danger">No</td>
                      <td className="py-3 px-4 text-ok">20 rules</td>
                    </tr>
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4 font-semibold text-faint">Risk scoring</td>
                      <td className="py-3 px-4 text-danger">No</td>
                      <td className="py-3 px-4 text-danger">No</td>
                      <td className="py-3 px-4 text-ok">Yes</td>
                    </tr>
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4 font-semibold text-faint">GitHub Action</td>
                      <td className="py-3 px-4 text-danger">Paid only</td>
                      <td className="py-3 px-4 text-ok">Free</td>
                      <td className="py-3 px-4 text-ok">Free</td>
                    </tr>
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4 font-semibold text-faint">VS Code extension</td>
                      <td className="py-3 px-4 text-ok">Yes</td>
                      <td className="py-3 px-4 text-ok">Yes</td>
                      <td className="py-3 px-4 text-ok">Yes</td>
                    </tr>
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4 font-semibold text-faint">Multi-database</td>
                      <td className="py-3 px-4 text-ok">Yes (15+)</td>
                      <td className="py-3 px-4 text-danger">PostgreSQL only</td>
                      <td className="py-3 px-4 text-danger">PostgreSQL only</td>
                    </tr>
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4 font-semibold text-faint">Community size</td>
                      <td className="py-3 px-4 text-ok">~8,100 stars</td>
                      <td className="py-3 px-4 text-ok">~1,000 stars</td>
                      <td className="py-3 px-4 text-warn">New</td>
                    </tr>
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4 font-semibold text-faint">License</td>
                      <td className="py-3 px-4">Apache 2.0 (CE)</td>
                      <td className="py-3 px-4">Apache 2.0</td>
                      <td className="py-3 px-4">MIT</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <h2 className="text-2xl font-bold mt-12 mb-4 text-fg">Migration Guide: Switching from Atlas Lint</h2>

              <p className="text-muted leading-relaxed mb-4">
                If you were using <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">atlas migrate lint</code> in
                your CI pipeline, here is how to switch to a free alternative. The examples below use MigrationPilot,
                but the same concept applies to Squawk.
              </p>

              <h3 className="text-xl font-semibold mt-8 mb-3 text-fg">GitHub Actions</h3>

              <p className="text-muted leading-relaxed mb-4">
                Replace your Atlas lint workflow step:
              </p>

              <CodeBlock code={`# Before: Atlas (now requires paid Pro plan)
- uses: ariga/atlas-action/migrate/lint@v1
  with:
    dir: file://migrations
    dev-url: "sqlite://dev?mode=memory"

# After: MigrationPilot (free)
- uses: mickelsamuel/migrationpilot@v1
  with:
    paths: migrations/*.sql
    fail-on: critical`} />

              <h3 className="text-xl font-semibold mt-8 mb-3 text-fg">Local development</h3>

              <CodeBlock code={`# Before: Atlas
atlas migrate lint --dir file://migrations --dev-url "postgres://..."

# After: MigrationPilot
npx migrationpilot analyze migrations/*.sql

# Or install globally
npm install -g migrationpilot
migrationpilot analyze migrations/*.sql`} />

              <h3 className="text-xl font-semibold mt-8 mb-3 text-fg">Rule mapping: Atlas to MigrationPilot</h3>

              <p className="text-muted leading-relaxed mb-4">
                Here is how Atlas&apos;s PostgreSQL-specific rules map to MigrationPilot rules:
              </p>

              <div className="overflow-x-auto mb-8">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-line">
                      <th className="text-left py-3 px-4 text-muted font-semibold">Atlas Rule</th>
                      <th className="text-left py-3 px-4 text-muted font-semibold">What It Checks</th>
                      <th className="text-left py-3 px-4 text-muted font-semibold">MigrationPilot Equivalent</th>
                    </tr>
                  </thead>
                  <tbody className="text-muted">
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4 font-mono text-sm">PG301</td>
                      <td className="py-3 px-4">Non-nullable column without default</td>
                      <td className="py-3 px-4 font-mono text-sm">MP002</td>
                    </tr>
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4 font-mono text-sm">PG302</td>
                      <td className="py-3 px-4">Volatile default (table rewrite)</td>
                      <td className="py-3 px-4 font-mono text-sm">MP003</td>
                    </tr>
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4 font-mono text-sm">PG303</td>
                      <td className="py-3 px-4">Column type change (table rewrite)</td>
                      <td className="py-3 px-4 font-mono text-sm">MP007</td>
                    </tr>
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4 font-mono text-sm">PG304</td>
                      <td className="py-3 px-4">Adding primary key to existing table</td>
                      <td className="py-3 px-4 font-mono text-sm">MP027</td>
                    </tr>
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4 font-mono text-sm">PG305</td>
                      <td className="py-3 px-4">Adding unique constraint</td>
                      <td className="py-3 px-4 font-mono text-sm">MP027</td>
                    </tr>
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4 font-mono text-sm">PG307</td>
                      <td className="py-3 px-4">Non-concurrent index creation</td>
                      <td className="py-3 px-4 font-mono text-sm">MP001</td>
                    </tr>
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4 font-mono text-sm">PG311</td>
                      <td className="py-3 px-4">Exclusion constraint (table rewrite)</td>
                      <td className="py-3 px-4 font-mono text-sm">MP027</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <p className="text-muted leading-relaxed mb-6">
                Atlas documents 17 PostgreSQL checks. MigrationPilot has an equivalent for 13 of them,
                and 99 of its rules have nothing on the Atlas side to compare against &mdash; foreign key
                lock analysis, lock_timeout enforcement, VACUUM FULL detection, enum type safety and
                trigger cascade analysis among them. The four it does not match are Atlas&apos;s primary-key
                locking checks (PG104, PG304), identity-column rewrites (PG310), and access method
                changes (PG311).
              </p>

              <h2 className="text-2xl font-bold mt-12 mb-4 text-fg">When You Should Still Use Atlas</h2>

              <p className="text-muted leading-relaxed mb-4">
                This is not an anti-Atlas article. Atlas is a good product with capabilities that go
                beyond linting:
              </p>

              <ul className="list-disc list-inside text-muted space-y-2 mb-6 ml-4">
                <li><strong className="text-fg">Multi-database support</strong>: If you run MySQL, MariaDB, SQLite, and PostgreSQL, Atlas handles all of them. Squawk and MigrationPilot are PostgreSQL-only.</li>
                <li><strong className="text-fg">Schema-as-code</strong>: Atlas&apos;s declarative HCL schema and drift detection are features that linters don&apos;t provide.</li>
                <li><strong className="text-fg">Managed migration planning</strong>: Atlas can generate migration files from schema diffs, which is a migration runner feature, not a linter feature.</li>
                <li><strong className="text-fg">Enterprise features</strong>: Audit trails, access control, and deployment orchestration for larger teams.</li>
              </ul>

              <p className="text-muted leading-relaxed mb-6">
                If your team needs a full migration management platform and can justify the cost, Atlas Pro
                is still a strong choice. The alternatives listed here are specifically for teams that need
                free, open-source migration <em>linting</em> in CI.
              </p>

              <h2 className="text-2xl font-bold mt-12 mb-4 text-fg">The Bigger Question: Why Lint Migrations at All?</h2>

              <p className="text-muted leading-relaxed mb-4">
                If you are considering dropping migration linting from your CI pipeline rather than switching
                tools, consider the cost of not linting:
              </p>

              <ul className="list-disc list-inside text-muted space-y-2 mb-6 ml-4">
                <li>
                  <strong className="text-fg">GoCardless</strong> had a 15-second API outage from a foreign key
                  constraint that locked two tables simultaneously.
                </li>
                <li>
                  <strong className="text-fg">Resend</strong> suffered a 12-hour outage from a production DROP operation.
                </li>
                <li>
                  Every <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">CREATE INDEX</code> without
                  CONCURRENTLY on a table with more than a few thousand rows blocks all writes until the index build completes.
                </li>
                <li>
                  Every <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">ALTER TABLE ... SET NOT NULL</code> without
                  the CHECK constraint pattern scans the entire table under an ACCESS EXCLUSIVE lock.
                </li>
              </ul>

              <p className="text-muted leading-relaxed mb-6">
                These are not theoretical risks. They are recurring patterns that cause production incidents at
                companies of every size. A migration linter in CI is the cheapest insurance against these issues &mdash;
                it catches the mistake before it reaches production, not after.
              </p>

              <h2 className="text-2xl font-bold mt-12 mb-4 text-fg">Summary</h2>

              <div className="bg-surface border border-line rounded-lg p-6 mb-8">
                <ul className="list-disc list-inside text-muted space-y-3">
                  <li><strong className="text-fg">Atlas&apos;s Postgres lint is no longer free.</strong> <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">migrate lint</code> moved behind a Pro login in v0.38 (October 2025); the Community Edition keeps a basic analyzer set, but every PostgreSQL lock-safety analyzer (PG101&ndash;PG103, PG301&ndash;PG311) is Pro-only.</li>
                  <li><strong className="text-fg">Squawk</strong> is the most established free alternative with 40 rules and roughly 1.4M npm downloads/month.</li>
                  <li><strong className="text-fg">strong_migrations</strong> is excellent if you use Rails.</li>
                  <li><strong className="text-fg">Eugene</strong> has a unique dynamic tracing approach but is early-stage.</li>
                  <li><strong className="text-fg">MigrationPilot</strong> has the most rules (112, all free) with lock classification and auto-fix, but is newer and less battle-tested.</li>
                  <li>All four free tools have GitHub Actions or CI integrations.</li>
                  <li>Pick the one that fits your stack. If you use Rails, use strong_migrations. If you want the established option, use Squawk. If you want the most coverage, try MigrationPilot.</li>
                </ul>
              </div>
            </div>
          </div>
        </article>
      </main>
      <Footer />
    </>
  );
}
