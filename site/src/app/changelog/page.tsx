import type { Metadata } from 'next';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactNode } from 'react';
import Navbar from '@/components/navbar';

export const metadata: Metadata = {
  title: 'Changelog — MigrationPilot',
  description:
    'Every MigrationPilot release: new PostgreSQL safety rules, auto-fixes, integrations, and security fixes, newest first.',
  alternates: {
    canonical: '/changelog',
  },
  openGraph: {
    title: 'Changelog — MigrationPilot',
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
 * and [text](url). Deliberately small — this is not a general markdown parser.
 */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)]+\))/g;
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
        <code key={key} className="text-blue-300 bg-slate-800 px-1.5 py-0.5 rounded text-[0.85em]">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith('**')) {
      nodes.push(
        <strong key={key} className="text-slate-200 font-semibold">
          {token.slice(2, -2)}
        </strong>,
      );
    } else {
      const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      if (linkMatch) {
        nodes.push(
          <a key={key} href={linkMatch[2]} className="text-blue-400 hover:text-blue-300 transition-colors">
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

function parseChangelog(markdown: string): Block[] {
  const blocks: Block[] = [];
  const lines = markdown.split('\n');
  let listBuffer: string[] = [];
  let paragraphBuffer: string[] = [];

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

    if (line.startsWith('# ')) {
      // The document title is rendered separately by the page.
      flushAll();
      continue;
    }

    if (line.startsWith('## ')) {
      flushAll();
      const heading = line.slice(3).trim();
      const match = /^\[?([^\]]+?)\]?\s*-\s*(.+)$/.exec(heading);
      blocks.push({
        kind: 'release',
        version: match ? match[1] : heading,
        date: match ? match[2] : '',
      });
      continue;
    }

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

    if (line.trim() === '') {
      flushAll();
      continue;
    }

    flushList();
    paragraphBuffer.push(line.trim());
  }

  flushAll();
  return blocks;
}

export default function ChangelogPage() {
  const blocks = parseChangelog(readChangelog());

  return (
    <main className="min-h-screen">
      <Navbar />

      <article className="pt-32 pb-20 px-6">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">Changelog</h1>
          <p className="text-lg text-slate-400 mb-4 leading-relaxed">
            Every MigrationPilot release, newest first. New rules, auto-fixes, integrations, and security fixes.
          </p>
          <p className="text-sm text-slate-400 mb-12">
            Also on{' '}
            <a href={GITHUB_CHANGELOG} className="text-blue-400 hover:text-blue-300 transition-colors">
              GitHub
            </a>
            .
          </p>

          <div>
            {blocks.map((block, i) => {
              switch (block.kind) {
                case 'release':
                  return (
                    <div
                      key={`release-${i}`}
                      className="flex flex-wrap items-baseline gap-3 mt-14 mb-5 pb-3 border-b border-slate-800 first:mt-0"
                    >
                      <h2 className="text-2xl font-bold text-slate-100">v{block.version}</h2>
                      {block.date && (
                        <time className="text-sm text-slate-400" dateTime={block.date}>
                          {block.date}
                        </time>
                      )}
                    </div>
                  );
                case 'section':
                  return (
                    <h3 key={`section-${i}`} className="text-lg font-semibold text-slate-200 mt-8 mb-3">
                      {renderInline(block.text, `section-${i}`)}
                    </h3>
                  );
                case 'list':
                  return (
                    <ul key={`list-${i}`} className="space-y-2 mb-5 ml-1">
                      {block.items.map((item, j) => (
                        <li key={`list-${i}-${j}`} className="flex gap-3 text-slate-300 leading-relaxed">
                          <span aria-hidden="true" className="text-slate-600 select-none mt-[0.35rem]">
                            &bull;
                          </span>
                          <span className="min-w-0">{renderInline(item, `list-${i}-${j}`)}</span>
                        </li>
                      ))}
                    </ul>
                  );
                case 'paragraph':
                  return (
                    <p key={`para-${i}`} className="text-slate-300 leading-relaxed mb-4">
                      {renderInline(block.text, `para-${i}`)}
                    </p>
                  );
              }
            })}
          </div>
        </div>
      </article>

      <footer className="border-t border-slate-800/50 py-8 px-6">
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-blue-600 flex items-center justify-center font-bold text-[10px]">MP</div>
            <span className="text-xs text-slate-400">MigrationPilot</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-slate-400">
            <a href="/" className="hover:text-slate-200 transition-colors">Home</a>
            <a href="/docs" className="hover:text-slate-200 transition-colors">Docs</a>
            <a href={GITHUB_CHANGELOG} className="hover:text-slate-200 transition-colors">GitHub</a>
          </div>
          <p className="text-xs text-slate-400">&copy; 2026 MigrationPilot</p>
        </div>
      </footer>
    </main>
  );
}
