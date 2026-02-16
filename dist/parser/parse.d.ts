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
export declare function parseMigration(sql: string): Promise<ParseResult>;
//# sourceMappingURL=parse.d.ts.map