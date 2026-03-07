import type { Metadata } from 'next';
import Navbar from '@/components/navbar';

export const metadata: Metadata = {
  title: 'Squawk vs MigrationPilot: PostgreSQL Migration Linters Compared — MigrationPilot',
  description: 'An honest comparison of Squawk and MigrationPilot for PostgreSQL migration linting: rules, lock analysis, auto-fix, CI integration, and when to use each tool.',
  keywords: ['squawk vs migrationpilot', 'squawk postgresql', 'postgresql migration linter comparison', 'squawk alternative', 'database migration linter'],
  alternates: {
    canonical: '/blog/squawk-vs-migrationpilot',
  },
  openGraph: {
    title: 'Squawk vs MigrationPilot: PostgreSQL Migration Linters Compared',
    description: 'An honest comparison of Squawk and MigrationPilot for PostgreSQL migration linting: rules, lock analysis, auto-fix, CI integration, and when to use each tool.',
    type: 'article',
    url: '/blog/squawk-vs-migrationpilot',
  },
};

export default function SquawkVsMigrationPilot() {
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
            <span>11 min read</span>
          </div>

          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
            Squawk vs MigrationPilot: PostgreSQL Migration Linters Compared
          </h1>

          <p className="text-xl text-slate-400 mb-12 leading-relaxed">
            Squawk and MigrationPilot are both open-source PostgreSQL migration linters. Both
            analyze SQL files for dangerous operations and both integrate with CI. But they differ
            significantly in approach, rule depth, and what information they give you. This comparison
            is published on the MigrationPilot blog &mdash; take that into account and verify claims
            against the source code of both tools.
          </p>

          <div className="prose prose-invert max-w-none">

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">Quick Comparison</h2>

            <div className="overflow-x-auto mb-8">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left py-3 px-4 text-slate-300 font-semibold">Feature</th>
                    <th className="text-left py-3 px-4 text-slate-300 font-semibold">Squawk</th>
                    <th className="text-left py-3 px-4 text-slate-300 font-semibold">MigrationPilot</th>
                  </tr>
                </thead>
                <tbody className="text-slate-400">
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4 font-semibold text-slate-300">Language</td>
                    <td className="py-3 px-4">Rust</td>
                    <td className="py-3 px-4">TypeScript</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4 font-semibold text-slate-300">Safety rules</td>
                    <td className="py-3 px-4">32</td>
                    <td className="py-3 px-4">83 (80 free, 3 paid)</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4 font-semibold text-slate-300">Lock type classification</td>
                    <td className="py-3 px-4 text-red-400">No</td>
                    <td className="py-3 px-4 text-green-400">Yes</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4 font-semibold text-slate-300">Risk scoring</td>
                    <td className="py-3 px-4 text-red-400">No</td>
                    <td className="py-3 px-4 text-green-400">RED/YELLOW/GREEN</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4 font-semibold text-slate-300">Auto-fix</td>
                    <td className="py-3 px-4 text-red-400">No</td>
                    <td className="py-3 px-4 text-green-400">12 rules</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4 font-semibold text-slate-300">GitHub Action</td>
                    <td className="py-3 px-4 text-green-400">Yes</td>
                    <td className="py-3 px-4 text-green-400">Yes (with PR comments)</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4 font-semibold text-slate-300">VS Code extension</td>
                    <td className="py-3 px-4 text-green-400">Yes</td>
                    <td className="py-3 px-4 text-green-400">Yes</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4 font-semibold text-slate-300">Config file</td>
                    <td className="py-3 px-4 text-green-400">.squawk.toml</td>
                    <td className="py-3 px-4 text-green-400">.migrationpilotrc.yml</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4 font-semibold text-slate-300">Output formats</td>
                    <td className="py-3 px-4">Text, TSV, JSON</td>
                    <td className="py-3 px-4">CLI, JSON, SARIF, Markdown</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4 font-semibold text-slate-300">Production context</td>
                    <td className="py-3 px-4 text-red-400">No</td>
                    <td className="py-3 px-4 text-green-400">Yes (paid, 3 rules)</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4 font-semibold text-slate-300">Community</td>
                    <td className="py-3 px-4 text-green-400">~1,000 stars, 600K downloads/mo</td>
                    <td className="py-3 px-4 text-yellow-400">New project</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4 font-semibold text-slate-300">License</td>
                    <td className="py-3 px-4">Apache 2.0</td>
                    <td className="py-3 px-4">MIT</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4 font-semibold text-slate-300">Price</td>
                    <td className="py-3 px-4 text-green-400">Free (100%)</td>
                    <td className="py-3 px-4 text-green-400">Free (97% of rules), $19/mo for production context</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">Where Squawk Is Better</h2>

            <p className="text-slate-300 leading-relaxed mb-4">
              Let&apos;s start with where Squawk wins. Being honest about this matters more than marketing.
            </p>

            <h3 className="text-xl font-semibold mt-8 mb-3 text-slate-200">1. Speed</h3>

            <p className="text-slate-300 leading-relaxed mb-4">
              Squawk is written in Rust and is fast. For typical migration files (1-50 statements),
              both tools complete in under a second, so this doesn&apos;t matter in practice. But if you
              have very large migration files (thousands of statements), Squawk&apos;s Rust parser will
              be noticeably faster than MigrationPilot&apos;s TypeScript + WASM parser.
            </p>

            <h3 className="text-xl font-semibold mt-8 mb-3 text-slate-200">2. Maturity and community</h3>

            <p className="text-slate-300 leading-relaxed mb-4">
              Squawk has ~1,000 GitHub stars and ~600,000 downloads per month. It has been used in
              production by many teams for years. MigrationPilot is a new project with a small community.
              If you value battle-tested stability and want a tool that has already encountered and handled
              edge cases in the wild, Squawk has a significant advantage.
            </p>

            <h3 className="text-xl font-semibold mt-8 mb-3 text-slate-200">3. 100% free</h3>

            <p className="text-slate-300 leading-relaxed mb-6">
              Squawk is completely free with no paid tier. Every feature is available to everyone.
              MigrationPilot has 3 rules (out of 80) that require a $19/month subscription. While
              97% of MigrationPilot&apos;s rules are free, Squawk&apos;s fully-free model is simpler and
              carries no risk of future paywall expansion.
            </p>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">Where MigrationPilot Is Better</h2>

            <h3 className="text-xl font-semibold mt-8 mb-3 text-slate-200">1. Rule depth (83 vs 32)</h3>

            <p className="text-slate-300 leading-relaxed mb-4">
              MigrationPilot has 83 safety rules compared to Squawk&apos;s 32. The additional 51 rules cover:
            </p>

            <ul className="list-disc list-inside text-slate-300 space-y-2 mb-6 ml-4">
              <li>Data safety: TRUNCATE TABLE, DROP CASCADE, unvalidated enum changes</li>
              <li>Best practices: VARCHAR vs TEXT, TIMESTAMP vs TIMESTAMPTZ, missing IF NOT EXISTS</li>
              <li>Lock safety: VACUUM FULL, LOCK TABLE, DISABLE TRIGGER, CLUSTER</li>
              <li>Partition safety: partition key in PK, detach partition concurrently</li>
              <li>Extension safety: PostGIS spatial indexes, pgvector HNSW vs IVFFlat</li>
              <li>Transaction safety: uncommitted transactions, concurrent ops in transactions</li>
            </ul>

            <p className="text-slate-300 leading-relaxed mb-6">
              The core rules overlap substantially &mdash; both tools catch CREATE INDEX without CONCURRENTLY,
              volatile defaults, and column type changes. The difference is in the long tail: patterns that are
              less common but equally dangerous when they occur.
            </p>

            <h3 className="text-xl font-semibold mt-8 mb-3 text-slate-200">2. Lock type classification</h3>

            <p className="text-slate-300 leading-relaxed mb-4">
              When MigrationPilot flags a dangerous statement, it tells you <em>which lock</em> the statement
              acquires. This is important because different locks have different impacts:
            </p>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-4">
              <code className="text-sm text-slate-300 font-mono">{`# MigrationPilot output
  MP001 [critical] CREATE INDEX without CONCURRENTLY
    Acquires: SHARE lock (blocks writes, allows reads)
    Table: orders
    Safe alternative:
      CREATE INDEX CONCURRENTLY idx_orders_customer ON orders (customer_id);

# Squawk output
migrations/001.sql:1:1: warning: prefer-create-index-concurrently
  Instead of \`CREATE INDEX\`, use \`CREATE INDEX CONCURRENTLY\`.`}</code>
            </pre>

            <p className="text-slate-300 leading-relaxed mb-6">
              Squawk tells you the operation is dangerous and suggests the fix. MigrationPilot also tells
              you the specific lock type (SHARE, ACCESS EXCLUSIVE, SHARE UPDATE EXCLUSIVE, etc.), which
              helps you understand the actual impact on running queries. A SHARE lock blocks writes but
              allows reads; an ACCESS EXCLUSIVE lock blocks everything.
            </p>

            <h3 className="text-xl font-semibold mt-8 mb-3 text-slate-200">3. Auto-fix</h3>

            <p className="text-slate-300 leading-relaxed mb-4">
              MigrationPilot can automatically fix 12 rule violations:
            </p>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-4">
              <code className="text-sm text-slate-300 font-mono">{`# Preview what would change
npx migrationpilot analyze migration.sql --fix --dry-run

# Apply fixes directly
npx migrationpilot analyze migration.sql --fix

# Example: MP001 auto-fix
# Before: CREATE INDEX idx_orders_customer ON orders (customer_id);
# After:  CREATE INDEX CONCURRENTLY idx_orders_customer ON orders (customer_id);`}</code>
            </pre>

            <p className="text-slate-300 leading-relaxed mb-6">
              Squawk does not have auto-fix. It reports the violation and links to documentation,
              but you make the change manually. For the 12 rules MigrationPilot can auto-fix, the fix
              is a deterministic text transformation &mdash; not a heuristic guess.
            </p>

            <h3 className="text-xl font-semibold mt-8 mb-3 text-slate-200">4. Risk scoring and prioritization</h3>

            <p className="text-slate-300 leading-relaxed mb-4">
              MigrationPilot assigns a risk score to each migration: RED (critical &mdash; likely to cause
              outage), YELLOW (warning &mdash; may cause issues), GREEN (safe). This helps teams with many
              migration files prioritize which ones to fix first.
            </p>

            <p className="text-slate-300 leading-relaxed mb-6">
              Squawk reports violations with severity levels but does not provide an aggregate risk score
              for the migration as a whole.
            </p>

            <h3 className="text-xl font-semibold mt-8 mb-3 text-slate-200">5. Multiple output formats</h3>

            <p className="text-slate-300 leading-relaxed mb-4">
              MigrationPilot outputs in four formats:
            </p>

            <ul className="list-disc list-inside text-slate-300 space-y-2 mb-6 ml-4">
              <li><strong className="text-slate-200">CLI</strong>: Colored terminal output with lock types, timing, and risk scores</li>
              <li><strong className="text-slate-200">JSON</strong>: Structured, versioned schema for programmatic consumption</li>
              <li><strong className="text-slate-200">SARIF</strong>: For GitHub Code Scanning and IDE integration</li>
              <li><strong className="text-slate-200">Markdown</strong>: For documentation, wikis, or PR comments</li>
            </ul>

            <p className="text-slate-300 leading-relaxed mb-6">
              SARIF output is particularly useful &mdash; it integrates with GitHub&apos;s Code Scanning to show
              violations directly in the &quot;Files changed&quot; tab of pull requests. Squawk outputs in text, TSV,
              and JSON formats.
            </p>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">Rule Overlap</h2>

            <p className="text-slate-300 leading-relaxed mb-4">
              Most of Squawk&apos;s 32 rules have equivalents in MigrationPilot. Here are the key mappings:
            </p>

            <div className="overflow-x-auto mb-8">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left py-3 px-4 text-slate-300 font-semibold">Check</th>
                    <th className="text-left py-3 px-4 text-slate-300 font-semibold">Squawk</th>
                    <th className="text-left py-3 px-4 text-slate-300 font-semibold">MigrationPilot</th>
                  </tr>
                </thead>
                <tbody className="text-slate-400">
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4">CREATE INDEX without CONCURRENTLY</td>
                    <td className="py-3 px-4 font-mono text-sm">prefer-create-index-concurrently</td>
                    <td className="py-3 px-4 font-mono text-sm">MP001</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4">NOT NULL without default</td>
                    <td className="py-3 px-4 font-mono text-sm">adding-not-nullable-field</td>
                    <td className="py-3 px-4 font-mono text-sm">MP002</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4">Volatile default value</td>
                    <td className="py-3 px-4 font-mono text-sm">adding-field-with-default</td>
                    <td className="py-3 px-4 font-mono text-sm">MP003</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4">Column type change</td>
                    <td className="py-3 px-4 font-mono text-sm">changing-column-type</td>
                    <td className="py-3 px-4 font-mono text-sm">MP007</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4">SET NOT NULL</td>
                    <td className="py-3 px-4 font-mono text-sm">adding-required-field</td>
                    <td className="py-3 px-4 font-mono text-sm">MP018</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4">FK without NOT VALID</td>
                    <td className="py-3 px-4 font-mono text-sm">adding-foreign-key-constraint</td>
                    <td className="py-3 px-4 font-mono text-sm">MP005</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4">DROP INDEX without CONCURRENTLY</td>
                    <td className="py-3 px-4 font-mono text-sm">prefer-drop-index-concurrently</td>
                    <td className="py-3 px-4 font-mono text-sm">MP009</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-3 px-4">SERIAL vs IDENTITY</td>
                    <td className="py-3 px-4 font-mono text-sm">prefer-identity</td>
                    <td className="py-3 px-4 font-mono text-sm">MP015</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p className="text-slate-300 leading-relaxed mb-6">
              The overlap confirms that both tools catch the most critical migration safety issues.
              The difference is in coverage breadth: MigrationPilot has 48 additional rules for patterns
              that Squawk does not check.
            </p>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">CI Integration</h2>

            <p className="text-slate-300 leading-relaxed mb-4">
              Both tools provide GitHub Actions. Here is how they look in a workflow:
            </p>

            <h3 className="text-xl font-semibold mt-8 mb-3 text-slate-200">Squawk GitHub Action</h3>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-6">
              <code className="text-sm text-slate-300 font-mono">{`- uses: sbdchd/squawk-action@v1
  with:
    pattern: "migrations/*.sql"`}</code>
            </pre>

            <h3 className="text-xl font-semibold mt-8 mb-3 text-slate-200">MigrationPilot GitHub Action</h3>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-6">
              <code className="text-sm text-slate-300 font-mono">{`- uses: mickelsamuel/migrationpilot@v1
  with:
    paths: "migrations/*.sql"
    fail-on: critical`}</code>
            </pre>

            <p className="text-slate-300 leading-relaxed mb-6">
              Both actions post comments on pull requests with the violations found. MigrationPilot
              additionally provides inline annotations in the &quot;Files changed&quot; tab and a Job Summary
              with aggregate metrics. Squawk&apos;s action is simpler and more focused.
            </p>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">Known Limitations</h2>

            <h3 className="text-xl font-semibold mt-8 mb-3 text-slate-200">Squawk&apos;s known issues</h3>

            <ul className="list-disc list-inside text-slate-300 space-y-2 mb-6 ml-4">
              <li>Cannot analyze PL/pgSQL function bodies or DO blocks (GitHub issues #411, #528)</li>
              <li>False positives in some valid contexts (#937, #973)</li>
              <li>Exit code 1 for both errors and warnings &mdash; no way to distinguish (#348)</li>
              <li>No cross-file validation or schema-level context</li>
              <li>Pre-commit integration has been broken since June 2024 (#363)</li>
            </ul>

            <h3 className="text-xl font-semibold mt-8 mb-3 text-slate-200">MigrationPilot&apos;s known issues</h3>

            <ul className="list-disc list-inside text-slate-300 space-y-2 mb-6 ml-4">
              <li>New project &mdash; fewer real-world battle-testing hours</li>
              <li>TypeScript is slower than Rust on very large files (sub-second for typical use)</li>
              <li>Small community &mdash; fewer contributors finding and fixing edge cases</li>
              <li>3 rules behind a paywall ($19/month for production context analysis)</li>
              <li>No dynamic lock tracing (purely static analysis, like Squawk)</li>
            </ul>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">When to Use Squawk</h2>

            <ul className="list-disc list-inside text-slate-300 space-y-2 mb-6 ml-4">
              <li><strong className="text-slate-200">You want a proven, battle-tested tool.</strong> Squawk has years of production usage and a larger community. If stability and track record matter most, use Squawk.</li>
              <li><strong className="text-slate-200">You want 100% free with zero paid components.</strong> Squawk is fully free with no paid tier.</li>
              <li><strong className="text-slate-200">You need Rust-native speed.</strong> If you lint thousands of migration files in CI, Squawk&apos;s Rust parser is faster.</li>
              <li><strong className="text-slate-200">You want minimal dependencies.</strong> Squawk is a single binary. MigrationPilot requires Node.js.</li>
            </ul>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">When to Use MigrationPilot</h2>

            <ul className="list-disc list-inside text-slate-300 space-y-2 mb-6 ml-4">
              <li><strong className="text-slate-200">You want the most comprehensive rule set.</strong> 83 rules cover patterns that Squawk&apos;s 32 rules do not check.</li>
              <li><strong className="text-slate-200">You want lock type information.</strong> Knowing <em>which</em> lock a statement acquires helps you assess real-world impact.</li>
              <li><strong className="text-slate-200">You want auto-fix.</strong> 12 rules can be automatically fixed with <code className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-sm">--fix</code>.</li>
              <li><strong className="text-slate-200">You want SARIF output for GitHub Code Scanning.</strong> Violations appear directly in PR diffs.</li>
              <li><strong className="text-slate-200">You need production context analysis.</strong> Table size and query impact awareness (paid tier) is unique to MigrationPilot.</li>
              <li><strong className="text-slate-200">You want config presets.</strong> Five built-in presets (recommended, strict, ci, startup, enterprise) for different deployment contexts.</li>
            </ul>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">Can You Use Both?</h2>

            <p className="text-slate-300 leading-relaxed mb-4">
              Yes. Both tools analyze plain SQL files and can run independently in CI. Running both gives you
              the union of their rule sets and two independent opinions on each migration. The overhead is
              minimal &mdash; both complete in under a second for typical migrations.
            </p>

            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto mb-6">
              <code className="text-sm text-slate-300 font-mono">{`# Run both in CI
- name: Squawk lint
  uses: sbdchd/squawk-action@v1
  with:
    pattern: "migrations/*.sql"

- name: MigrationPilot lint
  uses: mickelsamuel/migrationpilot@v1
  with:
    paths: "migrations/*.sql"
    fail-on: critical`}</code>
            </pre>

            <h2 className="text-2xl font-bold mt-12 mb-4 text-slate-100">Summary</h2>

            <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 mb-8">
              <ul className="list-disc list-inside text-slate-300 space-y-3">
                <li><strong className="text-slate-200">Squawk</strong> is the established choice: proven, fast, 100% free, and sufficient for catching the most common PostgreSQL migration hazards.</li>
                <li><strong className="text-slate-200">MigrationPilot</strong> offers more coverage: 80 vs 32 rules, lock type classification, auto-fix, risk scoring, and SARIF output. But it&apos;s newer and less battle-tested.</li>
                <li>Both tools catch the critical issues (missing CONCURRENTLY, volatile defaults, column type changes, SET NOT NULL).</li>
                <li>The core rules overlap significantly. The difference is in the long tail of less common but still dangerous patterns.</li>
                <li>If stability and simplicity matter most, use Squawk. If coverage and features matter most, try MigrationPilot. If you want maximum safety, use both.</li>
              </ul>
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
