import { describe, it, expect } from 'vitest';
import { parseMigration } from '../src/parser/parse.js';
import { classifyLock } from '../src/locks/classify.js';
import { analyzeTransactions, isInTransaction, getTransactionBlock, stripLeadingComments } from '../src/analysis/transaction.js';
import { allRules, runRules } from '../src/rules/index.js';

async function parseAndAnalyze(sql: string, pgVersion = 17) {
  const parsed = await parseMigration(sql);
  const statements = parsed.statements.map(s => {
    const lock = classifyLock(s.stmt, pgVersion);
    const line = sql.slice(0, s.stmtLocation).split('\n').length;
    return { ...s, lock, line };
  });
  return { statements, txContext: analyzeTransactions(statements) };
}

describe('analyzeTransactions', () => {
  it('detects no transactions in autocommit mode', async () => {
    const sql = 'CREATE TABLE users (id int); ALTER TABLE users ADD COLUMN name text;';
    const { txContext } = await parseAndAnalyze(sql);
    expect(txContext.blocks).toHaveLength(0);
  });

  it('detects a single BEGIN/COMMIT block', async () => {
    const sql = `BEGIN;
ALTER TABLE users ADD COLUMN a text;
ALTER TABLE users ADD COLUMN b text;
COMMIT;`;
    const { txContext } = await parseAndAnalyze(sql);
    expect(txContext.blocks).toHaveLength(1);
    expect(txContext.blocks[0].ddlIndices).toHaveLength(2);
    expect(txContext.blocks[0].beginIndex).toBe(0);
    expect(txContext.blocks[0].endIndex).toBe(3);
  });

  it('tracks DDL statements inside transaction', async () => {
    const sql = `BEGIN;
SET lock_timeout = '5s';
ALTER TABLE users ADD COLUMN a text;
ALTER TABLE users ADD COLUMN b text;
COMMIT;`;
    const { txContext } = await parseAndAnalyze(sql);
    // DDL = ALTER TABLE ADD COLUMN x2 (SET is not DDL)
    expect(txContext.blocks[0].ddlIndices).toHaveLength(2);
  });

  it('detects CONCURRENTLY inside transaction as invalid', async () => {
    const sql = `BEGIN;
CREATE INDEX CONCURRENTLY idx ON users (email);
COMMIT;`;
    const { txContext } = await parseAndAnalyze(sql);
    expect(txContext.blocks[0].invalidInTxIndices).toHaveLength(1);
  });

  it('handles multiple transaction blocks', async () => {
    const sql = `BEGIN;
ALTER TABLE users ADD COLUMN a text;
COMMIT;
BEGIN;
ALTER TABLE orders ADD COLUMN total numeric;
COMMIT;`;
    const { txContext } = await parseAndAnalyze(sql);
    expect(txContext.blocks).toHaveLength(2);
  });

  it('handles unterminated transaction', async () => {
    const sql = `BEGIN;
ALTER TABLE users ADD COLUMN a text;`;
    const { txContext } = await parseAndAnalyze(sql);
    expect(txContext.blocks).toHaveLength(1);
    expect(txContext.blocks[0].endIndex).toBe(-1);
  });
});

describe('isInTransaction', () => {
  it('returns false for autocommit statements', async () => {
    const sql = 'ALTER TABLE users ADD COLUMN name text;';
    const { txContext } = await parseAndAnalyze(sql);
    expect(isInTransaction(0, txContext)).toBe(false);
  });

  it('returns true for statements inside BEGIN/COMMIT', async () => {
    const sql = `BEGIN;
ALTER TABLE users ADD COLUMN a text;
COMMIT;`;
    const { txContext } = await parseAndAnalyze(sql);
    expect(isInTransaction(0, txContext)).toBe(true); // BEGIN
    expect(isInTransaction(1, txContext)).toBe(true); // ALTER
    expect(isInTransaction(2, txContext)).toBe(true); // COMMIT
  });

  it('returns false for statements after COMMIT', async () => {
    const sql = `BEGIN;
ALTER TABLE users ADD COLUMN a text;
COMMIT;
ALTER TABLE orders ADD COLUMN total numeric;`;
    const { txContext } = await parseAndAnalyze(sql);
    expect(isInTransaction(3, txContext)).toBe(false);
  });
});

describe('getTransactionBlock', () => {
  it('returns the block for enclosed statements', async () => {
    const sql = `BEGIN;
ALTER TABLE users ADD COLUMN a text;
COMMIT;`;
    const { txContext } = await parseAndAnalyze(sql);
    const block = getTransactionBlock(1, txContext);
    expect(block).toBeDefined();
    expect(block!.beginIndex).toBe(0);
    expect(block!.endIndex).toBe(2);
  });

  it('returns undefined for autocommit statements', async () => {
    const sql = 'ALTER TABLE users ADD COLUMN name text;';
    const { txContext } = await parseAndAnalyze(sql);
    expect(getTransactionBlock(0, txContext)).toBeUndefined();
  });
});

// ──────────────────────────────────────────────
// Leading comments and transaction boundaries
// ──────────────────────────────────────────────

// The parser reports stmt_location at the end of the previous statement, so a
// comment written above BEGIN belongs to the BEGIN statement's text. Matching
// that text against the keyword meant a single `-- ticket ref` line above the
// migration silenced every rule that asks "am I in a transaction?" — MP008,
// MP012, MP025 and MP054 all went quiet on files real people write.
describe('leading comments do not hide transaction boundaries', () => {
  const bodies = [
    ['no comment', ''],
    ['line comment', '-- add an index\n'],
    ['block comment', '/* add an index */\n'],
    ['multi-line block', '/* ---\nid: u12\nverdict: dangerous\n--- */\n'],
    ['several line comments', '-- Migration: x\n--\n-- We wrap this for safety.\n'],
    ['nested block comment', '/* outer /* inner */ still outer */\n'],
  ] as const;

  it.each(bodies)('detects BEGIN behind a %s', async (_label, prefix) => {
    const sql = `${prefix}BEGIN;\nCREATE INDEX CONCURRENTLY i ON t (c);\nCOMMIT;\n`;
    const { txContext } = await parseAndAnalyze(sql);
    expect(txContext.blocks).toHaveLength(1);
    expect(txContext.blocks[0]!.invalidInTxIndices).toEqual([1]);
  });

  it('detects COMMIT behind a comment', async () => {
    const sql = 'BEGIN;\nALTER TABLE t ADD COLUMN c text;\n-- done\nCOMMIT;\nALTER TABLE t ADD COLUMN d text;\n';
    const { txContext } = await parseAndAnalyze(sql);
    expect(txContext.blocks).toHaveLength(1);
    expect(txContext.blocks[0]!.endIndex).toBe(2);
    expect(isInTransaction(3, txContext)).toBe(false);
  });
});

describe('stripLeadingComments', () => {
  it('leaves plain SQL alone', () => {
    expect(stripLeadingComments('BEGIN')).toBe('BEGIN');
  });

  it('drops a line comment', () => {
    expect(stripLeadingComments('-- hello\nBEGIN')).toBe('BEGIN');
  });

  it('drops a block comment', () => {
    expect(stripLeadingComments('/* hello */ BEGIN')).toBe('BEGIN');
  });

  it('drops nested block comments, as PostgreSQL allows', () => {
    expect(stripLeadingComments('/* a /* b */ c */\nBEGIN')).toBe('BEGIN');
  });

  it('drops a run of mixed comments', () => {
    expect(stripLeadingComments('-- one\n/* two */\n-- three\nBEGIN')).toBe('BEGIN');
  });

  it('does not touch a comment that follows the statement', () => {
    expect(stripLeadingComments('BEGIN -- go')).toBe('BEGIN -- go');
  });

  it('yields nothing for an unterminated block comment', () => {
    expect(stripLeadingComments('/* never closed\nBEGIN')).toBe('');
  });
});

describe('transaction rules survive a leading comment', () => {
  async function ruleIds(sql: string, pgVersion = 17) {
    const parsed = await parseMigration(sql);
    const statements = parsed.statements.map(s => ({
      ...s,
      lock: classifyLock(s.stmt, pgVersion),
      line: sql.slice(0, s.stmtLocation).split('\n').length,
    }));
    return new Set(runRules(allRules, statements, pgVersion, undefined, sql).map(v => v.ruleId));
  }

  const pairs: Array<[string, string, string]> = [
    ['MP025', 'BEGIN;\nCREATE INDEX CONCURRENTLY i ON t (c);\nCOMMIT;\n', '-- add an index\n'],
    ['MP008', 'BEGIN;\nALTER TABLE a ADD COLUMN x text;\nALTER TABLE b ADD COLUMN y text;\nCOMMIT;\n', '-- two tables\n'],
    ['MP012', "BEGIN;\nALTER TYPE s ADD VALUE 'r';\nUPDATE o SET status = 'r' WHERE k IS NOT NULL;\nCOMMIT;\n", '-- support refunds\n'],
    ['MP054', "BEGIN;\nALTER TYPE s ADD VALUE 'r';\nUPDATE o SET status = 'r' WHERE k IS NOT NULL;\nCOMMIT;\n", '-- support refunds\n'],
  ];

  it.each(pairs)('%s fires the same with and without a header comment', async (ruleId, sql, prefix) => {
    expect(await ruleIds(sql)).toContain(ruleId);
    expect(await ruleIds(prefix + sql)).toContain(ruleId);
  });

  it('reports an identical rule set either way', async () => {
    const sql = "BEGIN;\nALTER TYPE s ADD VALUE 'r';\nUPDATE o SET status = 'r' WHERE k IS NOT NULL;\nCOMMIT;\n";
    const bare = await ruleIds(sql);
    const commented = await ruleIds(`/* ---\nid: a02\n--- */\n\n-- Migration: support refunded orders\n${sql}`);
    expect([...commented].sort()).toEqual([...bare].sort());
  });
});
