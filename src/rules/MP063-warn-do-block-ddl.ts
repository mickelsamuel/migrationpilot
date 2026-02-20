import type { Rule } from './engine.js';

/**
 * MP063: warn-do-block-ddl
 *
 * DO $$ ... $$ blocks containing DDL statements bypass static analysis.
 * The PL/pgSQL body cannot be parsed by libpg-query's SQL parser,
 * so we detect DDL keywords in the body text as a best-effort warning.
 *
 * This mirrors Squawk issue #528 — DO blocks can acquire heavy locks
 * without being flagged by any static analysis tool.
 */

const DDL_PATTERNS = [
  /\bALTER\s+TABLE\b/i,
  /\bCREATE\s+INDEX\b/i,
  /\bCREATE\s+TABLE\b/i,
  /\bDROP\s+TABLE\b/i,
  /\bDROP\s+INDEX\b/i,
  /\bDROP\s+COLUMN\b/i,
  /\bADD\s+COLUMN\b/i,
  /\bADD\s+CONSTRAINT\b/i,
  /\bDROP\s+CONSTRAINT\b/i,
  /\bRENAME\b/i,
  /\bTRUNCATE\b/i,
];

function extractDoBody(stmt: Record<string, unknown>): string | null {
  const doStmt = stmt.DoStmt as {
    args?: Array<{
      DefElem?: {
        defname?: string;
        arg?: { String?: { sval?: string } };
      };
    }>;
  } | undefined;

  if (!doStmt?.args) return null;

  for (const arg of doStmt.args) {
    if (arg.DefElem?.defname === 'as') {
      return arg.DefElem.arg?.String?.sval ?? null;
    }
  }
  return null;
}

export const warnDoBlockDdl: Rule = {
  id: 'MP063',
  name: 'warn-do-block-ddl',
  severity: 'warning',
  description: 'DO block contains DDL that bypasses static analysis — lock impact cannot be determined.',
  whyItMatters:
    'PL/pgSQL DO blocks execute arbitrary code that cannot be analyzed by SQL linters. ' +
    'DDL inside DO blocks (ALTER TABLE, CREATE INDEX, DROP) acquires the same locks as ' +
    'direct SQL, but the operations are invisible to static analysis. Extract DDL from ' +
    'DO blocks into direct SQL statements for full safety analysis.',
  docsUrl: 'https://migrationpilot.dev/rules/mp063',
  check(stmt) {
    const body = extractDoBody(stmt);
    if (!body) return null;

    const foundDdl: string[] = [];
    for (const pattern of DDL_PATTERNS) {
      if (pattern.test(body)) {
        const match = body.match(pattern);
        if (match) foundDdl.push(match[0].trim());
      }
    }

    if (foundDdl.length === 0) return null;

    const unique = [...new Set(foundDdl.map(d => d.toUpperCase()))];

    return {
      ruleId: 'MP063',
      ruleName: 'warn-do-block-ddl',
      severity: 'warning',
      message: `DO block contains DDL (${unique.join(', ')}) that cannot be statically analyzed for lock safety. Extract DDL into direct SQL statements.`,
      line: 1,
      statement: '',
    };
  },
};
