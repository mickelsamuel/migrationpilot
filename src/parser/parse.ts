import { parse as pgParse } from 'libpg-query';

export interface ParsedStatement {
  stmt: Record<string, unknown>;
  stmtLocation: number;
  stmtLen?: number;
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
    const statements: ParsedStatement[] = result.stmts.map((s: { stmt: Record<string, unknown>; stmt_location?: number; stmt_len?: number }) => {
      const loc = s.stmt_location ?? 0;
      const len = s.stmt_len ?? sql.length - loc;
      return {
        stmt: s.stmt,
        stmtLocation: loc,
        stmtLen: len,
        originalSql: sql.slice(loc, loc + len).trim(),
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
