import type { Metadata } from 'next';
import { ArrowRight } from '@phosphor-icons/react/ssr';
import Navbar from '@/components/navbar';
import { Footer } from '@/components/footer';
import { ButtonLink } from '@/components/button';
import { Card } from '@/components/card';
import { CodeBlock, CommandBlock } from '@/components/code-block';
import { Section, SectionHeading } from '@/components/section';
import { Analyzer } from './_home/analyzer';
import { BenchmarkStrip } from './_home/benchmark-strip';
import { LockQueueSimulation } from './_home/lock-queue';

const INSTALL_COMMAND = 'npx migrationpilot analyze migration.sql';
const REPO = 'https://github.com/mickelsamuel/migrationpilot';

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
    'Local, deterministic analysis of PostgreSQL migrations using the real PostgreSQL parser. 112 rules with lock analysis, risk scoring, auto-fix and safe alternatives, in your terminal and your CI.',
  featureList: [
    '112 PostgreSQL migration safety rules',
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
        <Section bordered>
          <BenchmarkStrip />
        </Section>
        <Incident />
        <HowItWorks />
        <RuleCoverage />
        <Postmortems />
        <Pricing />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}

function Hero() {
  return (
    <section className="pb-16 pt-14 md:pb-24 md:pt-20">
      <div className="mx-auto grid w-full max-w-6xl items-start gap-10 px-5 sm:px-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,9fr)] lg:gap-14">
        <div className="min-w-0">
          <h1 className="max-w-[15ch] text-[34px] font-semibold leading-[1.1] tracking-tight text-fg sm:text-[42px] lg:text-[44px]">
            Block unsafe Postgres migrations before merge.
          </h1>
          <p className="mt-5 max-w-md text-base leading-relaxed text-muted">
            Local, deterministic analysis using PostgreSQL&apos;s parser. Runs in your terminal and
            CI. No account required.
          </p>

          <CommandBlock command={INSTALL_COMMAND} className="mt-8 w-fit max-w-full" />

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
            <a
              href="/playground"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-accent transition-colors hover:text-accent-hover"
            >
              Try it in your browser
              <ArrowRight size={14} weight="bold" />
            </a>
            <span className="text-sm text-faint">MIT licensed. All 112 rules, free.</span>
          </div>

          <p className="mt-10 max-w-md text-sm leading-relaxed text-muted">
            The panel beside this one is the engine, not a screenshot of it. Edit the SQL and the
            report changes: the PostgreSQL parser is compiled to WebAssembly and runs in the tab, so
            nothing you type leaves your browser.
          </p>
        </div>

        <div className="min-w-0 lg:pt-1">
          <Analyzer />
        </div>
      </div>
    </section>
  );
}

function Incident() {
  return (
    <Section width="wide">
      <SectionHeading
        title="The 2 a.m. incident, and the one-word difference"
        lead={
          <>
            A <code className="font-mono text-[13px] text-fg">CHECK</code> constraint added the
            obvious way validates every existing row while holding{' '}
            <code className="font-mono text-[13px] text-fg">ACCESS EXCLUSIVE</code>, which conflicts
            with every other lock mode. Reads and writes both stop until it finishes. Added with{' '}
            <code className="font-mono text-[13px] text-fg">NOT VALID</code>, the same constraint
            takes that lock for a fraction of a second and does the scan under a lock that blocks
            nothing.
          </>
        }
        className="mb-10"
      />
      <LockQueueSimulation />
    </Section>
  );
}

const ACTION_YAML = `# .github/workflows/migration-safety.yml
on:
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

function HowItWorks() {
  return (
    <Section width="wide">
      <SectionHeading
        title="Three places it runs"
        lead="Same engine, same rules, same verdict. Nothing to sign up for and nothing to send anywhere."
        className="mb-10"
      />

      <div className="space-y-12">
        <Step
          index="01"
          title="In your terminal"
          body={
            <>
              <code className="font-mono text-[13px] text-fg">--fix</code> rewrites what can be
              rewritten mechanically: 20 of the 112 rules. Here it added the timeouts,{' '}
              <code className="font-mono text-[13px] text-fg">NOT VALID</code> and{' '}
              <code className="font-mono text-[13px] text-fg">CONCURRENTLY</code>. It left the
              column type change alone, because that one is a five-step plan, not a rewrite, and{' '}
              <a href="/rules/mp007" className="text-accent hover:text-accent-hover">MP007</a> says
              so.
            </>
          }
        >
          <CodeBlock
            title="$ migrationpilot analyze migrations/ --fix"
            code={FIXED_SQL}
            language="sql"
          />
        </Step>

        <Step
          index="02"
          title="In your CI"
          body={
            <>
              The Action analyses every changed migration, posts the report as a pull request
              comment, and exits non-zero when something crosses{' '}
              <code className="font-mono text-[13px] text-fg">fail-on</code>. It also emits SARIF,
              so findings show up in GitHub code scanning.
            </>
          }
        >
          <CodeBlock title=".github/workflows/migration-safety.yml" code={ACTION_YAML} />
        </Step>

        <Step
          index="03"
          title="In front of your agents"
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
        </Step>
      </div>
    </Section>
  );
}

function Step({
  index,
  title,
  body,
  children,
}: {
  index: string;
  title: string;
  body: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:gap-10">
      <div className="min-w-0">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-xs text-faint">{index}</span>
          <h3 className="text-[15px] font-medium text-fg">{title}</h3>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted">{body}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function RuleCoverage() {
  return (
    <Section>
      <SectionHeading
        title="112 rules. Every lock explained."
        lead="Every rule names the lock the statement takes, what that lock blocks, and the pattern to use instead. They come from the PostgreSQL manual and from twenty handbook entries built on public incident writeups, not from a list of things that sounded risky."
      />

      <dl className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line-soft sm:grid-cols-4">
        <Stat value="34" label="critical" tone="danger" />
        <Stat value="78" label="warning" tone="warn" />
        <Stat value="109" label="run from the file alone" />
        <Stat value="3" label="read table statistics, given a database URL" />
      </dl>

      <div className="mt-10 flex flex-wrap gap-x-5 gap-y-2">
        <a href="/rules" className="text-sm text-accent transition-colors hover:text-accent-hover">
          Browse all 112 rules
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

const POSTMORTEMS = [
  {
    source: 'GitLab.com incident #6642',
    date: '18 March 2022',
    href: 'https://gitlab.com/gitlab-com/gl-infra/production/-/issues/6642',
    summary:
      'A post-deploy migration could not get its lock and blocked auto-deploy. The write-up walks through the lock queue and the missing timeout.',
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
      'A deadlock during a post-deploy migration. Adding a foreign key takes a lock on the referenced table as well as the referencing one, which is where the cycle came from.',
    rules: [
      { id: 'MP069', name: 'warn-fk-lock-both-tables' },
      { id: 'MP005', name: 'require-not-valid-fk' },
    ],
  },
  {
    source: 'rails/rails issue #9483',
    date: 'Open since 2013',
    href: 'https://github.com/rails/rails/issues/9483',
    summary:
      'Every Rails migration wraps itself in a transaction, and ALTER TYPE ... ADD VALUE could not run inside one. Years of failed deploys are collected in the thread.',
    rules: [
      { id: 'MP012', name: 'no-enum-add-in-transaction' },
      { id: 'MP054', name: 'alter-type-add-value-in-txn' },
    ],
  },
];

function Postmortems() {
  return (
    <Section>
      <SectionHeading
        title="Written from public write-ups"
        lead="Each of these is a published record of what went wrong. MigrationPilot flags the SQL pattern described in it. Whether the rule would have changed the outcome is not something a linter gets to claim."
        className="mb-10"
      />

      <ul className="grid gap-4 md:grid-cols-3">
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
    </Section>
  );
}

function Pricing() {
  return (
    <Section id="pricing">
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
            All 112 rules, every auto-fix, the CLI, the GitHub Action, the MCP server, the VS Code
            extension, and production context when you point it at a database. Unlimited runs. MIT
            licensed, so you can read every rule and fork it.
          </p>
          <ButtonLink href="/docs/quick-start" variant="secondary" className="mt-6 self-start">
            Quick start
          </ButtonLink>
        </div>

        <div className="flex flex-col rounded-xl border border-accent/35 bg-surface p-6">
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
      <CommandBlock command={INSTALL_COMMAND} className="mt-6 w-fit max-w-full" />
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        <a
          href="/playground"
          className="inline-flex items-center gap-1.5 text-sm text-accent transition-colors hover:text-accent-hover"
        >
          Or paste one in the playground
          <ArrowRight size={14} weight="bold" />
        </a>
        <a
          href={REPO}
          className="text-sm text-muted transition-colors hover:text-fg"
        >
          Source on GitHub
        </a>
      </div>
    </Section>
  );
}
