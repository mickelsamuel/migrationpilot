import type { Metadata } from 'next';
import Navbar from '@/components/navbar';
import { Footer } from '@/components/footer';
import { CodeBlock } from '@/components/code-block';

export const metadata: Metadata = {
  title: 'Flyway vs Liquibase for PostgreSQL: An Honest Comparison — MigrationPilot',
  description: 'A practical comparison of Flyway and Liquibase for PostgreSQL migrations: features, syntax, rollbacks, team workflows, and where each tool falls short.',
  keywords: ['flyway vs liquibase postgresql', 'flyway vs liquibase', 'postgresql migration tool', 'database migration framework', 'flyway postgresql', 'liquibase postgresql'],
  alternates: {
    canonical: '/blog/flyway-vs-liquibase-postgresql',
  },
  openGraph: {
    title: 'Flyway vs Liquibase for PostgreSQL: An Honest Comparison',
    description: 'A practical comparison of Flyway and Liquibase for PostgreSQL migrations: features, syntax, rollbacks, team workflows, and where each tool falls short.',
    type: 'article',
    url: '/blog/flyway-vs-liquibase-postgresql',
  },
};

export default function FlywayVsLiquibase() {
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
              Flyway vs Liquibase for PostgreSQL: An Honest Comparison
            </h1>

            <p className="text-xl text-muted mb-12 leading-relaxed">
              Flyway and Liquibase are the two most widely used database migration tools in the Java ecosystem.
              Both support PostgreSQL. Both are mature. And both have significant differences in philosophy,
              syntax, and capabilities. This guide compares them honestly, including where each one falls short.
            </p>

            <div className="prose prose-invert max-w-none">
              <h2 className="text-2xl font-bold mt-12 mb-4 text-fg">Philosophy: Convention vs Configuration</h2>

              <p className="text-muted leading-relaxed mb-4">
                <strong className="text-fg">Flyway</strong> follows a convention-over-configuration approach.
                Migrations are plain SQL files with a naming convention (<code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">V1__description.sql</code>).
                There is one way to do things, and it is simple. If you know SQL, you know Flyway.
              </p>

              <p className="text-muted leading-relaxed mb-6">
                <strong className="text-fg">Liquibase</strong> takes a configuration-heavy approach. Migrations
                (called &quot;changesets&quot;) can be written in XML, YAML, JSON, or SQL. Liquibase provides a database-agnostic
                abstraction layer with its own DSL for schema changes. This gives more flexibility at the cost
                of complexity.
              </p>

              <h2 className="text-2xl font-bold mt-12 mb-4 text-fg">Migration Syntax</h2>

              <h3 className="text-xl font-semibold mt-8 mb-3 text-fg">Flyway: Plain SQL</h3>

              <CodeBlock code={`-- V2__add_users_email_index.sql
-- Flyway migration: just SQL with a naming convention

CREATE INDEX CONCURRENTLY idx_users_email ON users (email);

-- That's it. The filename determines the version and description.
-- V2 = version 2
-- add_users_email_index = description (underscores become spaces)`} language="sql" />

              <h3 className="text-xl font-semibold mt-8 mb-3 text-fg">Liquibase: XML/YAML/SQL changesets</h3>

              <CodeBlock code={`<!-- db.changelog-2.xml -->
<databaseChangeLog xmlns="http://www.liquibase.org/xml/ns/dbchangelog"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:schemaLocation="http://www.liquibase.org/xml/ns/dbchangelog
    http://www.liquibase.org/xml/ns/dbchangelog/dbchangelog-4.0.xsd">

  <changeSet id="2" author="dev">
    <createIndex indexName="idx_users_email"
                 tableName="users"
                 unique="false">
      <column name="email"/>
    </createIndex>
  </changeSet>
</databaseChangeLog>`} />

              <p className="text-muted leading-relaxed mb-4">
                Or in YAML:
              </p>

              <CodeBlock code={`# db.changelog-2.yaml
databaseChangeLog:
  - changeSet:
      id: 2
      author: dev
      changes:
        - createIndex:
            indexName: idx_users_email
            tableName: users
            columns:
              - column:
                  name: email`} />

              <p className="text-muted leading-relaxed mb-6">
                Or as raw SQL (Liquibase also supports this):
              </p>

              <CodeBlock code={`-- db.changelog-2.sql
-- liquibase formatted sql
-- changeset dev:2
CREATE INDEX CONCURRENTLY idx_users_email ON users (email);`} language="sql" />

              <h2 className="text-2xl font-bold mt-12 mb-4 text-fg">Feature Comparison</h2>

              <div className="overflow-x-auto mb-8">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-line">
                      <th className="text-left py-3 px-4 text-muted font-semibold">Feature</th>
                      <th className="text-left py-3 px-4 text-muted font-semibold">Flyway</th>
                      <th className="text-left py-3 px-4 text-muted font-semibold">Liquibase</th>
                    </tr>
                  </thead>
                  <tbody className="text-muted">
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4 font-semibold text-faint">Migration format</td>
                      <td className="py-3 px-4">SQL, Java</td>
                      <td className="py-3 px-4">XML, YAML, JSON, SQL</td>
                    </tr>
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4 font-semibold text-faint">PostgreSQL support</td>
                      <td className="py-3 px-4 text-ok">Excellent</td>
                      <td className="py-3 px-4 text-ok">Excellent</td>
                    </tr>
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4 font-semibold text-faint">Rollback support</td>
                      <td className="py-3 px-4 text-warn">Paid (Teams)</td>
                      <td className="py-3 px-4 text-ok">Free (auto + manual)</td>
                    </tr>
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4 font-semibold text-faint">Schema diff</td>
                      <td className="py-3 px-4 text-danger">No</td>
                      <td className="py-3 px-4 text-ok">Yes (diff command)</td>
                    </tr>
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4 font-semibold text-faint">Database-agnostic DSL</td>
                      <td className="py-3 px-4 text-danger">No (SQL is DB-specific)</td>
                      <td className="py-3 px-4 text-ok">Yes (XML/YAML changesets)</td>
                    </tr>
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4 font-semibold text-faint">Conditional execution</td>
                      <td className="py-3 px-4 text-danger">No</td>
                      <td className="py-3 px-4 text-ok">Yes (preconditions)</td>
                    </tr>
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4 font-semibold text-faint">Transaction control</td>
                      <td className="py-3 px-4 text-warn">Per-migration only</td>
                      <td className="py-3 px-4 text-ok">Per-changeset</td>
                    </tr>
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4 font-semibold text-faint">Learning curve</td>
                      <td className="py-3 px-4 text-ok">Low</td>
                      <td className="py-3 px-4 text-warn">Medium-High</td>
                    </tr>
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4 font-semibold text-faint">Community edition</td>
                      <td className="py-3 px-4">Apache 2.0</td>
                      <td className="py-3 px-4">Apache 2.0</td>
                    </tr>
                    <tr className="border-b border-line-soft">
                      <td className="py-3 px-4 font-semibold text-faint">SQL safety linting</td>
                      <td className="py-3 px-4 text-danger">No</td>
                      <td className="py-3 px-4 text-danger">No</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <h2 className="text-2xl font-bold mt-12 mb-4 text-fg">Rollback Strategies</h2>

              <h3 className="text-xl font-semibold mt-8 mb-3 text-fg">Flyway</h3>

              <p className="text-muted leading-relaxed mb-4">
                Flyway&apos;s free tier does not support rollbacks at all. You can only move forward. The
                Teams/Enterprise tier adds &quot;undo migrations&quot; (files named <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">U2__description.sql</code>)
                that you write manually. There is no auto-generated rollback.
              </p>

              <CodeBlock code={`-- V2__add_status_column.sql
ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active';

-- U2__add_status_column.sql (Flyway Teams only)
ALTER TABLE users DROP COLUMN status;`} language="sql" />

              <h3 className="text-xl font-semibold mt-8 mb-3 text-fg">Liquibase</h3>

              <p className="text-muted leading-relaxed mb-4">
                Liquibase has built-in rollback support in the free tier. For XML/YAML changesets,
                Liquibase auto-generates rollback SQL for many operations (CREATE TABLE, ADD COLUMN, etc.).
                For complex or SQL-based changesets, you specify rollback manually:
              </p>

              <CodeBlock code={`<changeSet id="2" author="dev">
  <addColumn tableName="users">
    <column name="status" type="TEXT" defaultValue="active"/>
  </addColumn>
  <!-- Rollback auto-generated: DROP COLUMN status -->
</changeSet>

<!-- For SQL changesets, specify rollback explicitly -->
<changeSet id="3" author="dev">
  <sql>
    CREATE INDEX CONCURRENTLY idx_users_email ON users (email);
  </sql>
  <rollback>
    DROP INDEX CONCURRENTLY idx_users_email;
  </rollback>
</changeSet>`} language="sql" />

              <h2 className="text-2xl font-bold mt-12 mb-4 text-fg">PostgreSQL-Specific Considerations</h2>

              <h3 className="text-xl font-semibold mt-8 mb-3 text-fg">Transaction handling</h3>

              <p className="text-muted leading-relaxed mb-4">
                Both Flyway and Liquibase wrap migrations in transactions by default. This is generally good
                for atomicity but causes problems with specific PostgreSQL operations:
              </p>

              <ul className="list-disc list-inside text-muted space-y-2 mb-6 ml-4">
                <li><code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">CREATE INDEX CONCURRENTLY</code> cannot run inside a transaction</li>
                <li><code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">ALTER TYPE ... ADD VALUE</code> cannot run inside a transaction (PG 11 and earlier)</li>
                <li><code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">DROP INDEX CONCURRENTLY</code> cannot run inside a transaction</li>
              </ul>

              <CodeBlock code={`-- Flyway: Disable transaction for specific migration
-- Add this comment at the top of the file:
-- flyway:executeInTransaction=false
CREATE INDEX CONCURRENTLY idx_users_email ON users (email);

-- Liquibase: Disable transaction per changeset
<changeSet id="2" author="dev" runInTransaction="false">
  <sql>
    CREATE INDEX CONCURRENTLY idx_users_email ON users (email);
  </sql>
</changeSet>`} language="sql" />

              <h3 className="text-xl font-semibold mt-8 mb-3 text-fg">Liquibase abstraction layer limitations</h3>

              <p className="text-muted leading-relaxed mb-4">
                Liquibase&apos;s database-agnostic DSL does not support many PostgreSQL-specific features:
              </p>

              <ul className="list-disc list-inside text-muted space-y-2 mb-6 ml-4">
                <li>No CONCURRENTLY support in the XML <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">{`<createIndex>`}</code> tag</li>
                <li>No NOT VALID support for constraints</li>
                <li>No support for partitioning (PARTITION BY)</li>
                <li>No support for RLS policies</li>
                <li>Limited enum type support</li>
              </ul>

              <p className="text-muted leading-relaxed mb-6">
                For any PostgreSQL-specific migration, you end up using raw SQL changesets anyway, which
                negates the benefit of the abstraction layer. If you are only targeting PostgreSQL, the
                XML/YAML format adds complexity without benefit.
              </p>

              <h2 className="text-2xl font-bold mt-12 mb-4 text-fg">When to Choose Flyway</h2>

              <ul className="list-disc list-inside text-muted space-y-2 mb-6 ml-4">
                <li><strong className="text-fg">You want simplicity.</strong> Flyway&apos;s SQL-first approach means there is almost nothing to learn. Write SQL, name the file correctly, done.</li>
                <li><strong className="text-fg">You only target PostgreSQL.</strong> No need for a database-agnostic abstraction layer.</li>
                <li><strong className="text-fg">Your team knows SQL well.</strong> Flyway encourages SQL fluency rather than hiding behind an abstraction.</li>
                <li><strong className="text-fg">You want minimal tooling overhead.</strong> Fewer config files, fewer concepts, fewer surprises.</li>
              </ul>

              <h2 className="text-2xl font-bold mt-12 mb-4 text-fg">When to Choose Liquibase</h2>

              <ul className="list-disc list-inside text-muted space-y-2 mb-6 ml-4">
                <li><strong className="text-fg">You need multi-database support.</strong> If your application targets PostgreSQL, MySQL, and Oracle, the abstraction layer helps.</li>
                <li><strong className="text-fg">You need rollback in the free tier.</strong> Flyway&apos;s rollback is a paid feature.</li>
                <li><strong className="text-fg">You need conditional execution.</strong> Liquibase preconditions let you run changesets conditionally (e.g., only if a table does not exist).</li>
                <li><strong className="text-fg">You need schema diff.</strong> Liquibase can compare two databases and generate the diff as changesets.</li>
                <li><strong className="text-fg">You have complex deployment workflows.</strong> Liquibase&apos;s changeset model with contexts and labels provides more granular control.</li>
              </ul>

              <h2 className="text-2xl font-bold mt-12 mb-4 text-fg">What Neither Tool Does: SQL Safety Analysis</h2>

              <p className="text-muted leading-relaxed mb-4">
                Both Flyway and Liquibase are <strong className="text-fg">migration runners</strong>. They track which migrations
                have been applied, execute them in order, and handle versioning. What neither tool does
                is analyze the SQL itself for safety.
              </p>

              <p className="text-muted leading-relaxed mb-4">
                Neither Flyway nor Liquibase will warn you about:
              </p>

              <ul className="list-disc list-inside text-muted space-y-2 mb-6 ml-4">
                <li>CREATE INDEX without CONCURRENTLY (blocks writes)</li>
                <li>Missing lock_timeout (can queue all traffic)</li>
                <li>ALTER COLUMN TYPE causing a full table rewrite</li>
                <li>SET NOT NULL without the CHECK pattern (ACCESS EXCLUSIVE scan)</li>
                <li>Volatile defaults that rewrite the table</li>
                <li>Foreign keys that lock both tables</li>
              </ul>

              <p className="text-muted leading-relaxed mb-6">
                These tools apply your migrations. They do not tell you whether those migrations are safe to run
                against a production database. This is a fundamentally different concern, and it is where
                migration linting tools come in.
              </p>

              <h2 className="text-2xl font-bold mt-12 mb-4 text-fg">Combining Migration Runners with Safety Linting</h2>

              <p className="text-muted leading-relaxed mb-4">
                The best approach is to use both: a migration runner (Flyway or Liquibase) for execution,
                and a linter for safety analysis. They complement each other:
              </p>

              <CodeBlock code={`# Example CI pipeline combining Flyway + MigrationPilot

# Step 1: Lint the migration SQL for safety issues
npx migrationpilot check src/main/resources/db/migration/*.sql \\
  --fail-on critical

# Step 2: If lint passes, run the migration with Flyway
flyway migrate`} />

              <p className="text-muted leading-relaxed mb-4">
                Or with Liquibase:
              </p>

              <CodeBlock code={`# For Liquibase SQL changesets:
npx migrationpilot check src/main/resources/db/changelog/*.sql \\
  --fail-on critical

# For Liquibase XML/YAML, generate SQL first:
liquibase update-sql > /tmp/pending.sql
npx migrationpilot analyze /tmp/pending.sql`} />

              <p className="text-muted leading-relaxed mb-6">
                <a href="https://github.com/mickelsamuel/migrationpilot" className="text-accent hover:text-accent-hover">MigrationPilot</a>{' '}
                auto-detects both Flyway and Liquibase (plus 12 other frameworks) and works with any
                migration runner. It analyzes the SQL for lock safety, table rewrites, and 106 other
                patterns — the exact gap that migration runners do not fill. It runs in CI as a GitHub
                Action, GitLab CI step, or plain CLI command.
              </p>

              <h2 className="text-2xl font-bold mt-12 mb-4 text-fg">Summary</h2>

              <div className="bg-surface border border-line rounded-lg p-6 mb-8">
                <ul className="list-disc list-inside text-muted space-y-3">
                  <li><strong className="text-fg">Flyway</strong>: Simple, SQL-first, great for PostgreSQL-only projects. Rollback is paid.</li>
                  <li><strong className="text-fg">Liquibase</strong>: Flexible, multi-format, rollback included. More complex, abstraction layer has PostgreSQL gaps.</li>
                  <li><strong className="text-fg">Both</strong>: Run migrations but do not analyze SQL for safety. Pair with a linter for production-safe migrations.</li>
                  <li>For PostgreSQL-only projects, Flyway&apos;s simplicity usually wins.</li>
                  <li>For multi-database environments or when you need free rollback, Liquibase is the better choice.</li>
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
