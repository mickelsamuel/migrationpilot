import type { Metadata } from 'next';
import Navbar from '@/components/navbar';
import { Footer } from '@/components/footer';
import { ButtonLink } from '@/components/button';
import { CodeBlock } from '@/components/code-block';
import { Section, SectionHeading } from '@/components/section';

const ORG_CTA = 'mailto:hello@migrationpilot.dev?subject=Org%20plan';

export const metadata: Metadata = {
  title: 'Pricing: MigrationPilot',
  description:
    'All 112 PostgreSQL migration safety rules are free, with no account and no quota. The $499/year Org plan turns the linter into an enforceable control with audit evidence.',
  alternates: { canonical: '/pricing' },
  openGraph: {
    title: 'Pricing: MigrationPilot',
    description:
      'All 112 rules free, with no account and no quota. The $499/year Org plan adds enforced policy and audit evidence.',
    url: 'https://migrationpilot.dev/pricing',
  },
};

const FREE_INCLUDES = [
  'All 112 rules, including the 15 catalogue-aware ones that read table sizes, write traffic and replication state from a database',
  'Auto-fix for 20 rules, and a printed plan for the 10 that need choreography',
  'CLI, GitHub Action with pull request comments, SARIF, MCP server, VS Code extension',
  'Unlimited runs, offline, with no account and no telemetry',
  'MIT licensed, so every rule is readable and forkable',
];

const POLICY_YAML = `# .migrationpilotrc.yml
pgVersion: 17
failOn: critical

policy:
  requiredRules: [MP001, MP004, MP030]
  severityFloor: warning
  blockedPatterns:
    - "DROP TABLE"
    - "TRUNCATE"

auditLog:
  enabled: true
  path: ./migrationpilot-audit.jsonl`;

const CI_OUTPUT = `C:\\acme-api\\migrations\\003_orders_amount_check.sql:1: [MP004] CRITICAL: DDL statement acquires ACCESS EXCLUSIVE lock without a preceding SET lock_timeout. Without a timeout, this statement could block the lock queue indefinitely if it can't acquire the lock, causing cascading query failures.
C:\\acme-api\\migrations\\003_orders_amount_check.sql:1: [MP030] CRITICAL: CHECK constraint "orders_amount_positive" on "orders" without NOT VALID scans the entire table under ACCESS EXCLUSIVE lock, blocking all reads and writes.`;

const AUDIT_LINE = `{"event":"analysis_complete","command":"analyze","file":"C:\\\\acme-api\\\\migrations\\\\003_orders_amount_check.sql","riskLevel":"YELLOW","riskScore":40,"violationCount":2,"exitCode":2,"metadata":{"reversibility":"GREEN"},"timestamp":"2026-08-12T03:29:45.759Z","user":"micke","ci":false}`;

const FAQS = [
  {
    q: 'Which rules are behind the paywall?',
    a: 'None. All 112 are free. 97 of them work from the migration file alone; the other 15 read table sizes, write traffic, replication state and index definitions, so they need --database-url and stay silent without it. There is no rule count held back and no analysis quota. If MigrationPilot can find a problem, the free version finds it.',
  },
  {
    q: 'Then what does $499 buy?',
    a: 'Enforcement and evidence, not detection. A policy block in the repository config that the CLI applies and a developer cannot switch off, a severity floor that stops rules being downgraded quietly, patterns that are refused outright, and an append-only record of every run. If nobody has ever asked you to prove your migrations are governed, you do not need this.',
  },
  {
    q: 'Is it per seat?',
    a: 'No. $499 a year covers the organization. Pricing changes are announced in the changelog before they take effect.',
  },
  {
    q: 'Do you see my SQL?',
    a: 'No. Analysis happens in your process, on your machine or your runner. The browser playground compiles the same PostgreSQL parser to WebAssembly and analyses in the tab, so even there nothing is uploaded. The only request MigrationPilot makes is an optional license key check, which sends the key and nothing else.',
  },
];

export default function PricingPage() {
  return (
    <>
      <Navbar active="pricing" />
      <main className="pt-14">
        <section className="pb-4 pt-16 md:pt-20">
          <div className="mp-container">
            <h1 className="max-w-2xl text-[32px] font-semibold leading-[1.15] tracking-tight text-fg sm:text-[40px]">
              The linter is free. The proof costs money.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted">
              Every rule, every fix and every integration is free forever, with no account and no
              quota. There is one paid plan, and it exists for a different question than
              &ldquo;does this migration have a problem&rdquo;.
            </p>
          </div>
        </section>

        <Section bordered={false} className="pt-10">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col rounded-xl border border-line bg-surface p-6">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-lg font-medium text-fg">Free</h2>
                <p className="font-mono text-base text-muted">$0</p>
              </div>
              <p className="mt-2 text-sm text-faint">The whole engine, for everyone.</p>
              <ul className="mt-6 flex-1 space-y-3">
                {FREE_INCLUDES.map((item) => (
                  <li key={item} className="text-sm leading-relaxed text-muted">
                    {item}
                  </li>
                ))}
              </ul>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <ButtonLink href="/docs/quick-start" variant="secondary">
                  Quick start
                </ButtonLink>
                <a
                  href="/playground"
                  className="text-sm text-accent transition-colors hover:text-accent-hover"
                >
                  Try it in your browser
                </a>
              </div>
            </div>

            <div className="flex flex-col rounded-xl border border-accent/35 bg-surface p-6">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-lg font-medium text-fg">Org</h2>
                <p className="font-mono text-base text-accent">$499 / year</p>
              </div>
              <p className="mt-2 text-sm text-faint">
                Per organization, not per seat.
              </p>
              <p className="mt-6 flex-1 text-sm leading-relaxed text-muted">
                The $499/year Org plan turns the free linter into an enforceable control: one
                policy across repositories that developers cannot quietly disable, a JSONL audit
                trail of every check, and direct support from the maintainer.
              </p>
              <div className="mt-8">
                <ButtonLink href={ORG_CTA}>Talk to us</ButtonLink>
              </div>
            </div>
          </div>

          <p className="mt-6 max-w-3xl text-[13px] leading-relaxed text-muted">
            Every clause of that sentence is something the tool does today, and the three artifacts
            below are what each one produces. There is no waiting list and no beta.
          </p>
        </Section>

        <Section>
          <SectionHeading
            title="What it actually produces"
            lead="Three artifacts, all generated by running the tool. Nothing here is a mockup."
            className="mb-10"
          />

          <div className="space-y-12">
            <Artifact
              title="The policy the CLI enforces"
              body="A block in the repository config. Required rules cannot be disabled by config or by an inline disable comment, the severity floor stops a critical being quietly downgraded to a warning, and blocked patterns fail the run outright."
            >
              <CodeBlock title=".migrationpilotrc.yml" code={POLICY_YAML} />
            </Artifact>

            <Artifact
              title="The merge that does not happen"
              body="The same run in CI, in the compact format. Two critical findings, so the process exits 2 and the required check fails. The Action posts the full report on the pull request as well."
            >
              <CodeBlock
                title="$ migrationpilot analyze migrations/ --quiet"
                code={CI_OUTPUT}
                maxHeight={220}
              />
            </Artifact>

            <Artifact
              title="The record an auditor reads"
              body="One JSON object appended per run, with the file, the verdict, the count and the exit code. It is a plain file: ship it to your log pipeline, keep it in the repo, or both."
            >
              <CodeBlock title="migrationpilot-audit.jsonl" code={AUDIT_LINE} />
            </Artifact>
          </div>
        </Section>

        <Section>
          <div className="max-w-2xl">
            <h2 className="text-xl font-semibold text-fg">Procurement, air-gapped networks, and the rest</h2>
            <p className="mt-4 text-[15px] leading-relaxed text-muted">
              There is no third tier, because the answers do not depend on one. MigrationPilot is an
              MIT-licensed npm package and a Docker image that runs offline with{' '}
              <code className="font-mono text-[13px] text-fg">--offline</code>: no outbound calls,
              no license server in the request path, nothing to allow through a firewall. It holds
              no data of yours, so a data processing agreement has nothing to cover. If your review
              needs something in writing, email{' '}
              <a
                href="mailto:hello@migrationpilot.dev"
                className="text-accent transition-colors hover:text-accent-hover"
              >
                hello@migrationpilot.dev
              </a>{' '}
              and you will get a straight answer, including when the answer is no.
            </p>
          </div>
        </Section>

        <Section>
          <SectionHeading title="Questions people actually ask" className="mb-10" />
          <dl className="grid gap-8 md:grid-cols-2">
            {FAQS.map((faq) => (
              <div key={faq.q}>
                <dt className="text-[15px] font-medium text-fg">{faq.q}</dt>
                <dd className="mt-2 text-sm leading-relaxed text-muted">{faq.a}</dd>
              </div>
            ))}
          </dl>
        </Section>
      </main>
      <Footer />
    </>
  );
}

function Artifact({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:gap-10">
      <div className="min-w-0">
        <h3 className="text-[15px] font-medium text-fg">{title}</h3>
        <p className="mt-3 text-sm leading-relaxed text-muted">{body}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
