import { describe, it, expect } from 'vitest';
import { diffSchemas, formatDriftReport } from '../src/drift/compare.js';
import type { SchemaDiff } from '../src/drift/compare.js';

function makeSnapshot(opts: {
  tables?: Record<string, Array<{ name: string; dataType: string; nullable: boolean; defaultValue: string | null }>>;
  indexes?: Record<string, { name: string; table: string; definition: string }>;
  constraints?: Record<string, { name: string; table: string; type: string; definition: string }>;
  sequences?: string[];
}) {
  return {
    tables: new Map(Object.entries(opts.tables ?? {})),
    indexes: new Map(Object.entries(opts.indexes ?? {})),
    constraints: new Map(Object.entries(opts.constraints ?? {})),
    sequences: new Set(opts.sequences ?? []),
  };
}

describe('diffSchemas', () => {
  it('detects added tables', () => {
    const source = makeSnapshot({ tables: {} });
    const target = makeSnapshot({
      tables: { users: [{ name: 'id', dataType: 'int8', nullable: false, defaultValue: null }] },
    });

    const diff = diffSchemas(source, target);
    expect(diff.tables.added).toEqual(['users']);
    expect(diff.tables.removed).toEqual([]);
  });

  it('detects removed tables', () => {
    const source = makeSnapshot({
      tables: { users: [{ name: 'id', dataType: 'int8', nullable: false, defaultValue: null }] },
    });
    const target = makeSnapshot({ tables: {} });

    const diff = diffSchemas(source, target);
    expect(diff.tables.removed).toEqual(['users']);
    expect(diff.tables.added).toEqual([]);
  });

  it('detects added columns', () => {
    const source = makeSnapshot({
      tables: { users: [{ name: 'id', dataType: 'int8', nullable: false, defaultValue: null }] },
    });
    const target = makeSnapshot({
      tables: {
        users: [
          { name: 'id', dataType: 'int8', nullable: false, defaultValue: null },
          { name: 'email', dataType: 'text', nullable: true, defaultValue: null },
        ],
      },
    });

    const diff = diffSchemas(source, target);
    expect(diff.tables.modified).toHaveLength(1);
    expect(diff.tables.modified[0]?.columns.added).toHaveLength(1);
    expect(diff.tables.modified[0]?.columns.added[0]?.name).toBe('email');
  });

  it('detects removed columns', () => {
    const source = makeSnapshot({
      tables: {
        users: [
          { name: 'id', dataType: 'int8', nullable: false, defaultValue: null },
          { name: 'legacy', dataType: 'text', nullable: true, defaultValue: null },
        ],
      },
    });
    const target = makeSnapshot({
      tables: { users: [{ name: 'id', dataType: 'int8', nullable: false, defaultValue: null }] },
    });

    const diff = diffSchemas(source, target);
    expect(diff.tables.modified[0]?.columns.removed[0]?.name).toBe('legacy');
  });

  it('detects type changes', () => {
    const source = makeSnapshot({
      tables: { users: [{ name: 'id', dataType: 'int4', nullable: false, defaultValue: null }] },
    });
    const target = makeSnapshot({
      tables: { users: [{ name: 'id', dataType: 'int8', nullable: false, defaultValue: null }] },
    });

    const diff = diffSchemas(source, target);
    expect(diff.tables.modified[0]?.columns.modified[0]?.changes).toContain('type: int4 → int8');
  });

  it('detects nullable changes', () => {
    const source = makeSnapshot({
      tables: { users: [{ name: 'email', dataType: 'text', nullable: true, defaultValue: null }] },
    });
    const target = makeSnapshot({
      tables: { users: [{ name: 'email', dataType: 'text', nullable: false, defaultValue: null }] },
    });

    const diff = diffSchemas(source, target);
    expect(diff.tables.modified[0]?.columns.modified[0]?.changes).toContain('nullable: true → false');
  });

  it('detects added/removed indexes', () => {
    const source = makeSnapshot({
      tables: { users: [{ name: 'id', dataType: 'int8', nullable: false, defaultValue: null }] },
      indexes: { idx_old: { name: 'idx_old', table: 'users', definition: 'CREATE INDEX idx_old ON users (name)' } },
    });
    const target = makeSnapshot({
      tables: { users: [{ name: 'id', dataType: 'int8', nullable: false, defaultValue: null }] },
      indexes: { idx_new: { name: 'idx_new', table: 'users', definition: 'CREATE INDEX idx_new ON users (email)' } },
    });

    const diff = diffSchemas(source, target);
    expect(diff.indexes.added).toHaveLength(1);
    expect(diff.indexes.added[0]?.name).toBe('idx_new');
    expect(diff.indexes.removed).toHaveLength(1);
    expect(diff.indexes.removed[0]?.name).toBe('idx_old');
  });

  it('detects added/removed sequences', () => {
    const source = makeSnapshot({ sequences: ['users_id_seq'] });
    const target = makeSnapshot({ sequences: ['users_id_seq', 'orders_id_seq'] });

    const diff = diffSchemas(source, target);
    expect(diff.sequences.added).toEqual(['orders_id_seq']);
    expect(diff.sequences.removed).toEqual([]);
  });

  it('returns empty diff for identical schemas', () => {
    const schema = makeSnapshot({
      tables: { users: [{ name: 'id', dataType: 'int8', nullable: false, defaultValue: null }] },
    });

    const diff = diffSchemas(schema, schema);
    expect(diff.tables.added).toEqual([]);
    expect(diff.tables.removed).toEqual([]);
    expect(diff.tables.modified).toEqual([]);
    expect(diff.indexes.added).toEqual([]);
    expect(diff.indexes.removed).toEqual([]);
  });
});

describe('formatDriftReport', () => {
  it('formats empty diff', () => {
    const diff: SchemaDiff = {
      tables: { added: [], removed: [], modified: [] },
      indexes: { added: [], removed: [] },
      sequences: { added: [], removed: [] },
    };

    const report = formatDriftReport(diff);
    expect(report).toContain('No drift detected');
  });

  it('formats diff with changes', () => {
    const diff: SchemaDiff = {
      tables: {
        added: ['orders'],
        removed: ['legacy_users'],
        modified: [{
          table: 'users',
          columns: {
            added: [{ name: 'email', dataType: 'text', nullable: true, defaultValue: null }],
            removed: [],
            modified: [{ name: 'id', changes: ['type: int4 → int8'] }],
          },
          constraints: { added: [], removed: [] },
        }],
      },
      indexes: { added: [], removed: [] },
      sequences: { added: [], removed: [] },
    };

    const report = formatDriftReport(diff);
    expect(report).toContain('Tables added (1)');
    expect(report).toContain('+ orders');
    expect(report).toContain('Tables removed (1)');
    expect(report).toContain('- legacy_users');
    expect(report).toContain('Table "users" modified');
    expect(report).toContain('+ column "email"');
    expect(report).toContain('~ column "id"');
    expect(report).toContain('4 difference(s) found');
  });
});
