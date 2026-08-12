import type { Metadata } from 'next';
import { ArrowRight } from '@phosphor-icons/react/ssr';
import Navbar from '@/components/navbar';
import { Footer } from '@/components/footer';
import { ButtonLink } from '@/components/button';
import { Card } from '@/components/card';
import { CodeBlock, CommandBlock } from '@/components/code-block';
import { Section, SectionHeading } from '@/components/section';
import { Sql } from '@/components/sql';
import { Analyzer } from './_home/analyzer';
import { BenchmarkStrip } from './_home/benchmark-strip';
import { LockTraceReplay } from './_home/lock-trace';
import { PrComment } from './_home/pr-comment';
import { ENGINE_MANIFEST } from './_home/precomputed';

const INSTALL_COMMAND = 'npx migrationpilot analyze migration.sql';
const REPO = 'https://github.com/mickelsamuel/migrationpilot';

const { ruleCount, offlineRuleCount, databaseRuleCount } = ENGINE_MANIFEST;

export const metadata: Metadata = {
  alternates: { canonical: '/' },
};

const softwareApplicationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'MigrationPilot',
  applicationCategory: 'DeveloperApplication',
  applicationSubCategory: 'Static analysis',
  operatingSystem: 'Linux, macOS, Windows',
  url: 'https://migrationpilot.dev',
  downloadUrl: 'https://www.npmjs.com/package/migrationpilot',
  softwareVersion: '1.6.0',
  license: 'https://opensource.org/licenses/MIT',
  description:
    `Local, deterministic analysis of PostgreSQL migrations using the real PostgreSQL parser. ${ruleCount} rules with lock analysis, risk scoring, auto-fix and safe alternatives, in your terminal and your CI.`,
  featureList: [
    `${ruleCount} PostgreSQL migration safety rules`,
    'Per-statement lock type analysis',
    'Risk scoring (RED / YELLOW / GREEN)',
    'Auto-fix for 20 rules',
    'GitHub Action with PR comments and SARIF output',
    'MCP server for AI coding agents',
  ],
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  author: { '@type': 'Person', name: 'Mickel Samuel' },
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplicationJsonLd) }}
      />
      <Navbar />
      <main className="pt-14">
        <Hero />
        <Evidence />
        <LockQueue />
        <CaseFile />
        <EntryPoints />
        <Coverage />
        <Pricing />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}

function Hero() {
  return (
    <section className="pb-16 pt-12 md:pb-24 md:pt-20">
      <div className="mp-container grid items-start gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,9fr)] lg:gap-14">
        <div className="min-w-0">
          <h1 className="max-w-[15ch] text-[36px] font-semibold leading-[1.1] tracking-tight text-fg sm:text-[42px] lg:text-[44px]">
            Block unsafe Postgres migrations before merge.
          </h1>
          <p className="mt-5 max-w-md text-base leading-relaxed text-muted">
            Local, deterministic analysis using PostgreSQL&apos;s parser. Runs in your terminal and
            CI. No account required.
          </p>

          <CommandBlock command={INSTALL_COMMAND} className="mt-8" />

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
            <a
              href="/playground"
              className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-accent transition-colors hover:text-accent-hover"
            >
              Try it in your browser
              <ArrowRight size={14} weight="bold" />
            </a>
            <span className="text-sm text-faint">MIT licensed. All {ruleCount} rules, free.</span>
          </div>

          <p className="mt-8 max-w-md text-sm leading-relaxed text-muted">
            The panel beside this one is the engine, not a screenshot of it. It runs entirely in
            your browser: open DevTools and watch the network tab while you type. Nothing you write
            is sent anywhere.
          </p>
        </div>

        <div className="min-w-0 lg:pt-1">
          <Analyzer />
        </div>
      </div>
    </section>
  );
}

const POSTMORTEMS = [
  {
    source: 'GitLab.com incident #6642',
    date: '18 March 2022',
    href: 'https://gitlab.com/gitlab-com/gl-infra/production/-/issues/6642',
    summary:
      'A post-deploy migration could not acquire its lock and blocked auto-deploy. The write-up walks through the lock queue and the missing timeout.',
    rules: [
      { id: 'MP004', name: 'require-lock-timeout' },
      { id: 'MP020', name: 'require-statement-timeout' },
    ],
  },
  {
    source: 'GitLab.com incident #21712',
    date: '6 April 2026',
    href: 'https://gitlab.com/gitlab-com/gl-infra/production/-/work_items/21712',
    summary:
      'A deadlock during a post-deploy migration. Adding a foreign key locks the referenced table as well as the referencing one, which is where the cycle came from.',
    rules: [
      { id: 'MP069', name: 'warn-fk-lock-both-tables' },
      { id: 'MP005', name: 'require-not-valid-fk' },
    ],
  },
];

function Evidence() {
  return (
    <Section>
      <BenchmarkStrip />

      <div className="mt-14 border-t border-line-soft pt-10">
        <h3 className="text-base font-medium text-fg">Where the rules come from</h3>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted">
          Public write-ups of migrations that went wrong. MigrationPilot flags the SQL pattern
          described in each one. Whether a rule would have changed the outcome is not something a
          linter gets to claim.
        </p>

        <ul className="mt-6 grid gap-4 md:grid-cols-2">
          {POSTMORTEMS.map((entry) => (
            <Card key={entry.source} as="li" interactive padded={false} className="flex flex-col p-5">
              <a href={entry.href} className="text-sm font-medium text-fg hover:text-accent">
                {entry.source}
              </a>
              <p className="mt-1 font-mono text-[11px] text-faint">{entry.date}</p>
              <p className="mt-3 flex-1 text-[13px] leading-relaxed text-muted">{entry.summary}</p>
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-line-soft pt-3">
                {entry.rules.map((rule) => (
                  <a
                    key={rule.id}
                    href={`/rules/${rule.id.toLowerCase()}`}
                    className="group inline-flex items-baseline gap-1.5"
                  >
                    <span className="font-mono text-xs text-accent group-hover:text-accent-hover">
                      {rule.id}
                    </span>
                    <span className="font-mono text-[11px] text-faint">{rule.name}</span>
                  </a>
                ))}
              </div>
            </Card>
          ))}
        </ul>
      </div>
    </Section>
  );
}

function LockQueue() {
  return (
    <Section>
      <SectionHeading
        title="How one waiting DDL statement forms a lock queue"
        lead={
          <>
            <code className="font-mono text-[13px] text-fg">ACCESS EXCLUSIVE</code> conflicts with
            every other lock mode, and a request that cannot be granted takes the head of the queue.
            Everything that arrives after it waits, including plain{' '}
            <code className="font-mono text-[13px] text-fg">SELECT</code>s that would not have
            conflicted with anything. The two panels below replay one workload against one table,
            twice, changing nothing but the migration.
          </>
        }
        className="mb-10"
      />
      <LockTraceReplay />
    </Section>
  );
}

const MP001_UNSAFE = 'CREATE INDEX idx_users_email ON users (email);';
const MP001_SAFE = 'CREATE INDEX CONCURRENTLY idx_users_email ON users (email);';

const CASE_FILE = [
  {
    label: 'Triggers on',
    body: (
      <pre className="mp-scroll overflow-x-auto font-mono text-xs leading-[1.7]">
        <Sql code={MP001_UNSAFE} />
      </pre>
    ),
  },
  {
    label: 'Lock it takes',
    body: (
      <p className="text-[13px] leading-relaxed text-muted">
        <code className="font-mono text-[13px] text-danger">ACCESS EXCLUSIVE</code> on the table,
        held for the entire index build. Blocks reads and writes.
      </p>
    ),
  },
  {
    label: 'Affected versions',
    body: (
      <p className="text-[13px] leading-relaxed text-muted">
        All supported versions, 14 through 18.
      </p>
    ),
  },
  {
    label: 'Safe form',
    body: (
      <pre className="mp-scroll overflow-x-auto font-mono text-xs leading-[1.7]">
        <Sql code={MP001_SAFE} />
      </pre>
    ),
  },
  {
    label: 'Known boundary',
    body: (
      <p className="text-[13px] leading-relaxed text-muted">
        <code className="font-mono text-[13px] text-fg">CONCURRENTLY</code> cannot run inside a
        transaction, and a failed build leaves an invalid index behind that has to be dropped before
        retrying. Those are separate rules:{' '}
        <a href="/rules/mp025" className="text-accent hover:text-accent-hover">MP025</a> and{' '}
        <a href="/rules/mp070" className="text-accent hover:text-accent-hover">MP070</a>.
      </p>
    ),
  },
];

function CaseFile() {
  return (
    <Section>
      <SectionHeading
        title="One rule, all the way down"
        lead="Every rule is a claim about PostgreSQL, so every rule carries what backs it: the manual, a handbook entry, a public write-up, and its result in the benchmark. Here is one of them in full."
        className="mb-10"
      />

      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line-soft px-5 py-4">
          <span className="font-mono text-sm text-accent">MP001</span>
          <span className="font-mono text-sm text-fg">require-concurrent-index-creation</span>
          <span className="rounded border border-danger/40 bg-danger-soft px-2 py-0.5 font-mono text-[11px] text-danger">
            critical
          </span>
          <span className="rounded border border-line px-2 py-0.5 font-mono text-[11px] text-muted">
            auto-fixable
          </span>
        </div>

        <dl className="divide-y divide-line-soft">
          {CASE_FILE.map((row) => (
            <div key={row.label} className="grid gap-2 px-5 py-4 sm:grid-cols-[160px_minmax(0,1fr)] sm:gap-6">
              <dt className="text-xs uppercase tracking-[0.08em] text-faint">{row.label}</dt>
              <dd className="min-w-0">{row.body}</dd>
            </div>
          ))}

          <div className="grid gap-2 px-5 py-4 sm:grid-cols-[160px_minmax(0,1fr)] sm:gap-6">
            <dt className="text-xs uppercase tracking-[0.08em] text-faint">Evidence</dt>
            <dd className="min-w-0 space-y-2 text-[13px] leading-relaxed text-muted">
              <p>
                Handbook entry{' '}
                <a
                  href={`${REPO}/blob/main/docs/handbook/01-non-concurrent-index-creation.md`}
                  className="text-accent hover:text-accent-hover"
                >
                  MPH-001
                </a>
                , which cites the{' '}
                <a
                  href="https://www.postgresql.org/docs/current/sql-createindex.html"
                  className="text-accent hover:text-accent-hover"
                >
                  CREATE INDEX manual
                </a>{' '}
                and a{' '}
                <a
                  href="https://medium.com/carwow-product-engineering/problems-with-concurrent-postgres-indexes-and-how-to-solve-them-c57f7656c852"
                  className="text-accent hover:text-accent-hover"
                >
                  carwow engineering write-up
                </a>
                .
              </p>
              <p>
                Benchmark: the <code className="font-mono text-[13px] text-fg">non-concurrent-index</code>{' '}
                hazard appears in 7 corpus files. MigrationPilot names it in 7 of 7, as do Squawk and
                pgfence.
              </p>
            </dd>
          </div>
        </dl>

        <div className="border-t border-line-soft px-5 py-4">
          <a href="/rules/mp001" className="text-sm text-accent transition-colors hover:text-accent-hover">
            The full MP001 page
          </a>
        </div>
      </div>
    </Section>
  );
}

const ACTION_YAML = `on:
  pull_request:
    paths: ['migrations/**']

jobs:
  migration-safety:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
      - uses: mickelsamuel/migrationpilot@v1
        with:
          migration-path: migrations/
          fail-on: critical`;

const FIXED_SQL = `SET lock_timeout = '5s';
ALTER TABLE orders
  ADD CONSTRAINT orders_amount_positive CHECK (amount > 0) NOT VALID;

SET statement_timeout = '30s';
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_customer_id
  ON orders (customer_id);

ALTER TABLE users
  ALTER COLUMN email TYPE varchar(255);`;

const MCP_VERDICT = `{
  "verdict": "fail",
  "failOn": "critical",
  "counts": { "critical": 2, "warning": 0, "blocking": 2 },
  "violations": [
    { "ruleId": "MP004", "blocking": true },
    { "ruleId": "MP030", "blocking": true }
  ]
}`;

function EntryPoints() {
  return (
    <Section>
      <SectionHeading
        title="One engine, three entry points"
        lead="The terminal, CI and your coding agent are three callers of the same analysis. Same rules, same verdict, same exit code. Nothing to sign up for and nothing to send anywhere."
        className="mb-10"
      />

      <div className="space-y-12">
        <Entry
          label="Terminal"
          body={
            <>
              <code className="font-mono text-[13px] text-fg">--fix</code> rewrites what can be
              rewritten mechanically: 20 of the {ruleCount} rules. Here it added the timeouts,{' '}
              <code className="font-mono text-[13px] text-fg">NOT VALID</code> and{' '}
              <code className="font-mono text-[13px] text-fg">CONCURRENTLY</code>. It left the
              column type change alone, because that one is a five-step plan rather than a rewrite,
              and <a href="/rules/mp007" className="text-accent hover:text-accent-hover">MP007</a>{' '}
              says so.
            </>
          }
        >
          <CodeBlock
            title="$ migrationpilot analyze migrations/ --fix"
            code={FIXED_SQL}
            language="sql"
          />
        </Entry>

        <Entry
          label="CI"
          body={
            <>
              The Action analyses every changed migration and exits non-zero when something crosses{' '}
              <code className="font-mono text-[13px] text-fg">fail-on</code>, so the required check
              fails. It also emits SARIF for GitHub code scanning. This is what it leaves on the
              pull request.
            </>
          }
        >
          <div className="space-y-4">
            <CodeBlock title=".github/workflows/migration-safety.yml" code={ACTION_YAML} />
            <PrComment />
          </div>
        </Entry>

        <Entry
          label="Agents"
          body={
            <>
              Coding agents write migrations now. The MCP server gives them a gate to call first:{' '}
              <code className="font-mono text-[13px] text-fg">check_before_apply</code> resolves
              your project config exactly like the CLI and answers pass or fail, naming the rules
              that block. Abridged below; the real response carries the messages and the safe
              alternative too.
            </>
          }
        >
          <CodeBlock title="check_before_apply" code={MCP_VERDICT} />
        </Entry>
      </div>
    </Section>
  );
}

function Entry({
  label,
  body,
  children,
}: {
  label: string;
  body: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:gap-10">
      <div className="min-w-0">
        <h3 className="text-[15px] font-medium text-fg">{label}</h3>
        <p className="mt-3 text-sm leading-relaxed text-muted">{body}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Coverage() {
  return (
    <Section>
      <SectionHeading
        title={`${ruleCount} rules. Every lock explained.`}
        lead="Every rule names the lock the statement takes, what that lock blocks, and the pattern to use instead. They come from the PostgreSQL manual and from twenty handbook entries built on public incident write-ups, not from a list of things that sounded risky."
      />

      <dl className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line-soft sm:grid-cols-4">
        <Stat value="34" label="critical" tone="danger" />
        <Stat value="78" label="warning" tone="warn" />
        <Stat value={String(offlineRuleCount)} label="run from the file alone" />
        <Stat value={String(databaseRuleCount)} label="need --database-url to say anything" />
      </dl>

      <p className="mt-6 max-w-2xl text-[13px] leading-relaxed text-muted">
        The {databaseRuleCount} catalogue-aware rules read table sizes, write traffic, replication
        state and index definitions. Without a connection they stay silent rather than guess, and
        the CLI says so on every run.
      </p>

      <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2">
        <a href="/rules" className="text-sm text-accent transition-colors hover:text-accent-hover">
          Browse all {ruleCount} rules
        </a>
        <a
          href={`${REPO}/tree/main/docs/handbook`}
          className="text-sm text-accent transition-colors hover:text-accent-hover"
        >
          Read the handbook
        </a>
      </div>
    </Section>
  );
}

function Stat({
  value,
  label,
  tone,
}: {
  value: string;
  label: string;
  tone?: 'danger' | 'warn';
}) {
  return (
    <div className="bg-surface px-5 py-5">
      <dt
        className={`font-mono text-2xl tabular-nums ${
          tone === 'danger' ? 'text-danger' : tone === 'warn' ? 'text-warn' : 'text-fg'
        }`}
      >
        {value}
      </dt>
      <dd className="mt-1.5 text-[13px] leading-snug text-muted">{label}</dd>
    </div>
  );
}

function Pricing() {
  return (
    <Section>
      <SectionHeading
        title="The linter is free. The proof costs money."
        lead="Everything that finds a problem is free forever, with no account and no quota. The paid plan exists for the separate question an auditor asks: prove this was enforced."
        className="mb-10"
      />

      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col rounded-xl border border-line bg-surface p-6">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-base font-medium text-fg">Free</h3>
            <p className="font-mono text-sm text-muted">$0</p>
          </div>
          <p className="mt-4 flex-1 text-sm leading-relaxed text-muted">
            All {ruleCount} rules, every auto-fix, the CLI, the GitHub Action, the MCP server, the
            VS Code extension, and production context when you point it at a database. Unlimited
            runs. MIT licensed, so you can read every rule and fork it.
          </p>
          <ButtonLink href="/docs/quick-start" variant="secondary" className="mt-6 self-start">
            Quick start
          </ButtonLink>
        </div>

        <div className="flex flex-col rounded-xl border border-accent/40 bg-surface p-6">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-base font-medium text-fg">Org</h3>
            <p className="font-mono text-sm text-accent">$499 / year</p>
          </div>
          <p className="mt-4 flex-1 text-sm leading-relaxed text-muted">
            The $499/year Org plan turns the free linter into an enforceable control: one signed
            policy across repositories, owner-attributed waivers that expire, and audit evidence for
            every merge.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <ButtonLink href="mailto:hello@migrationpilot.dev?subject=Org%20plan">
              Talk to us
            </ButtonLink>
            <a
              href="/pricing"
              className="text-sm text-accent transition-colors hover:text-accent-hover"
            >
              What the artifacts look like
            </a>
          </div>
        </div>
      </div>
    </Section>
  );
}

function FinalCta() {
  return (
    <Section>
      <h2 className="max-w-xl text-2xl font-semibold text-fg sm:text-3xl">
        Point it at your migrations.
      </h2>
      <CommandBlock command={INSTALL_COMMAND} className="mt-6" />
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        <a
          href="/playground"
          className="inline-flex min-h-[44px] items-center gap-1.5 text-sm text-accent transition-colors hover:text-accent-hover"
        >
          Or paste one in the playground
          <ArrowRight size={14} weight="bold" />
        </a>
        <a href={REPO} className="text-sm text-muted transition-colors hover:text-fg">
          Source on GitHub
        </a>
      </div>
    </Section>
  );
}
