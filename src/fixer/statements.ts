/**
 * SQL statement splitter for the auto-fixer.
 *
 * The fixer rewrites whole statements, not single lines — an
 * `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY (...) REFERENCES ...`
 * routinely spans four lines, and appending `NOT VALID` to the first one
 * would produce invalid SQL.
 *
 * This is a lexer, not a parser: it walks the text tracking string
 * literals, quoted identifiers, dollar-quoted bodies and comments so that
 * only a real top-level `;` ends a statement.
 */

import { lineAt, lineStartOffsets } from '../parser/position.js';

export interface SqlStatementSpan {
  /** 0-based position of the statement in the file */
  index: number;
  /** Offset of the first character of the statement */
  start: number;
  /** Offset one past the last character (including the terminating `;`) */
  end: number;
  /** 1-based line number of `start` */
  startLine: number;
  /** 1-based line number of the last character */
  endLine: number;
  /** `sql.slice(start, end)` */
  text: string;
}

/** Skip a `--` comment, returning the offset just past it. */
function skipLineComment(sql: string, i: number): number {
  const nl = sql.indexOf('\n', i);
  return nl === -1 ? sql.length : nl;
}

/** Skip a (nestable) `/* *\/` comment, returning the offset just past it. */
function skipBlockComment(sql: string, i: number): number {
  let depth = 0;
  let j = i;
  while (j < sql.length) {
    if (sql[j] === '/' && sql[j + 1] === '*') {
      depth++;
      j += 2;
    } else if (sql[j] === '*' && sql[j + 1] === '/') {
      depth--;
      j += 2;
      if (depth === 0) return j;
    } else {
      j++;
    }
  }
  return sql.length;
}

/** Skip a quoted run delimited by `quote`, where a doubled quote escapes itself. */
function skipQuoted(sql: string, i: number, quote: string): number {
  let j = i + 1;
  while (j < sql.length) {
    if (sql[j] === '\\' && quote === "'") {
      // Backslash escapes only apply to E'' strings, but treating them as
      // escapes in plain strings too is harmless for boundary detection.
      j += 2;
      continue;
    }
    if (sql[j] === quote) {
      if (sql[j + 1] === quote) {
        j += 2;
        continue;
      }
      return j + 1;
    }
    j++;
  }
  return sql.length;
}

/** Match a dollar-quote opening tag at `i`, e.g. `$$` or `$body$`. */
function dollarTagAt(sql: string, i: number): string | null {
  // A tag is empty ($$) or an identifier — `$1` is a positional parameter, not a quote.
  const ident = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i));
  if (ident) return ident[0];
  return null;
}

/** Skip a dollar-quoted body, returning the offset just past the closing tag. */
function skipDollarQuoted(sql: string, i: number, tag: string): number {
  const close = sql.indexOf(tag, i + tag.length);
  return close === -1 ? sql.length : close + tag.length;
}

/**
 * Split SQL into statement spans.
 *
 * Whitespace and comments between statements belong to neither statement —
 * they stay in the gaps, which lets the fixer reassemble a file byte-for-byte
 * when nothing changed.
 */
export function splitStatements(sql: string): SqlStatementSpan[] {
  const starts = lineStartOffsets(sql);
  const spans: SqlStatementSpan[] = [];
  let stmtStart = -1;
  let i = 0;

  const push = (start: number, end: number) => {
    let stop = end;
    while (stop > start && /\s/.test(sql[stop - 1]!)) stop--;
    if (stop <= start) return;
    spans.push({
      index: spans.length,
      start,
      end: stop,
      startLine: lineAt(starts, start),
      endLine: lineAt(starts, stop - 1),
      text: sql.slice(start, stop),
    });
  };

  while (i < sql.length) {
    const ch = sql[i]!;

    if (ch === '-' && sql[i + 1] === '-') {
      i = skipLineComment(sql, i);
      continue;
    }
    if (ch === '/' && sql[i + 1] === '*') {
      i = skipBlockComment(sql, i);
      continue;
    }

    if (stmtStart === -1) {
      if (/\s/.test(ch)) {
        i++;
        continue;
      }
      if (ch === ';') {
        // Stray semicolon — nothing to attach it to.
        i++;
        continue;
      }
      stmtStart = i;
    }

    if (ch === "'" || ch === '"') {
      i = skipQuoted(sql, i, ch);
      continue;
    }
    if (ch === '$') {
      const tag = dollarTagAt(sql, i);
      if (tag) {
        i = skipDollarQuoted(sql, i, tag);
        continue;
      }
    }
    if (ch === ';') {
      push(stmtStart, i + 1);
      stmtStart = -1;
      i++;
      continue;
    }

    i++;
  }

  if (stmtStart !== -1) push(stmtStart, sql.length);

  return spans;
}

