/**
 * Byte offset → line number, and where a statement actually begins.
 *
 * libpg-query reports `stmt_location` as the offset just past the previous
 * statement's `;` — not the offset of the statement itself. Everything between
 * the two sits inside the span it hands back: the newline that ended the last
 * line, any blank lines, and any comment written above the statement. Reading a
 * line number straight off `stmt_location` therefore reports every statement on
 * the line its predecessor ended on, and slicing the text off it glues the
 * file's header comments onto the first statement.
 *
 * `statementStart` is the correction: it walks past that trivia to the first
 * real token, and every position MigrationPilot reports — CLI, JSON, SARIF, PR
 * comments, the VS Code extension — is measured from there.
 */

/** Offsets at which each 1-based line begins. */
export function lineStartOffsets(sql: string): number[] {
  const starts = [0];
  for (let i = 0; i < sql.length; i++) {
    if (sql[i] === '\n') starts.push(i + 1);
  }
  return starts;
}

/**
 * 1-based line number of `offset`, given a table from `lineStartOffsets`.
 *
 * CRLF needs no special handling: `\r\n` carries exactly one `\n`, so a line
 * begins after it just as it does on Unix endings.
 */
export function lineAt(starts: number[], offset: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid]! <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

/**
 * 1-based line number of `offset` in `sql`.
 *
 * Builds the offset table on every call — fine for a one-off, but callers
 * translating several offsets should hold a `lineStartOffsets` table instead.
 */
export function lineOf(sql: string, offset: number): number {
  return lineAt(lineStartOffsets(sql), offset);
}

/**
 * Offset of the first real token in `[from, to)`.
 *
 * Skips whitespace, `--` line comments and block comments, which nest in
 * PostgreSQL. A span holding nothing but trivia has no token to point at, so
 * `from` comes back unchanged.
 */
export function statementStart(sql: string, from: number, to: number): number {
  const end = Math.min(to, sql.length);
  let i = Math.max(from, 0);

  while (i < end) {
    const ch = sql[i]!;

    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f' || ch === '\v') {
      i++;
      continue;
    }

    if (ch === '-' && sql[i + 1] === '-') {
      const nl = sql.indexOf('\n', i);
      i = nl === -1 || nl >= end ? end : nl + 1;
      continue;
    }

    if (ch === '/' && sql[i + 1] === '*') {
      let depth = 0;
      let j = i;
      while (j < end) {
        if (sql[j] === '/' && sql[j + 1] === '*') { depth++; j += 2; continue; }
        if (sql[j] === '*' && sql[j + 1] === '/') { depth--; j += 2; if (depth === 0) break; continue; }
        j++;
      }
      // An unterminated comment swallows the rest of the span.
      i = j;
      continue;
    }

    return i;
  }

  return from;
}
