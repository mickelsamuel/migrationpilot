/**
 * Statement splitting for the simulator.
 *
 * The primary path is the same one `src/analysis/analyze.ts` uses: parse with
 * libpg-query and slice each statement out with its `stmt_location`/`stmt_len`.
 * That is authoritative — the server's own grammar decided where the boundaries
 * are.
 *
 * The fallback matters because of a version gap. The bundled libpg-query is
 * built from PostgreSQL 16/17 and *rejects* PG18-only syntax outright, while
 * PGlite 0.5.x embeds PostgreSQL 18. So there is a real class of migration that
 * static analysis cannot parse but the simulator can execute perfectly well.
 * Refusing to run those would throw away the most interesting answer the
 * simulator has, so on parse failure we split the raw text ourselves and let
 * the actual server be the judge.
 */

import { parseMigration } from '../parser/parse.js';
import { lineOf, statementStart } from '../parser/position.js';

export interface SplitStatement {
  /** Statement text, trimmed, without the trailing semicolon. */
  sql: string;
  /** 1-based line of the statement's first character in the source file. */
  line: number;
  /** Byte offset of the statement's first character in the source file. */
  offset: number;
  /**
   * Parse tree for the statement. Empty on the raw fallback path, where
   * libpg-query gave us nothing to work with.
   */
  stmt: Record<string, unknown>;
}

export interface SplitResult {
  statements: SplitStatement[];
  /** True when libpg-query could not parse the file and we split the raw text. */
  fallback: boolean;
  /** Parse errors from libpg-query (empty unless `fallback` is true). */
  parseErrors: string[];
}

/**
 * Split a migration into executable statements.
 */
export async function splitStatements(sql: string): Promise<SplitResult> {
  const parsed = await parseMigration(sql);

  if (parsed.errors.length === 0) {
    const statements: SplitStatement[] = [];
    for (const s of parsed.statements) {
      const len = s.stmtLen ?? sql.length - s.stmtLocation;
      const pushed = toStatement(sql, s.stmtLocation, s.stmtLocation + len, s.stmt);
      if (pushed) statements.push(pushed);
    }
    return { statements, fallback: false, parseErrors: [] };
  }

  return {
    statements: splitStatementsRaw(sql),
    fallback: true,
    parseErrors: parsed.errors.map(e => e.message),
  };
}

/**
 * Split raw SQL on semicolons, skipping over anything where a semicolon is not
 * a statement terminator: string literals, quoted identifiers, dollar-quoted
 * bodies (function definitions, DO blocks), line comments and nestable block
 * comments.
 *
 * Exported for testing.
 */
export function splitStatementsRaw(sql: string): SplitStatement[] {
  const statements: SplitStatement[] = [];
  const n = sql.length;
  let start = 0;
  let i = 0;

  while (i < n) {
    const ch = sql[i];

    if (ch === "'") {
      i = skipSingleQuoted(sql, i);
      continue;
    }
    if (ch === '"') {
      i = skipDoubleQuoted(sql, i);
      continue;
    }
    if (ch === '$') {
      const end = skipDollarQuoted(sql, i);
      if (end > i) {
        i = end;
        continue;
      }
      i++;
      continue;
    }
    if (ch === '-' && sql[i + 1] === '-') {
      i = skipLineComment(sql, i);
      continue;
    }
    if (ch === '/' && sql[i + 1] === '*') {
      i = skipBlockComment(sql, i);
      continue;
    }
    if (ch === ';') {
      const stmt = toStatement(sql, start, i);
      if (stmt) statements.push(stmt);
      i++;
      start = i;
      continue;
    }
    i++;
  }

  const tail = toStatement(sql, start, n);
  if (tail) statements.push(tail);

  return statements;
}

/**
 * Build a statement from a source span, or null when the span holds nothing
 * executable (blank, or only comments after a trailing semicolon).
 */
function toStatement(
  sql: string,
  from: number,
  to: number,
  stmt: Record<string, unknown> = {},
): SplitStatement | null {
  const text = sql.slice(from, to).trim();
  if (text.length === 0) return null;
  if (isOnlyComments(text)) return null;

  const offset = statementStart(sql, from, to);
  return { sql: text, line: lineOf(sql, offset), offset, stmt };
}

/** True when the text contains only comments and whitespace. */
function isOnlyComments(text: string): boolean {
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
      i++;
      continue;
    }
    if (ch === '-' && text[i + 1] === '-') {
      i = skipLineComment(text, i);
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      i = skipBlockComment(text, i);
      continue;
    }
    return false;
  }
  return true;
}

/**
 * Skip a single-quoted literal. Returns the index just past the closing quote.
 *
 * Two escape forms are handled: the standard doubled quote (`''`) and, for
 * `E'...'` strings, backslash escapes. Plain `'...'` strings ignore backslashes
 * under `standard_conforming_strings = on`, which has been the default since
 * PostgreSQL 9.1.
 */
function skipSingleQuoted(sql: string, start: number): number {
  const escapeString = isEscapeStringPrefix(sql, start);
  let i = start + 1;
  while (i < sql.length) {
    const ch = sql[i];
    if (escapeString && ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === "'") {
      if (sql[i + 1] === "'") {
        i += 2;
        continue;
      }
      return i + 1;
    }
    i++;
  }
  return sql.length;
}

/** True when the quote at `start` opens an `E'...'` escape string. */
function isEscapeStringPrefix(sql: string, start: number): boolean {
  const prev = sql[start - 1];
  if (prev !== 'e' && prev !== 'E') return false;
  const before = sql[start - 2];
  // `E` must stand alone — `foo.value'...'` is not an escape string.
  return before === undefined || !/[A-Za-z0-9_$]/.test(before);
}

/** Skip a double-quoted identifier. `""` is an embedded quote. */
function skipDoubleQuoted(sql: string, start: number): number {
  let i = start + 1;
  while (i < sql.length) {
    if (sql[i] === '"') {
      if (sql[i + 1] === '"') {
        i += 2;
        continue;
      }
      return i + 1;
    }
    i++;
  }
  return sql.length;
}

/**
 * Skip a dollar-quoted body (`$$...$$` or `$tag$...$tag$`).
 *
 * Returns `start` when the `$` does not open a dollar quote — `$1` placeholders
 * and `a$b` identifiers both hit this path.
 */
function skipDollarQuoted(sql: string, start: number): number {
  const match = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(start));
  if (!match) return start;

  const delimiter = match[0];
  const bodyStart = start + delimiter.length;
  const close = sql.indexOf(delimiter, bodyStart);
  if (close === -1) return sql.length;
  return close + delimiter.length;
}

/** Skip `-- ...` to the end of the line. */
function skipLineComment(sql: string, start: number): number {
  const newline = sql.indexOf('\n', start);
  return newline === -1 ? sql.length : newline + 1;
}

/** Skip a block comment. PostgreSQL nests these, unlike C. */
function skipBlockComment(sql: string, start: number): number {
  let depth = 0;
  let i = start;
  while (i < sql.length) {
    if (sql[i] === '/' && sql[i + 1] === '*') {
      depth++;
      i += 2;
      continue;
    }
    if (sql[i] === '*' && sql[i + 1] === '/') {
      depth--;
      i += 2;
      if (depth === 0) return i;
      continue;
    }
    i++;
  }
  return sql.length;
}
