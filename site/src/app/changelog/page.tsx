import type { Metadata } from 'next';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactNode } from 'react';
import Navbar from '@/components/navbar';
import { Footer } from '@/components/footer';

export const metadata: Metadata = {
  title: 'Changelog: MigrationPilot',
  description:
    'Every MigrationPilot release: new PostgreSQL safety rules, auto-fixes, integrations, and security fixes, newest first.',
  alternates: {
    canonical: '/changelog',
  },
  openGraph: {
    title: 'Changelog: MigrationPilot',
    description:
      'Every MigrationPilot release: new PostgreSQL safety rules, auto-fixes, integrations, and security fixes.',
    url: 'https://migrationpilot.dev/changelog',
  },
};

const GITHUB_CHANGELOG =
  'https://github.com/mickelsamuel/migrationpilot/blob/main/CHANGELOG.md';

function readChangelog(): string {
  // CHANGELOG.md lives at the repo root; the Next build runs from site/.
  return readFileSync(join(process.cwd(), '..', 'CHANGELOG.md'), 'utf8');
}

/**
 * Renders the inline markdown the changelog actually uses: `code`, **bold**,
 * and [text](url). Deliberately small: this is not a general markdown parser.
 * Bold recurses, because the file writes **`command`** and a reader should get
 * a code chip there rather than two stray backticks.
 */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const pattern = /(`[^`]+`)|(\*\*.+?\*\*)|(\[[^\]]+\]\([^)]+\))/g;
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    const key = `${keyPrefix}-${i++}`;

    if (token.startsWith('`')) {
      nodes.push(
        <code
          key={key}
          className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.85em] text-fg"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith('**')) {
      nodes.push(
        <strong key={key} className="font-semibold text-fg">
          {renderInline(token.slice(2, -2), key)}
        </strong>,
      );
    } else {
      const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      if (linkMatch) {
        nodes.push(
          <a
            key={key}
            href={linkMatch[2]}
            className="text-accent transition-colors hover:text-accent-hover"
          >
            {linkMatch[1]}
          </a>,
        );
      } else {
        nodes.push(token);
      }
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}

type Block =
  | { kind: 'release'; version: string; date: string }
  | { kind: 'section'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'paragraph'; text: string };

/** `[1.6.0]: https://github.com/...` — a reference definition, not content. */
const LINK_DEFINITION = /^\[[^\]]+\]:\s*\S+$/;

function parseChangelog(markdown: string): Block[] {
  const blocks: Block[] = [];
  const lines = markdown.split('\n');
  let listBuffer: string[] = [];
  let paragraphBuffer: string[] = [];
  // Everything above the first release heading is the file's own front matter:
  // the document title, and the "all notable changes" line every changelog
  // carries. The page writes its own introduction, so that text is dropped
  // rather than printed twice in slightly different words.
  let seenRelease = false;

  const flushList = () => {
    if (listBuffer.length) {
      blocks.push({ kind: 'list', items: listBuffer });
      listBuffer = [];
    }
  };
  const flushParagraph = () => {
    if (paragraphBuffer.length) {
      blocks.push({ kind: 'paragraph', text: paragraphBuffer.join(' ') });
      paragraphBuffer = [];
    }
  };
  const flushAll = () => {
    flushList();
    flushParagraph();
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (line.startsWith('## ')) {
      flushAll();
      seenRelease = true;
      const heading = line.slice(3).trim();
      const match = /^\[?([^\]]+?)\]?\s*-\s*(.+)$/.exec(heading);
      blocks.push({
        kind: 'release',
        // A section with no date, such as Unreleased, makes the whole heading
        // the version, and it must not keep its markdown brackets.
        version: (match ? match[1] : heading).replace(/^\[|\]$/g, ''),
        date: match ? match[2] : '',
      });
      continue;
    }

    if (!seenRelease) continue;

    if (line.startsWith('### ')) {
      flushAll();
      blocks.push({ kind: 'section', text: line.slice(4).trim() });
      continue;
    }

    if (line.startsWith('- ')) {
      flushParagraph();
      listBuffer.push(line.slice(2).trim());
      continue;
    }

    if (line.trim() === '' || LINK_DEFINITION.test(line.trim())) {
      flushAll();
      continue;
    }

    flushList();
    paragraphBuffer.push(line.trim());
  }

  flushAll();
  return blocks;
}

/** `1.6.0` gets a v in front of it; `Unreleased` does not. */
function releaseLabel(version: string): string {
  return /^\d/.test(version) ? `v${version}` : version;
}

export default function ChangelogPage() {
  const blocks = parseChangelog(readChangelog());

  return (
    <>
      <Navbar />
      <main className="pt-14">
        <section className="mp-container pb-4 pt-16 md:pt-20">
          <h1 className="max-w-2xl text-[32px] font-semibold leading-[1.15] tracking-tight text-fg sm:text-[40px]">
            Changelog
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted">
            Every release, newest first: new rules, auto-fixes, integrations and security fixes.
            This page renders the CHANGELOG.md in the repository, so it cannot drift from what
            actually shipped.
          </p>
          <p className="mt-4 text-sm">
            <a
              href={GITHUB_CHANGELOG}
              className="text-accent transition-colors hover:text-accent-hover"
            >
              Read it on GitHub
            </a>
          </p>
        </section>

        <section className="mp-container pb-20 pt-10">
          <div className="max-w-3xl">
            {blocks.map((block, i) => {
              switch (block.kind) {
                case 'release':
                  return (
                    <div
                      key={`release-${i}`}
                      className="mb-5 mt-14 flex flex-wrap items-baseline gap-3 border-b border-line pb-3 first:mt-0"
                    >
                      <h2 className="text-2xl font-semibold text-fg">
                        {releaseLabel(block.version)}
                      </h2>
                      {block.date && (
                        <time className="font-mono text-sm text-faint" dateTime={block.date}>
                          {block.date}
                        </time>
                      )}
                    </div>
                  );
                case 'section':
                  return (
                    <h3 key={`section-${i}`} className="mb-3 mt-8 text-[15px] font-medium text-fg">
                      {renderInline(block.text, `section-${i}`)}
                    </h3>
                  );
                case 'list':
                  return (
                    <ul key={`list-${i}`} className="mb-5 space-y-2">
                      {block.items.map((item, j) => (
                        <li
                          key={`list-${i}-${j}`}
                          className="flex gap-3 text-[15px] leading-relaxed text-muted"
                        >
                          <span
                            aria-hidden
                            className="mt-[0.6rem] h-1 w-1 shrink-0 rounded-full bg-line"
                          />
                          <span className="min-w-0">{renderInline(item, `list-${i}-${j}`)}</span>
                        </li>
                      ))}
                    </ul>
                  );
                case 'paragraph':
                  return (
                    <p key={`para-${i}`} className="mb-4 text-[15px] leading-relaxed text-muted">
                      {renderInline(block.text, `para-${i}`)}
                    </p>
                  );
              }
            })}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
