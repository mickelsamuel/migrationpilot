import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Navbar from '@/components/navbar';
import { Footer } from '@/components/footer';
import { CodeBlock } from '@/components/code-block';
import { getHandbookEntries, toPlainText, type Block, type Inline } from '@/lib/handbook';
import {
  cliFindingByRuleId,
  impactLabels,
  mitigationOnlyRuleIds,
  operationLabels,
  parserLimitedRuleIds,
  remediationLabels,
  relatedRulesByRuleId,
  ruleCatalog,
  type RuleCatalogEntry,
} from '../../rule-data';

const REPO = 'https://github.com/mickelsamuel/migrationpilot';
const SITE = 'https://migrationpilot.dev';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateStaticParams() {
  return ruleCatalog.map((rule) => ({ id: rule.id.toLowerCase() }));
}

function findRule(id: string): RuleCatalogEntry | undefined {
  return ruleCatalog.find((rule) => rule.id.toLowerCase() === id.toLowerCase());
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const rule = findRule(id);
  if (!rule) return { title: 'Rule not found: MigrationPilot' };

  return {
    title: `${rule.id} ${rule.name}: what it catches and why`,
    description: `${rule.description} ${rule.lockDetail}`.slice(0, 300),
    alternates: { canonical: `/rules/${rule.id.toLowerCase()}` },
  };
}

export default async function RulePage({ params }: PageProps) {
  const { id } = await params;
  const rule = findRule(id);
  if (!rule) notFound();

  const mitigationOnly = mitigationOnlyRuleIds.includes(rule.id);
  const parserLimited = parserLimitedRuleIds.includes(rule.id);
  // The handbook's own front matter says which rules each chapter covers, so
  // the citation follows the chapter rather than a list kept alongside it.
  const chapters = getHandbookEntries().filter((entry) => entry.ruleIds.includes(rule.id));
  const related = relatedRulesByRuleId[rule.id] ?? [];
  const finding = cliFindingByRuleId[rule.id];
  const playgroundHref = `/playground?sql=${encodeURIComponent(rule.badExample)}${
    rule.pgMin ? `&pg=${rule.pgMin}` : ''
  }`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: `${rule.id}: ${rule.name}`,
    description: rule.description,
    articleSection: rule.category,
    url: `${SITE}/rules/${rule.id.toLowerCase()}`,
    isPartOf: { '@type': 'CollectionPage', name: 'MigrationPilot rules', url: `${SITE}/rules` },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Navbar active="rules" />

      <main className="pt-14">
        <article className="mp-container max-w-4xl pb-24 pt-12 md:pt-16">
          <nav aria-label="Breadcrumb" className="mb-8 font-mono text-xs text-faint">
            <a href="/rules" className="transition-colors hover:text-fg">
              rules
            </a>
            <span className="px-2">/</span>
            <span className="text-muted">{rule.id.toLowerCase()}</span>
          </nav>

          <header>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm text-accent">{rule.id}</span>
              <Badge tone={rule.severity === 'critical' ? 'danger' : 'warn'}>{rule.severity}</Badge>
              {rule.autoFixable && <Badge tone="ok">auto-fix</Badge>}
              {rule.requiresDatabaseUrl && <Badge>needs database</Badge>}
              {rule.pgMin && <Badge>PG {rule.pgMin}+</Badge>}
              {rule.pgMax && <Badge>up to PG {rule.pgMax}</Badge>}
              {rule.extension && <Badge>{rule.extension}</Badge>}
            </div>

            <h1 className="mt-4 font-mono text-[26px] font-semibold leading-tight tracking-tight text-fg sm:text-[32px]">
              {rule.name}
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">
              {rule.description}
            </p>
          </header>

          {/* The spec sheet: the facets, before any prose. */}
          <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line-soft sm:grid-cols-4">
            <Spec label="operation" value={operationLabels[rule.operation]} />
            <Spec label="lock taken" value={rule.lock === 'none' ? 'no table lock' : rule.lock} mono />
            <Spec label="remediation" value={remediationLabels[rule.remediation]} />
            <Spec label="category" value={rule.category} />
          </dl>

          {rule.impacts.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2">
              {rule.impacts.map((impact) => (
                <li
                  key={impact}
                  className="rounded border border-line px-2 py-1 font-mono text-[11px] text-muted"
                >
                  {impactLabels[impact]}
                </li>
              ))}
            </ul>
          )}

          {parserLimited && <ParserLimitation id={rule.id} />}

          <Section title="What triggers it">
            <Prose>{rule.triggersOn}</Prose>
          </Section>

          <Section title="What does not">
            <Prose>{rule.doesNotTriggerOn}</Prose>
          </Section>

          <Section title="Where it applies">
            <Prose>{applicabilityText(rule)}</Prose>
            {rule.applicabilityNote && (
              <p className="mt-3 text-[15px] leading-relaxed text-muted">
                {renderInline(rule.applicabilityNote)}
              </p>
            )}
          </Section>

          <Section title="The lock, and what it blocks">
            <Prose>{rule.lockDetail}</Prose>
          </Section>

          <Section title="Why it matters">
            <Prose>{rule.whyItMatters}</Prose>
          </Section>

          <Section title={mitigationOnly ? 'The operation, and the mitigation' : 'Unsafe, and safe'}>
            {/* min-w-0: without it the grid tracks size to the widest SQL line
                and the whole page scrolls sideways on a phone. */}
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="min-w-0">
                <p className="mb-2 font-mono text-xs uppercase tracking-wide text-danger">
                  Flagged
                </p>
                <CodeBlock code={rule.badExample} language="sql" />
              </div>
              <div className="min-w-0">
                <p
                  className={`mb-2 font-mono text-xs uppercase tracking-wide ${
                    mitigationOnly ? 'text-warn' : 'text-ok'
                  }`}
                >
                  {mitigationOnly ? 'Mitigated — still flagged' : 'Safe alternative'}
                </p>
                <CodeBlock code={rule.goodExample} language="sql" />
              </div>
            </div>

            {mitigationOnly && (
              <p className="mt-4 rounded-lg border border-warn/30 bg-warn-soft px-4 py-3 text-[14px] leading-relaxed text-muted">
                This operation is irreversible, so there is no syntax that makes it safe. The
                second block is what care looks like — and MigrationPilot still flags it. The
                mitigation is process: confirm nothing reads the object, keep a way back, and do it
                in a window where you can watch.
              </p>
            )}
          </Section>

          {rule.deployNote && (
            <Section title="Deploy and transaction boundaries">
              <Prose>{rule.deployNote}</Prose>
            </Section>
          )}

          <Section title="What it assumes">
            <Prose>{rule.assumptions}</Prose>
            {rule.requiresDatabaseUrl && (
              <p className="mt-3 text-[15px] leading-relaxed text-muted">
                This rule reads live catalogue state, so it says nothing at all without{' '}
                <code className="font-mono text-[14px] text-fg">--database-url</code>. That is the
                trade: no connection, no guess.
              </p>
            )}
          </Section>

          {chapters.length > 0 && (
            <Section title="What backs this rule">
              <p className="mb-5 max-w-2xl text-[15px] leading-relaxed text-muted">
                Every rule is a claim about PostgreSQL, so it carries what the claim rests on: a
                handbook chapter that cites the manual, the incidents that put it there, and the
                version it was last checked against.
              </p>

              <div className="space-y-5">
                {chapters.map((chapter) => {
                  const manual = manualCitations(chapter.blocks);
                  return (
                    <div key={chapter.slug} className="rounded-xl border border-line bg-surface p-5">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span className="font-mono text-xs text-faint">{chapter.id}</span>
                        <a
                          href={`/handbook/${chapter.slug}`}
                          className="text-[15px] text-accent transition-colors hover:text-accent-hover"
                        >
                          {chapter.title}
                        </a>
                      </div>
                      <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted">
                        {chapter.hookText}
                      </p>

                      <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 font-mono text-[11px] text-faint">
                        <div>
                          <dt className="inline">verified against </dt>
                          <dd className="inline text-muted">{chapter.verifiedAgainst}</dd>
                        </div>
                        <div>
                          <dt className="inline">last checked </dt>
                          <dd className="inline text-muted">{chapter.lastVerified}</dd>
                        </div>
                        <div>
                          <dt className="inline">confidence </dt>
                          <dd className="inline text-muted">{chapter.confidence}</dd>
                        </div>
                      </dl>

                      {manual.length > 0 && (
                        <div className="mt-4">
                          <p className="text-[11px] uppercase tracking-wide text-faint">
                            PostgreSQL manual
                          </p>
                          <ul className="mt-2 space-y-1">
                            {manual.map((link) => (
                              <li key={link.href}>
                                <a
                                  href={link.href}
                                  className="text-[14px] text-accent transition-colors hover:text-accent-hover"
                                >
                                  {link.label}
                                </a>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {chapter.incidents.length > 0 && (
                        <div className="mt-4">
                          <p className="text-[11px] uppercase tracking-wide text-faint">
                            Public incidents and write-ups
                          </p>
                          <ul className="mt-2 space-y-1">
                            {chapter.incidents.map((incident) => (
                              <li key={incident.url} className="text-[14px] leading-relaxed">
                                <a
                                  href={incident.url}
                                  className="text-accent transition-colors hover:text-accent-hover"
                                >
                                  {incident.name}
                                </a>
                                <span className="ml-2 font-mono text-[11px] text-faint">
                                  {incident.date}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          <Section title="What the CLI prints">
            {finding ? (
              <>
                <CodeBlock
                  code={finding}
                  title={`migrationpilot analyze migration.sql${
                    rule.pgMin ? ` --pg-version ${rule.pgMin}` : ''
                  }${rule.requiresDatabaseUrl ? ' --database-url $DATABASE_URL' : ''}`}
                  language="plain"
                  wrap
                />
                <p className="mt-3 text-[13px] leading-relaxed text-faint">
                  Generated by running the CLI&apos;s own formatter over the flagged example above,
                  so it is the text the tool actually produces. A real run also reports the other
                  rules that fire on the same statement; those blocks are left out here.
                  {rule.requiresDatabaseUrl &&
                    ' The catalogue figures come from the production context this rule documents.'}
                </p>
              </>
            ) : (
              <p className="text-[15px] leading-relaxed text-muted">
                No sample output: the flagged example uses PostgreSQL 18 syntax the bundled parser
                cannot read yet, so the CLI reports a parse error rather than this finding. See the
                limitation above.
              </p>
            )}
          </Section>

          <Section title="Turning it off">
            <p className="text-[15px] leading-relaxed text-muted">
              For one statement, put a comment on the line before it:
            </p>
            <div className="mt-3">
              <CodeBlock
                code={`-- migrationpilot-disable ${rule.id}\n${firstLine(rule.badExample)}`}
                language="sql"
              />
            </div>
            <p className="mt-5 text-[15px] leading-relaxed text-muted">
              For the whole project, in{' '}
              <code className="font-mono text-[14px] text-fg">.migrationpilotrc.yml</code> — by
              name or by id:
            </p>
            <div className="mt-3">
              <CodeBlock
                code={`rules:\n  ${rule.id}: false\n\n# or keep it, and downgrade it\nrules:\n  ${rule.id}:\n    severity: warning`}
                language="plain"
                title=".migrationpilotrc.yml"
              />
            </div>
          </Section>

          <Section title="Try it">
            <p className="text-[15px] leading-relaxed text-muted">
              Open this rule&apos;s flagged example in the playground. It runs in your browser —
              edit it and watch the finding appear and disappear.
            </p>
            <a
              href={playgroundHref}
              className="mt-4 inline-flex h-11 items-center rounded-lg bg-accent px-5 font-medium text-accent-ink transition-colors hover:bg-accent-hover"
            >
              Run {rule.id} in the playground
            </a>
          </Section>

          {related.length > 0 && (
            <Section title="Related rules">
              <ul className="overflow-hidden rounded-xl border border-line">
                {related.map((sibling) => (
                  <li key={sibling.id} className="border-b border-line-soft last:border-b-0">
                    <a
                      href={`/rules/${sibling.id.toLowerCase()}`}
                      className="flex flex-wrap items-baseline gap-x-3 gap-y-1 bg-surface px-4 py-3 transition-colors hover:bg-raised"
                    >
                      <span className="font-mono text-xs text-accent">{sibling.id}</span>
                      <span className="font-mono text-[13px] text-fg">{sibling.name}</span>
                      <span className="w-full text-[13px] text-muted lg:w-auto lg:flex-1">
                        {sibling.note}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <div className="mt-14 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line-soft pt-6 text-[13px]">
            <a href="/rules" className="text-muted transition-colors hover:text-fg">
              &larr; All rules
            </a>
            <a
              href={`${REPO}/blob/main/docs/rules/${rule.id}.md`}
              className="text-muted transition-colors hover:text-fg"
            >
              This rule&apos;s doc
            </a>
            <a
              href={`${REPO}/blob/main/src/rules`}
              className="text-muted transition-colors hover:text-fg"
            >
              Rule source
            </a>
          </div>
        </article>
      </main>
      <Footer />
    </>
  );
}

/**
 * The postgresql.org pages a handbook chapter cites, in the order it cites them.
 * Pulled out of the parsed chapter rather than listed here, so a rule page can
 * never claim a manual reference the handbook does not actually make.
 */
function manualCitations(blocks: Block[]): { href: string; label: string }[] {
  const found = new Map<string, string>();

  const walkInline = (nodes: Inline[]) => {
    for (const node of nodes) {
      if (node.kind === 'link') {
        if (node.href.includes('postgresql.org') && !found.has(node.href)) {
          found.set(node.href, toPlainText(node.children));
        }
        walkInline(node.children);
      } else if (node.kind === 'strong' || node.kind === 'em') {
        walkInline(node.children);
      }
    }
  };

  const walkBlocks = (list: Block[]) => {
    for (const block of list) {
      switch (block.kind) {
        case 'heading':
        case 'paragraph':
          walkInline(block.children);
          break;
        case 'quote':
          walkBlocks(block.children);
          break;
        case 'list':
          for (const item of block.items) walkBlocks(item);
          break;
        case 'table':
          for (const cell of block.head) walkInline(cell);
          for (const row of block.rows) for (const cell of row) walkInline(cell);
          break;
      }
    }
  };

  walkBlocks(blocks);
  return [...found].map(([href, label]) => ({ href, label }));
}

/** The version and connection story, assembled from the structured fields. */
function applicabilityText(rule: RuleCatalogEntry): string {
  const parts: string[] = [];

  if (rule.pgMin && rule.pgMax) {
    parts.push(`Applies to PostgreSQL ${rule.pgMin} through ${rule.pgMax}.`);
  } else if (rule.pgMin) {
    parts.push(`Applies to PostgreSQL ${rule.pgMin} and later.`);
  } else if (rule.pgMax) {
    parts.push(`Applies up to PostgreSQL ${rule.pgMax}; later versions do not need it.`);
  } else {
    parts.push('Applies to every PostgreSQL version MigrationPilot targets.');
  }

  if (rule.extension) parts.push(`It only fires on tables managed by ${rule.extension}.`);

  parts.push(
    rule.requiresDatabaseUrl
      ? 'It needs `--database-url`: without a connection it has nothing to read and stays silent.'
      : 'It works on the SQL text alone — no database connection needed.',
  );

  return parts.join(' ');
}

function firstLine(sql: string): string {
  const line = sql.split('\n').find((l) => l.trim() && !l.trim().startsWith('--'));
  return line ?? sql.split('\n')[0];
}

/** Renders `backticked` spans as code. The facet prose is written with them. */
function renderInline(text: string) {
  return text.split(/(`[^`]+`)/g).map((part, i) =>
    part.startsWith('`') && part.endsWith('`') ? (
      <code key={i} className="font-mono text-[0.92em] text-fg">
        {part.slice(1, -1)}
      </code>
    ) : (
      part
    ),
  );
}

function Prose({ children }: { children: string }) {
  return <p className="max-w-2xl text-[15px] leading-relaxed text-muted">{renderInline(children)}</p>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="mb-4 text-base font-medium text-fg">{title}</h2>
      {children}
    </section>
  );
}

function Spec({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="bg-surface px-4 py-3">
      <dt className="font-mono text-[10px] uppercase tracking-wide text-faint">{label}</dt>
      <dd className={`mt-1 text-[13px] leading-snug text-fg ${mono ? 'font-mono' : ''}`}>
        {value}
      </dd>
    </div>
  );
}

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: 'danger' | 'warn' | 'ok';
}) {
  const tones = {
    danger: 'border-danger/40 bg-danger-soft text-danger',
    warn: 'border-warn/40 bg-warn-soft text-warn',
    ok: 'border-ok/40 bg-ok-soft text-ok',
  };
  return (
    <span
      className={`rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase ${
        tone ? tones[tone] : 'border-line text-muted'
      }`}
    >
      {children}
    </span>
  );
}

/**
 * MP081 and MP082 are about PostgreSQL 18 syntax the bundled parser cannot read
 * yet. Saying so on the page is better than letting someone find out from a
 * parse error.
 */
function ParserLimitation({ id }: { id: string }) {
  return (
    <div className="mt-6 rounded-xl border border-warn/30 bg-warn-soft px-5 py-4">
      <p className="font-mono text-xs uppercase tracking-wide text-warn">Known limitation</p>
      <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted">
        The bundled parser (libpg-query) is built on the PostgreSQL 17 grammar, so the PG18 syntax
        this rule is about —{' '}
        <code className="font-mono text-[13px] text-fg">
          {id === 'MP082' ? 'NOT ENFORCED' : 'ADD CONSTRAINT ... NOT NULL col NOT VALID'}
        </code>{' '}
        — does not parse. A migration written that way is reported as a parse error rather than
        analysed, and this rule cannot fire on it. Upgrading the parser is a tracked fast-follow;
        the PG18 rules shipped in{' '}
        <a href="/changelog" className="text-accent transition-colors hover:text-accent-hover">
          release 1.5.0
        </a>
        .
      </p>
    </div>
  );
}
