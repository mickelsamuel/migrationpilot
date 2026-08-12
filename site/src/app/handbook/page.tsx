import type { Metadata } from 'next';
import Navbar from '@/components/navbar';
import { Footer } from '@/components/footer';
import { HandbookInline } from '@/components/handbook-markdown';
import { getHandbookEntries, getHandbookGroups } from '@/lib/handbook';

const REPO = 'https://github.com/mickelsamuel/migrationpilot';

const entries = getHandbookEntries();
const groups = getHandbookGroups();
const incidentCount = entries.reduce((total, entry) => total + entry.incidents.length, 0);
const highConfidence = entries.filter((entry) => entry.confidence === 'High').length;
const lastVerified = entries.map((entry) => entry.lastVerified).sort().at(-1)!;

export const metadata: Metadata = {
  title: 'The Postgres Migration Safety Handbook — MigrationPilot',
  description: `A reference for the schema changes that take production down. ${entries.length} entries, each with the lock it takes, a lab you can run in under two minutes, and ${incidentCount} dated public incidents. Framework-neutral.`,
  alternates: { canonical: '/handbook' },
};

/** The evidence standard, in the handbook's own headings. */
const STANDARD = [
  ['Version claims are pinned to release notes.', 'Not "recent versions of Postgres".'],
  ['Lock claims are pinned to the manual.', 'Not to another blog post.'],
  ['Every entry has a lab you can run.', 'Real Docker, real output, under two minutes.'],
  ['Incidents are real, dated, and fetched.', 'Or the entry says none was found.'],
  ['Confidence is graded, not implied.', 'High or Medium. There is no Low.'],
];

/** `</script>` inside a JSON-LD payload would close the tag early. */
function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

export default function HandbookIndexPage() {
  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'The Postgres Migration Safety Handbook',
    numberOfItems: entries.length,
    itemListElement: entries.map((entry, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: entry.title,
      url: `https://migrationpilot.dev/handbook/${entry.slug}`,
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(itemListJsonLd) }}
      />
      <Navbar />
      <main className="pt-14">
        <section className="pb-2 pt-16 md:pt-20">
          <div className="mp-container">
            <p className="mb-4 font-mono text-xs uppercase tracking-[0.14em] text-faint">
              Handbook
            </p>
            <h1 className="max-w-3xl text-[32px] font-semibold leading-[1.15] tracking-tight text-fg sm:text-[40px]">
              The Postgres Migration Safety Handbook
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted">
              A reference for the schema changes that take production down. Every entry names the
              lock a statement takes, cites the manual for it, and ends with a lab you can run
              against a throwaway PostgreSQL in under two minutes.
            </p>
            <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted">
              It is framework-neutral — Rails, Django, Alembic, Flyway, Liquibase, Prisma, Ecto,
              sqlx or hand-written <code className="font-mono text-[14px] text-fg">.sql</code> makes
              no difference to what PostgreSQL locks. It is written by the people who build
              MigrationPilot, but it is not a product manual: each entry ends with a note on which
              rule catches the problem, and you can skip that section and still get everything else.
            </p>

            <dl className="mt-8 grid max-w-2xl grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line-soft sm:grid-cols-4">
              <Stat value={String(entries.length)} label="entries" />
              <Stat value={String(incidentCount)} label="dated public incidents" />
              <Stat value={`${highConfidence}/${entries.length}`} label="graded High" />
              <Stat value={lastVerified} label="last verified" />
            </dl>
          </div>
        </section>

        <section className="py-10">
          <div className="mp-container">
            {/* Cite an entry, not the handbook: the entry is what has the lab in it. */}
            <div className="space-y-14">
              {groups.map((group) => (
                <section key={group.title}>
                  <h2 className="text-base font-medium text-fg">{group.title}</h2>
                  <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-muted">
                    {group.blurb}
                  </p>

                  <ul className="mt-4 overflow-hidden rounded-xl border border-line">
                    {group.entries.map((entry) => (
                      <li key={entry.slug} className="border-b border-line-soft last:border-b-0">
                        <a
                          href={`/handbook/${entry.slug}`}
                          className="block bg-surface px-4 py-4 transition-colors hover:bg-raised"
                        >
                          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
                            <span className="font-mono text-xs text-accent">{entry.number}</span>
                            <span className="text-[15px] font-medium text-fg">{entry.title}</span>
                            {/* Wraps rather than shrinking: the longest lock mode
                                is 76 characters and would otherwise run off a
                                phone screen. */}
                            <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                              <span
                                className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase ${
                                  entry.severity === 'critical'
                                    ? 'border-danger/40 bg-danger-soft text-danger'
                                    : 'border-warn/40 bg-warn-soft text-warn'
                                }`}
                              >
                                {entry.severity}
                              </span>
                              <span className="min-w-0 break-words rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-muted">
                                {entry.lockMode}
                              </span>
                            </span>
                          </div>
                          <p className="mt-1.5 max-w-[68ch] text-[13px] leading-relaxed text-muted">
                            <HandbookInline nodes={entry.hook} />
                          </p>
                        </a>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-line-soft py-14">
          <div className="mp-container">
            <h2 className="text-base font-medium text-fg">The evidence standard</h2>
            <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-muted">
              Most writing about unsafe migrations is a chain of blog posts citing blog posts.
              Behaviour changes between major versions; the posts do not. These are the rules every
              entry here is held to.
            </p>

            <ol className="mt-5 grid max-w-3xl gap-px overflow-hidden rounded-xl border border-line bg-line-soft sm:grid-cols-2">
              {STANDARD.map(([claim, detail], index) => (
                <li
                  key={claim}
                  // An odd count would otherwise leave the last cell of the
                  // two-column grid empty, which reads as a missing rule.
                  className={`bg-surface px-5 py-4 ${
                    index === STANDARD.length - 1 && STANDARD.length % 2 === 1 ? 'sm:col-span-2' : ''
                  }`}
                >
                  <p className="text-[13px] font-medium text-fg">
                    <span className="mr-2 font-mono text-faint">{index + 1}</span>
                    {claim}
                  </p>
                  <p className="mt-1 text-[13px] leading-relaxed text-muted">{detail}</p>
                </li>
              ))}
            </ol>

            <p className="mt-6 max-w-2xl text-[13px] leading-relaxed text-muted">
              Where no public postmortem could be found, the entry says so rather than inventing a
              plausible story. No incident here is composited or inferred. The markdown behind these
              pages lives in{' '}
              <a
                href={`${REPO}/tree/main/docs/handbook`}
                className="text-accent transition-colors hover:text-accent-hover"
              >
                docs/handbook
              </a>
              , and{' '}
              <code className="font-mono text-[13px] text-fg">node docs/handbook/validate.mjs</code>{' '}
              checks every entry against the standard above.
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="bg-surface px-5 py-4">
      <dt className="font-mono text-xl tabular-nums text-fg">{value}</dt>
      <dd className="mt-1 text-[13px] leading-snug text-muted">{label}</dd>
    </div>
  );
}
