import { Fragment, type ReactNode } from 'react';

/*
 * A deliberately small SQL colouriser.
 *
 * It only separates keywords, comments and literals from everything else, and
 * it stays inside the neutral + accent palette on purpose: red, amber and green
 * mean rule severity on this site, so a syntax theme must not borrow them.
 */

const KEYWORDS = new Set([
  'add', 'all', 'alter', 'and', 'as', 'asc', 'begin', 'between', 'by', 'cascade', 'check',
  'column', 'commit', 'concurrently', 'constraint', 'create', 'default', 'delete', 'desc',
  'distinct', 'drop', 'else', 'end', 'enforced', 'exclusive', 'exists', 'foreign', 'from',
  'generated', 'group', 'having', 'identity', 'if', 'in', 'index', 'insert', 'into', 'is',
  'join', 'key', 'left', 'like', 'limit', 'lock', 'not', 'null', 'on', 'only', 'or', 'order',
  'primary', 'references', 'reindex', 'rename', 'reset', 'right', 'rollback', 'select', 'set',
  'share', 'table', 'then', 'to', 'transaction', 'truncate', 'type', 'unique', 'update',
  'using', 'vacuum', 'valid', 'validate', 'values', 'when', 'where', 'with',
]);

const TOKEN = /(--[^\n]*)|('(?:[^']|'')*')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_$]*)/g;

/** Render SQL as coloured spans. Pure and deterministic: same input, same output. */
export function Sql({ code }: { code: string }): ReactNode {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;

  for (const match of code.matchAll(TOKEN)) {
    const [text, comment, string, number, word] = match;
    const start = match.index;

    if (start > last) {
      out.push(<Fragment key={key++}>{code.slice(last, start)}</Fragment>);
    }
    last = start + text.length;

    if (comment) {
      out.push(<span key={key++} className="text-faint">{text}</span>);
    } else if (string || number) {
      out.push(<span key={key++} className="text-muted">{text}</span>);
    } else if (word && KEYWORDS.has(word.toLowerCase())) {
      out.push(<span key={key++} className="text-accent">{text}</span>);
    } else {
      out.push(<Fragment key={key++}>{text}</Fragment>);
    }
  }

  if (last < code.length) out.push(<Fragment key={key++}>{code.slice(last)}</Fragment>);

  return out;
}
