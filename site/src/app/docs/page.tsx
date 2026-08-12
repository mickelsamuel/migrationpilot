import type { Metadata } from 'next';
import Navbar from '@/components/navbar';
import { Footer } from '@/components/footer';
import { CommandBlock } from '@/components/code-block';
import { docs } from './docs-data';
import { frameworks } from './framework-data';
import { providers } from './provider-data';
import { rules } from '../rule-data';

export const metadata: Metadata = {
  title: 'Documentation: MigrationPilot',
  description:
    'MigrationPilot documentation: quick start, configuration, CI integration, the CLI reference, guides for every supported migration framework and PostgreSQL provider, and the Migration Safety Handbook.',
  alternates: { canonical: '/docs' },
};

const autoFixable = rules.filter((rule) => rule.autoFixable).length;
const needsDatabase = rules.filter((rule) => rule.requiresDatabaseUrl).length;

export default function DocsIndex() {
  return (
    <>
      <Navbar active="docs" />
      <main className="pt-14">
        <section className="mp-container pb-4 pt-16 md:pt-20">
          <h1 className="max-w-2xl text-[32px] font-semibold leading-[1.15] tracking-tight text-fg sm:text-[40px]">
            Documentation
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted">
            Install it, point it at a migration, read what comes back. Everything below is free and
            runs offline, and none of it needs an account.
          </p>
          <CommandBlock command="npx migrationpilot analyze migrations/" className="mt-8" />
        </section>

        <Group title="Getting started" lead="Six pages, in the order most people need them.">
          {docs.map((doc) => (
            <DocCard
              key={doc.slug}
              href={`/docs/${doc.slug}`}
              title={doc.title}
              body={doc.description}
            />
          ))}
        </Group>

        <Group
          title="The rules"
          lead={`All ${rules.length} of them, with the SQL that trips each one and the safe rewrite. ${autoFixable} carry an auto-fix. ${needsDatabase} read production context from a live database and stay silent without one.`}
        >
          <DocCard
            href="/rules"
            title="Rule catalogue"
            body="Every rule with its severity, the lock it warns about, before-and-after SQL, and whether --fix can apply it for you."
          />
          <DocCard
            href="/docs/rules"
            title="Rules at a glance"
            body="The same catalogue as one dense table, grouped by category. The page to open when you already know the rule ID."
          />
          <DocCard
            href="/handbook"
            title="Migration Safety Handbook"
            body="Twenty chapters on why these changes hurt, each measured against a real PostgreSQL rather than argued from the manual."
          />
        </Group>

        <Group
          title="Framework guides"
          lead="Where your tool writes its migrations, and the CI step that checks them."
        >
          {frameworks.map((framework) => (
            <DocCard
              key={framework.slug}
              href={`/docs/frameworks/${framework.slug}`}
              title={framework.name}
              eyebrow={framework.language}
              body={framework.description}
            />
          ))}
        </Group>

        <Group
          title="Provider guides"
          lead={`How to connect, and what to watch for, when the ${needsDatabase} production-context rules read your catalog.`}
          last
        >
          {providers.map((provider) => (
            <DocCard
              key={provider.slug}
              href={`/docs/providers/${provider.slug}`}
              title={provider.name}
              body={provider.description}
            />
          ))}
        </Group>
      </main>
      <Footer />
    </>
  );
}

function Group({
  title,
  lead,
  children,
  last,
}: {
  title: string;
  lead: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <section className={`py-12 md:py-16 ${last ? '' : 'border-b border-line-soft'}`}>
      <div className="mp-container">
        <h2 className="text-xl font-semibold text-fg">{title}</h2>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted">{lead}</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
      </div>
    </section>
  );
}

function DocCard({
  href,
  title,
  eyebrow,
  body,
}: {
  href: string;
  title: string;
  eyebrow?: string;
  body: string;
}) {
  return (
    <a
      href={href}
      className="flex flex-col rounded-xl border border-line bg-surface p-5 transition-colors duration-150 hover:border-faint"
    >
      {eyebrow && (
        <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.12em] text-faint">
          {eyebrow}
        </p>
      )}
      <h3 className="text-[15px] font-medium text-fg">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
    </a>
  );
}
