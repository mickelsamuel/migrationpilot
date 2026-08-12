import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight } from '@phosphor-icons/react/ssr';
import Navbar from '@/components/navbar';
import { Footer } from '@/components/footer';
import { HandbookMarkdown } from '@/components/handbook-markdown';
import { getHandbookEntries } from '@/lib/handbook';
import { rules } from '../../rule-data';

const BASE = 'https://migrationpilot.dev';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return getHandbookEntries().map((entry) => ({ slug: entry.slug }));
}

// Every entry is a file in the repository, so the slug set is closed. An
// unknown slug is a 404 rather than an on-demand render.
export const dynamicParams = false;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const entry = getHandbookEntries().find((candidate) => candidate.slug === slug);
  if (!entry) return {};

  return {
    title: `${entry.title} — Postgres Migration Safety Handbook`,
    description: entry.hookText,
    alternates: { canonical: `/handbook/${entry.slug}` },
    openGraph: {
      title: entry.title,
      description: entry.hookText,
      url: `${BASE}/handbook/${entry.slug}`,
      type: 'article',
    },
  };
}

/** `</script>` inside a JSON-LD payload would close the tag early. */
function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

export default async function HandbookEntryPage({ params }: PageProps) {
  const { slug } = await params;
  const entries = getHandbookEntries();
  const index = entries.findIndex((candidate) => candidate.slug === slug);
  if (index === -1) notFound();

  const entry = entries[index];
  const previous = entries[index - 1];
  const next = entries[index + 1];
  const relatedRules = entry.ruleIds
    .map((id) => rules.find((rule) => rule.id === id))
    .filter((rule): rule is (typeof rules)[number] => Boolean(rule));

  const structuredData = [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: BASE },
        { '@type': 'ListItem', position: 2, name: 'Handbook', item: `${BASE}/handbook` },
        {
          '@type': 'ListItem',
          position: 3,
          name: entry.title,
          item: `${BASE}/handbook/${entry.slug}`,
        },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'TechArticle',
      headline: entry.title,
      description: entry.hookText,
      dateModified: entry.lastVerified,
      url: `${BASE}/handbook/${entry.slug}`,
      isPartOf: {
        '@type': 'Book',
        name: 'The Postgres Migration Safety Handbook',
        url: `${BASE}/handbook`,
      },
    },
  ];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structuredData) }} />
      <Navbar />
      <main className="pt-14">
        <div className="mp-container pt-10 md:pt-14">
          <a
            href="/handbook"
            className="inline-flex items-center gap-1.5 text-[13px] text-muted transition-colors hover:text-fg"
          >
            <ArrowLeft size={13} />
            Handbook
          </a>
        </div>

        <header className="mp-container pt-6">
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-faint">
            Entry {entry.number} · {entry.id}
          </p>
          <h1 className="mt-3 max-w-3xl text-[30px] font-semibold leading-[1.15] tracking-tight text-fg sm:text-[38px]">
            {entry.title}
          </h1>

          <dl className="mt-8 grid max-w-3xl grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line-soft sm:grid-cols-4">
            <Fact label="Lock mode" value={entry.lockMode} mono />
            <Fact
              label="Severity"
              value={entry.severity}
              tone={entry.severity === 'critical' ? 'danger' : 'warn'}
            />
            <Fact label="Confidence" value={entry.confidence} />
            <Fact label="Verified against" value={entry.verifiedAgainst} />
          </dl>
          <p className="mt-3 text-[13px] text-faint">
            Applies to {entry.pgVersions}. Last verified {entry.lastVerified}.
          </p>
        </header>

        <div className="mp-container pb-4 pt-10">
          <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_13rem] lg:items-start lg:gap-12">
            {/* The contents list comes first in the document so that on a phone
                it sits above the entry it indexes rather than below all of it;
                on a wide screen the explicit placement puts it back in the
                right-hand column, level with the first paragraph. */}
            <aside className="mb-12 lg:sticky lg:top-24 lg:col-start-2 lg:row-start-1 lg:mb-0">
              <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-faint">
                On this page
              </p>
              <ul className="mt-3 space-y-2 border-l border-line-soft">
                {entry.sections.map((section) => (
                  <li key={section.id}>
                    <a
                      href={`#${section.id}`}
                      className="-ml-px block border-l border-transparent pl-3 text-[13px] leading-snug text-muted transition-colors hover:border-accent hover:text-fg"
                    >
                      {section.title}
                    </a>
                  </li>
                ))}
              </ul>
            </aside>

            {/* Prose is capped at a reading measure; code and tables use the
                full column, because a wrapped psql table is unreadable. */}
            <article className="min-w-0 max-w-[46rem] lg:col-start-1 lg:row-start-1 [&>blockquote]:max-w-[68ch] [&>h2]:max-w-[68ch] [&>h3]:max-w-[68ch] [&>ol]:max-w-[68ch] [&>p]:max-w-[68ch] [&>ul]:max-w-[68ch]">
              <HandbookMarkdown blocks={entry.blocks} />

              {relatedRules.length > 0 && (
                <section className="mt-14 border-t border-line-soft pt-10">
                  <h2 className="text-xl font-semibold text-fg sm:text-2xl">Rules on this page</h2>
                  <p className="mt-3 max-w-[68ch] text-[15px] leading-relaxed text-muted">
                    The rule names are what you write in{' '}
                    <code className="rounded border border-line-soft bg-raised px-[0.3em] py-[0.1em] font-mono text-[0.875em] text-fg">
                      .migrationpilotrc.yml
                    </code>
                    .
                  </p>
                  <ul className="mt-5 overflow-hidden rounded-xl border border-line">
                    {relatedRules.map((rule) => (
                      <li key={rule.id} className="border-b border-line-soft last:border-b-0">
                        <a
                          href={`/rules/${rule.id.toLowerCase()}`}
                          className="flex min-h-[52px] flex-wrap items-center gap-x-4 gap-y-1 bg-surface px-4 py-3 transition-colors hover:bg-raised"
                        >
                          <span className="w-14 shrink-0 font-mono text-xs text-accent">
                            {rule.id}
                          </span>
                          <span className="font-mono text-[13px] text-fg">{rule.name}</span>
                          <span
                            className={`rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase ${
                              rule.severity === 'critical'
                                ? 'border-danger/40 bg-danger-soft text-danger'
                                : 'border-warn/40 bg-warn-soft text-warn'
                            }`}
                          >
                            {rule.severity}
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <nav className="mt-14 grid gap-3 border-t border-line-soft pt-8 sm:grid-cols-2">
                {previous ? (
                  <a
                    href={`/handbook/${previous.slug}`}
                    className="group rounded-xl border border-line bg-surface p-4 transition-colors hover:border-faint"
                  >
                    <span className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-faint">
                      <ArrowLeft size={12} />
                      Entry {previous.number}
                    </span>
                    <span className="mt-1.5 block text-[15px] font-medium text-fg">
                      {previous.title}
                    </span>
                  </a>
                ) : (
                  <span />
                )}
                {next && (
                  <a
                    href={`/handbook/${next.slug}`}
                    className="group rounded-xl border border-line bg-surface p-4 transition-colors hover:border-faint sm:text-right"
                  >
                    <span className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-faint sm:justify-end">
                      Entry {next.number}
                      <ArrowRight size={12} />
                    </span>
                    <span className="mt-1.5 block text-[15px] font-medium text-fg">
                      {next.title}
                    </span>
                  </a>
                )}
              </nav>
            </article>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

function Fact({
  label,
  value,
  mono,
  tone,
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: 'danger' | 'warn';
}) {
  return (
    <div className="bg-surface px-5 py-4">
      <dt className="text-[11px] uppercase tracking-[0.1em] text-faint">{label}</dt>
      <dd
        className={`mt-1.5 text-[13px] leading-snug ${mono ? 'font-mono' : ''} ${
          tone === 'danger' ? 'text-danger' : tone === 'warn' ? 'text-warn' : 'text-fg'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
