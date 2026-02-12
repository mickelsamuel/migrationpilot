import { describe, it, expect } from 'vitest';
import { estimateDuration } from '../src/output/plan.js';
import type { LockClassification } from '../src/locks/classify.js';

const accessExclusive: LockClassification = { lockType: 'ACCESS EXCLUSIVE', blocksReads: true, blocksWrites: true, longHeld: true };
const accessShare: LockClassification = { lockType: 'ACCESS SHARE', blocksReads: false, blocksWrites: false, longHeld: false };
const sue: LockClassification = { lockType: 'SHARE UPDATE EXCLUSIVE', blocksReads: false, blocksWrites: false, longHeld: false };

describe('estimateDuration', () => {
  it('returns instant for SET statements', () => {
    const stmt = { VariableSetStmt: { name: 'lock_timeout' } };
    expect(estimateDuration(stmt, accessShare)).toBe('instant');
  });

  it('returns instant for transaction statements', () => {
    const stmt = { TransactionStmt: { kind: 'TRANS_STMT_BEGIN' } };
    expect(estimateDuration(stmt, accessShare)).toBe('instant');
  });

  it('returns instant for CREATE TABLE', () => {
    const stmt = { CreateStmt: {} };
    expect(estimateDuration(stmt, accessExclusive)).toBe('instant');
  });

  it('returns unknown for CREATE INDEX CONCURRENTLY without row count', () => {
    const stmt = { IndexStmt: { concurrent: true } };
    expect(estimateDuration(stmt, sue)).toBe('unknown');
  });

  it('returns seconds for CREATE INDEX CONCURRENTLY on small table', () => {
    const stmt = { IndexStmt: { concurrent: true } };
    expect(estimateDuration(stmt, sue, 50_000)).toBe('seconds');
  });

  it('returns minutes for CREATE INDEX CONCURRENTLY on medium table', () => {
    const stmt = { IndexStmt: { concurrent: true } };
    expect(estimateDuration(stmt, sue, 5_000_000)).toBe('minutes');
  });

  it('returns hours for CREATE INDEX CONCURRENTLY on large table', () => {
    const stmt = { IndexStmt: { concurrent: true } };
    expect(estimateDuration(stmt, sue, 50_000_000)).toBe('hours');
  });

  it('returns unknown for non-concurrent CREATE INDEX without row count', () => {
    const stmt = { IndexStmt: {} };
    expect(estimateDuration(stmt, accessExclusive)).toBe('unknown');
  });

  it('returns hours for VACUUM FULL on large table', () => {
    const stmt = { VacuumStmt: { options: [{ DefElem: { defname: 'full' } }] } };
    expect(estimateDuration(stmt, accessExclusive, 1_000_000)).toBe('hours');
  });

  it('returns minutes for VACUUM FULL on small table', () => {
    const stmt = { VacuumStmt: { options: [{ DefElem: { defname: 'full' } }] } };
    expect(estimateDuration(stmt, accessExclusive, 50_000)).toBe('minutes');
  });

  it('returns hours for CLUSTER', () => {
    const stmt = { ClusterStmt: {} };
    expect(estimateDuration(stmt, accessExclusive)).toBe('hours');
  });

  it('returns instant for ADD COLUMN', () => {
    const stmt = { AlterTableStmt: { cmds: [{ AlterTableCmd: { subtype: 'AT_AddColumn' } }] } };
    expect(estimateDuration(stmt, accessExclusive)).toBe('instant');
  });

  it('returns instant for DROP COLUMN', () => {
    const stmt = { AlterTableStmt: { cmds: [{ AlterTableCmd: { subtype: 'AT_DropColumn' } }] } };
    expect(estimateDuration(stmt, accessExclusive)).toBe('instant');
  });

  it('returns unknown for ALTER COLUMN TYPE without row count', () => {
    const stmt = { AlterTableStmt: { cmds: [{ AlterTableCmd: { subtype: 'AT_AlterColumnType' } }] } };
    expect(estimateDuration(stmt, accessExclusive)).toBe('unknown');
  });

  it('returns minutes for ALTER COLUMN TYPE on medium table', () => {
    const stmt = { AlterTableStmt: { cmds: [{ AlterTableCmd: { subtype: 'AT_AlterColumnType' } }] } };
    expect(estimateDuration(stmt, accessExclusive, 5_000_000)).toBe('minutes');
  });

  it('returns seconds for SET NOT NULL on small table', () => {
    const stmt = { AlterTableStmt: { cmds: [{ AlterTableCmd: { subtype: 'AT_SetNotNull' } }] } };
    expect(estimateDuration(stmt, accessExclusive, 500_000)).toBe('seconds');
  });

  it('returns seconds for VALIDATE CONSTRAINT on small table', () => {
    const stmt = { AlterTableStmt: { cmds: [{ AlterTableCmd: { subtype: 'AT_ValidateConstraint' } }] } };
    expect(estimateDuration(stmt, sue, 500_000)).toBe('seconds');
  });
});
