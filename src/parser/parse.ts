import { parse as pgParse } from 'libpg-query';
import { lineAt, lineStartOffsets, statementStart } from './position.js';

export interface ParsedStatement {
  stmt: Record<string, unknown>;
  /**
   * Raw `stmt_location` from libpg-query: the offset just past the previous
   * statement's `;`, so the span it opens includes the blank lines and comments
   * written above the statement. Use `startOffset` to point at the statement.
   */
  stmtLocation: number;
  stmtLen?: number;
  /** Offset of the statement's first real token, leading trivia skipped. */
  startOffset: number;
  /** 1-based line of `startOffset` in the original file. */
  line: number;
  originalSql: string;
}

export interface ParseResult {
  statements: ParsedStatement[];
  errors: ParseError[];
}

export interface ParseError {
  message: string;
  cursorPosition?: number;
  line?: number;
}

export async function parseMigration(sql: string): Promise<ParseResult> {
  try {
    const result = await pgParse(sql);
    const lineStarts = lineStartOffsets(sql);
    const statements: ParsedStatement[] = result.stmts.map((s: { stmt: Record<string, unknown>; stmt_location?: number; stmt_len?: number }) => {
      const loc = s.stmt_location ?? 0;
      const len = s.stmt_len ?? sql.length - loc;
      const start = statementStart(sql, loc, loc + len);
      return {
        stmt: s.stmt,
        stmtLocation: loc,
        stmtLen: len,
        startOffset: start,
        line: lineAt(lineStarts, start),
        originalSql: sql.slice(start, loc + len).trim(),
      };
    });

    return { statements, errors: [] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      statements: [],
      errors: [{ message }],
    };
  }
}
