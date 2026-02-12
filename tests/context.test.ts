import { describe, it, expect } from 'vitest';
import { getTableStats, getAffectedQueries, getActiveConnections } from '../src/production/context.js';
import type { ProductionContext } from '../src/production/context.js';

// Unit tests for production context lookup helpers.
// Integration tests with a real PG instance will use testcontainers.

function mockContext(): ProductionContext {
  return {
    tableStats: new Map([
      ['users', { tableName: 'users', rowCount: 1_500_000, totalBytes: 500_000_000, indexCount: 5 }],
      ['orders', { tableName: 'orders', rowCount: 10_000_000, totalBytes: 3_000_000_000, indexCount: 8 }],
    ]),
    affectedQueries: new Map([
      ['users', [
        { queryId: '1', normalizedQuery: 'SELECT * FROM users WHERE id = $1', calls: 100000, meanExecTime: 0.8 },
        { queryId: '2', normalizedQuery: 'UPDATE users SET last_login = $1', calls: 50000, meanExecTime: 2.1, serviceName: 'auth-service' },
      ]],
      ['orders', [
        { queryId: '3', normalizedQuery: 'SELECT * FROM orders WHERE user_id = $1', calls: 75000, meanExecTime: 3.5, serviceName: 'order-service' },
      ]],
    ]),
    activeConnections: new Map([
      ['users', 12],
      ['orders', 3],
    ]),
  };
}

describe('getTableStats', () => {
  const ctx = mockContext();

  it('returns table stats for known table', () => {
    const stats = getTableStats(ctx, 'users');
    expect(stats).toBeDefined();
    expect(stats!.rowCount).toBe(1_500_000);
    expect(stats!.totalBytes).toBe(500_000_000);
    expect(stats!.indexCount).toBe(5);
  });

  it('returns undefined for unknown table', () => {
    expect(getTableStats(ctx, 'nonexistent')).toBeUndefined();
  });
});

describe('getAffectedQueries', () => {
  const ctx = mockContext();

  it('returns queries for known table', () => {
    const queries = getAffectedQueries(ctx, 'users');
    expect(queries).toHaveLength(2);
    expect(queries[0].calls).toBe(100000);
    expect(queries[1].serviceName).toBe('auth-service');
  });

  it('returns empty array for unknown table', () => {
    expect(getAffectedQueries(ctx, 'nonexistent')).toEqual([]);
  });
});

describe('getActiveConnections', () => {
  const ctx = mockContext();

  it('returns connection count for known table', () => {
    expect(getActiveConnections(ctx, 'users')).toBe(12);
    expect(getActiveConnections(ctx, 'orders')).toBe(3);
  });

  it('returns 0 for unknown table', () => {
    expect(getActiveConnections(ctx, 'nonexistent')).toBe(0);
  });
});

describe('ProductionContext integration with scoring', () => {
  // Test that production context data structures are compatible with calculateRisk
  it('table stats shape matches TableStats interface', () => {
    const ctx = mockContext();
    const stats = getTableStats(ctx, 'orders');
    expect(stats).toHaveProperty('tableName');
    expect(stats).toHaveProperty('rowCount');
    expect(stats).toHaveProperty('totalBytes');
    expect(stats).toHaveProperty('indexCount');
    expect(typeof stats!.rowCount).toBe('number');
    expect(typeof stats!.totalBytes).toBe('number');
  });

  it('affected queries shape matches AffectedQuery interface', () => {
    const ctx = mockContext();
    const queries = getAffectedQueries(ctx, 'users');
    for (const q of queries) {
      expect(q).toHaveProperty('queryId');
      expect(q).toHaveProperty('normalizedQuery');
      expect(q).toHaveProperty('calls');
      expect(q).toHaveProperty('meanExecTime');
      expect(typeof q.calls).toBe('number');
      expect(typeof q.meanExecTime).toBe('number');
    }
  });
});
