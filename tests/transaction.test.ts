import { describe, it, expect } from 'vitest';
import { parseMigration } from '../src/parser/parse.js';
import { classifyLock } from '../src/locks/classify.js';
import { analyzeTransactions, isInTransaction, getTransactionBlock } from '../src/analysis/transaction.js';

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
