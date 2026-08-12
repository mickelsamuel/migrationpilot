/**
 * Reads the handbook straight out of `docs/handbook/*.md` at build time.
 *
 * The markdown files are the single source of truth. Nothing in the site copies
 * their prose, their SQL or their lab output — this module parses them into a
 * small block tree and `components/handbook-markdown.tsx` renders it. An entry
 * fixed in the repository is fixed on the site by the next build.
 *
 * The parser is deliberately narrow. It handles exactly the constructs the
 * handbook uses (checked across all twenty entries: ATX headings to level 3,
 * paragraphs, fenced code, pipe tables, blockquotes, single-level lists, and
 * inline code/strong/em/links/autolinks) and throws on a fence it cannot close.
 * A general CommonMark implementation would be a dependency and a much larger
 * surface for a corpus this controlled.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const HANDBOOK_DIR = join(process.cwd(), '..', 'docs', 'handbook');
const ENTRY_FILE = /^(\d\d)-([a-z0-9-]+)\.md$/;

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'strong'; children: Inline[] }
  | { kind: 'em'; children: Inline[] }
  | { kind: 'link'; href: string; external: boolean; children: Inline[] };

export type Block =
  | { kind: 'heading'; level: 2 | 3; id: string; children: Inline[] }
  | { kind: 'paragraph'; children: Inline[] }
  | { kind: 'code'; language: CodeLanguage; code: string }
  | { kind: 'list'; ordered: boolean; items: Block[][] }
  | { kind: 'quote'; children: Block[] }
  | { kind: 'table'; head: Inline[][]; rows: Inline[][][] };

/** `output` is a fence with no language: in this corpus that is always real psql output. */
export type CodeLanguage = 'sql' | 'bash' | 'output';

export interface Incident {
  name: string;
  date: string;
  url: string;
}

export interface HandbookEntry {
  /** Stable id from the front matter, e.g. `MPH-001`. */
  id: string;
  /** Two-digit file prefix, e.g. `01`. Display order and the "entry 04" prose refer to it. */
  number: string;
  /** URL segment: the file name without its number prefix or extension. */
  slug: string;
  title: string;
  /** First sentence of the entry's opening paragraph. Derived, never written here. */
  hook: Inline[];
  hookText: string;
  ruleIds: string[];
  pgVersions: string;
  lockMode: string;
  severity: 'critical' | 'warning';
  confidence: 'High' | 'Medium';
  lastVerified: string;
  verifiedAgainst: string;
  incidents: Incident[];
  blocks: Block[];
  /** The `## ` headings, in document order, for the on-page contents list. */
  sections: { id: string; title: string }[];
}

/* -------------------------------------------------------------------------- */
/* Front matter                                                               */
/* -------------------------------------------------------------------------- */

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

interface FrontMatter {
  scalars: Record<string, string>;
  incidents: Incident[];
}

/**
 * Parses the handbook's front matter shape: flat scalars, one inline array
 * (`rules`), and one list of three-key maps (`incidents`). Not a YAML parser.
 */
function parseFrontMatter(source: string, file: string): { data: FrontMatter; body: string } {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) throw new Error(`${file}: no front matter`);

  const scalars: Record<string, string> = {};
  const incidents: Incident[] = [];
  let current: Partial<Incident> | null = null;
  let inIncidents = false;

  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim()) continue;

    const topLevel = line.match(/^([a-z_]+):\s*(.*)$/);
    if (topLevel) {
      if (current) {
        incidents.push(current as Incident);
        current = null;
      }
      inIncidents = topLevel[1] === 'incidents';
      if (!inIncidents) scalars[topLevel[1]] = unquote(topLevel[2]);
      continue;
    }

    if (!inIncidents) throw new Error(`${file}: unexpected front matter line: ${line}`);

    const item = line.match(/^\s+-\s+([a-z]+):\s*(.*)$/);
    if (item) {
      if (current) incidents.push(current as Incident);
      current = { [item[1]]: unquote(item[2]) } as Partial<Incident>;
      continue;
    }

    const field = line.match(/^\s+([a-z]+):\s*(.*)$/);
    if (field && current) {
      current[field[1] as keyof Incident] = unquote(field[2]);
      continue;
    }

    throw new Error(`${file}: unexpected front matter line: ${line}`);
  }
  if (current) incidents.push(current as Incident);

  return { data: { scalars, incidents }, body: match[2] };
}

/* -------------------------------------------------------------------------- */
/* Inline parsing                                                             */
/* -------------------------------------------------------------------------- */

// Ordered by precedence: a code span wins over everything inside it, and `**`
// is tried before `*` so bold never parses as two emphases. Capture groups are
// numbered rather than named because the site targets a pre-ES2018 lib.
const CODE_TICKS = 1;
const CODE = 2;
const LINK_TEXT = 3;
const LINK_HREF = 4;
const AUTOLINK = 5;
const STRONG = 6;
const EM = 7;

const INLINE = new RegExp(
  [
    /(`+)([\s\S]*?)\1/.source,
    /\[([^\]]*)\]\(([^)\s]+)\)/.source,
    /<((?:https?|mailto):[^>\s]+)>/.source,
    /\*\*([\s\S]+?)\*\*/.source,
    /\*([^*\s](?:[^*]*?[^*\s])?)\*/.source,
  ].join('|'),
  'g',
);

function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;

  for (const match of text.matchAll(INLINE)) {
    const start = match.index!;
    if (start > last) out.push({ kind: 'text', text: text.slice(last, start) });
    last = start + match[0].length;

    if (match[CODE_TICKS] !== undefined) {
      // A span written as `` `x` `` carries one padding space per side.
      const raw = match[CODE];
      const stripped =
        raw.startsWith(' ') && raw.endsWith(' ') && raw.trim() ? raw.slice(1, -1) : raw;
      out.push({ kind: 'code', text: stripped });
    } else if (match[LINK_HREF] !== undefined) {
      out.push(makeLink(match[LINK_HREF], parseInline(match[LINK_TEXT])));
    } else if (match[AUTOLINK] !== undefined) {
      out.push(makeLink(match[AUTOLINK], [{ kind: 'text', text: match[AUTOLINK] }]));
    } else if (match[STRONG] !== undefined) {
      out.push({ kind: 'strong', children: parseInline(match[STRONG]) });
    } else if (match[EM] !== undefined) {
      out.push({ kind: 'em', children: parseInline(match[EM]) });
    }
  }

  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
  return out;
}

/**
 * Rewrites the two link shapes the handbook uses internally. Cross-entry links
 * are written as relative markdown paths (`04-check-then-not-null.md`) so the
 * files stay readable on GitHub; on the site they have to become site routes.
 */
function makeLink(href: string, children: Inline[]): Inline {
  const entry = href.match(/^(\d\d)-([a-z0-9-]+)\.md(#.*)?$/);
  if (entry) {
    return { kind: 'link', href: `/handbook/${entry[2]}${entry[3] ?? ''}`, external: false, children };
  }
  if (href.startsWith('#') || href.startsWith('/')) {
    return { kind: 'link', href, external: false, children };
  }
  return { kind: 'link', href, external: true, children };
}

export function toPlainText(nodes: Inline[]): string {
  return nodes
    .map((node) => {
      switch (node.kind) {
        case 'text':
        case 'code':
          return node.text;
        default:
          return toPlainText(node.children);
      }
    })
    .join('');
}

/* -------------------------------------------------------------------------- */
/* Block parsing                                                              */
/* -------------------------------------------------------------------------- */

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

const FENCE = /^```(\w*)\s*$/;
const HEADING = /^(#{1,3})\s+(.*)$/;
const BULLET = /^([-*+])\s+(.*)$/;
const NUMBERED = /^(\d+)\.\s+(.*)$/;
const TABLE_DELIMITER = /^\|(?:\s*:?-{2,}:?\s*\|)+$/;

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function parseBlocks(lines: string[], file: string): Block[] {
  const blocks: Block[] = [];
  const usedIds = new Set<string>();
  let i = 0;

  const paragraph: string[] = [];
  const flush = () => {
    if (!paragraph.length) return;
    blocks.push({ kind: 'paragraph', children: parseInline(paragraph.join(' ')) });
    paragraph.length = 0;
  };

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      flush();
      i += 1;
      continue;
    }

    const fence = line.match(FENCE);
    if (fence) {
      flush();
      const close = lines.indexOf('```', i + 1);
      if (close === -1) throw new Error(`${file}: unclosed code fence at line ${i + 1}`);
      const language: CodeLanguage =
        fence[1] === 'sql' ? 'sql' : fence[1] === 'bash' ? 'bash' : 'output';
      blocks.push({ kind: 'code', language, code: lines.slice(i + 1, close).join('\n') });
      i = close + 1;
      continue;
    }

    const heading = line.match(HEADING);
    if (heading) {
      flush();
      // The level-1 heading repeats the front matter title, which the page
      // renders itself, so it never becomes a second h1 in the body.
      if (heading[1].length > 1) {
        const children = parseInline(heading[2]);
        let id = slugify(toPlainText(children));
        while (usedIds.has(id)) id += '-x';
        usedIds.add(id);
        blocks.push({ kind: 'heading', level: heading[1].length as 2 | 3, id, children });
      }
      i += 1;
      continue;
    }

    if (line.startsWith('|') && TABLE_DELIMITER.test(lines[i + 1]?.trim() ?? '')) {
      flush();
      const head = splitRow(line).map(parseInline);
      const rows: Inline[][][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(splitRow(lines[i]).map(parseInline));
        i += 1;
      }
      blocks.push({ kind: 'table', head, rows });
      continue;
    }

    if (line.startsWith('>')) {
      flush();
      const quoted: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) {
        quoted.push(lines[i].replace(/^>\s?/, ''));
        i += 1;
      }
      blocks.push({ kind: 'quote', children: parseBlocks(quoted, file) });
      continue;
    }

    const bullet = line.match(BULLET);
    const numbered = line.match(NUMBERED);
    if (bullet || numbered) {
      flush();
      const ordered = Boolean(numbered);
      const items: Block[][] = [];

      while (i < lines.length) {
        const item = lines[i].match(ordered ? NUMBERED : BULLET);
        if (!item) break;

        // Continuation lines are indented; a blank line only ends the item if
        // the list itself has ended.
        const content = [item[2]];
        i += 1;
        while (i < lines.length) {
          if (/^\s{2,}\S/.test(lines[i])) {
            content.push(lines[i].trim());
            i += 1;
          } else if (!lines[i].trim() && lines[i + 1]?.match(ordered ? NUMBERED : BULLET)) {
            content.push('');
            i += 1;
          } else {
            break;
          }
        }
        items.push(parseBlocks(content, file));
      }

      blocks.push({ kind: 'list', ordered, items });
      continue;
    }

    paragraph.push(line.trim());
    i += 1;
  }

  flush();
  return blocks;
}

/* -------------------------------------------------------------------------- */
/* Entry assembly                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The one-line hook shown on the index: the first sentence of the entry's own
 * opening paragraph. Splitting stops at a full stop that is not part of an
 * ellipsis, so `ALTER TABLE ... SET NOT NULL` does not end the sentence.
 */
function firstSentence(paragraph: string): string {
  const match = paragraph.match(/^[\s\S]*?(?<!\.)[.?!](?!\.)(?=\s|$)/);
  return (match ? match[0] : paragraph).trim();
}

function requireScalar(scalars: Record<string, string>, key: string, file: string): string {
  const value = scalars[key];
  if (!value) throw new Error(`${file}: front matter is missing ${key}`);
  return value;
}

function parseEntry(file: string): HandbookEntry {
  const fileMatch = file.match(ENTRY_FILE)!;
  const source = readFileSync(join(HANDBOOK_DIR, file), 'utf8');
  const { data, body } = parseFrontMatter(source, file);
  const { scalars, incidents } = data;

  const trimmed = body.replace(/^\s+/, '');
  const title = requireScalar(scalars, 'title', file);
  const h1 = trimmed.match(/^#\s+(.*)$/m);
  if (!h1 || h1[1].trim() !== title) {
    throw new Error(`${file}: body heading "${h1?.[1] ?? '(none)'}" disagrees with front matter title "${title}"`);
  }

  const afterTitle = trimmed.replace(/^#[^\n]*\r?\n+/, '');
  const opening = afterTitle.split(/\r?\n\s*\r?\n/)[0].replace(/\s*\r?\n\s*/g, ' ').trim();
  // Cross-entry links inside the hook flatten to their text: the index already
  // links the entry, and a link inside a link is not a thing.
  const hook = parseInline(firstSentence(opening)).flatMap((node) =>
    node.kind === 'link' ? node.children : [node],
  );

  const severity = requireScalar(scalars, 'severity', file);
  const confidence = requireScalar(scalars, 'confidence', file);
  if (severity !== 'critical' && severity !== 'warning') {
    throw new Error(`${file}: unexpected severity "${severity}"`);
  }
  if (confidence !== 'High' && confidence !== 'Medium') {
    throw new Error(`${file}: unexpected confidence "${confidence}"`);
  }

  const blocks = parseBlocks(afterTitle.split(/\r?\n/), file);

  return {
    id: requireScalar(scalars, 'id', file),
    number: fileMatch[1],
    slug: fileMatch[2],
    title,
    hook,
    hookText: toPlainText(hook),
    ruleIds: (scalars.rules ?? '')
      .replace(/^\[|\]$/g, '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
    pgVersions: requireScalar(scalars, 'pg_versions', file),
    lockMode: requireScalar(scalars, 'lock_mode', file),
    severity,
    confidence,
    lastVerified: requireScalar(scalars, 'last_verified', file),
    verifiedAgainst: requireScalar(scalars, 'verified_against', file),
    incidents,
    blocks,
    sections: blocks
      .filter((block): block is Extract<Block, { kind: 'heading' }> => block.kind === 'heading')
      .filter((block) => block.level === 2)
      .map((block) => ({ id: block.id, title: toPlainText(block.children) })),
  };
}

let cache: HandbookEntry[] | null = null;

/** Every entry, in file order. Parsed once per build. */
export function getHandbookEntries(): HandbookEntry[] {
  if (cache) return cache;
  const files = readdirSync(HANDBOOK_DIR).filter((file) => ENTRY_FILE.test(file)).sort();
  if (!files.length) throw new Error(`no handbook entries found in ${HANDBOOK_DIR}`);
  cache = files.map(parseEntry);
  return cache;
}

export function getHandbookEntry(slug: string): HandbookEntry | undefined {
  return getHandbookEntries().find((entry) => entry.slug === slug);
}

/**
 * Grouping for the index. The entries themselves are numbered, not grouped, so
 * this is the site's own reading order — every entry appears exactly once, and
 * the build fails below if that stops being true.
 */
export const HANDBOOK_GROUPS: { title: string; blurb: string; numbers: string[] }[] = [
  {
    title: 'Locks, and the queue behind them',
    blurb:
      'The mechanism underneath most migration outages: one statement waits, and everything arriving after it waits too.',
    numbers: ['02', '16', '20', '01'],
  },
  {
    title: 'Constraints without the outage',
    blurb:
      'NOT NULL, CHECK, foreign keys and UNIQUE all default to a full scan under a lock. All four have the same two-step fix.',
    numbers: ['03', '04', '05', '08', '09'],
  },
  {
    title: 'Rewrites you did not ask for',
    blurb: 'The ALTERs that quietly copy the whole table and every index on it — and the one that stopped in PostgreSQL 11.',
    numbers: ['06', '07'],
  },
  {
    title: 'Statements your framework will break',
    blurb:
      'Migration tools wrap everything in a transaction by default. These three statements have opinions about that.',
    numbers: ['10', '11', '12'],
  },
  {
    title: 'Changes you cannot take back',
    blurb: 'DROP and RENAME finish instantly, which is exactly why they get waved through review.',
    numbers: ['13', '14', '15'],
  },
  {
    title: 'Past the edge of one table',
    blurb: 'Replication, backfills and partitions: migrations whose cost lands somewhere other than the table you named.',
    numbers: ['17', '18', '19'],
  },
];

export interface HandbookGroup {
  title: string;
  blurb: string;
  entries: HandbookEntry[];
}

export function getHandbookGroups(): HandbookGroup[] {
  const entries = getHandbookEntries();
  const groups = HANDBOOK_GROUPS.map((group) => ({
    title: group.title,
    blurb: group.blurb,
    entries: group.numbers.map((number) => {
      const entry = entries.find((candidate) => candidate.number === number);
      if (!entry) throw new Error(`handbook group "${group.title}" references missing entry ${number}`);
      return entry;
    }),
  }));

  const grouped = groups.flatMap((group) => group.entries.map((entry) => entry.number));
  const missing = entries.filter((entry) => !grouped.includes(entry.number));
  if (missing.length) {
    throw new Error(`handbook entries missing from every group: ${missing.map((e) => e.number).join(', ')}`);
  }
  if (new Set(grouped).size !== grouped.length) {
    throw new Error('a handbook entry appears in more than one group');
  }

  return groups;
}
