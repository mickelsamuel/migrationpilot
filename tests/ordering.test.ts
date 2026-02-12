import { describe, it, expect } from 'vitest';
import { validateOrdering, parseVersion, buildMigrationFiles } from '../src/analysis/ordering.js';
import type { MigrationFile } from '../src/analysis/ordering.js';

describe('parseVersion', () => {
  it('parses Flyway V001__ format', () => {
    expect(parseVersion('V001__create_users.sql')).toBe('001');
  });

  it('parses Flyway V1.2__ format', () => {
    expect(parseVersion('V1.2__add_columns.sql')).toBe('1.2');
  });

  it('parses timestamp format', () => {
    expect(parseVersion('20230615120000_create_orders.sql')).toBe('20230615120000');
  });

  it('parses sequential format', () => {
    expect(parseVersion('001_initial.sql')).toBe('001');
  });

  it('parses 8-digit date format', () => {
    expect(parseVersion('20230615_add_index.sql')).toBe('20230615');
  });

  it('returns empty for unrecognized format', () => {
    expect(parseVersion('random_file.sql')).toBe('');
  });

  it('parses bare number', () => {
    expect(parseVersion('42.sql')).toBe('42');
  });
});

describe('validateOrdering', () => {
  it('returns no issues for a single file', () => {
    const files: MigrationFile[] = [
      { path: '001.sql', name: '001.sql', version: '001', createdTables: ['users'], referencedTables: [] },
    ];
    expect(validateOrdering(files)).toHaveLength(0);
  });

  it('detects duplicate versions', () => {
    const files: MigrationFile[] = [
      { path: '001_a.sql', name: '001_a.sql', version: '001', createdTables: [], referencedTables: [] },
      { path: '001_b.sql', name: '001_b.sql', version: '001', createdTables: [], referencedTables: [] },
    ];
    const issues = validateOrdering(files);
    const dups = issues.filter(i => i.type === 'duplicate-version');
    expect(dups).toHaveLength(1);
    expect(dups[0].severity).toBe('critical');
  });

  it('detects out-of-order files', () => {
    const files: MigrationFile[] = [
      { path: '002.sql', name: '002.sql', version: '002', createdTables: [], referencedTables: [] },
      { path: '001.sql', name: '001.sql', version: '001', createdTables: [], referencedTables: [] },
    ];
    const issues = validateOrdering(files);
    expect(issues.find(i => i.type === 'out-of-order')).toBeDefined();
  });

  it('detects version gaps', () => {
    const files: MigrationFile[] = [
      { path: '1.sql', name: '1.sql', version: '1', createdTables: [], referencedTables: [] },
      { path: '3.sql', name: '3.sql', version: '3', createdTables: [], referencedTables: [] },
    ];
    const issues = validateOrdering(files);
    const gap = issues.find(i => i.type === 'gap');
    expect(gap).toBeDefined();
    expect(gap!.message).toContain('1 → 3');
  });

  it('detects missing dependencies', () => {
    const files: MigrationFile[] = [
      { path: '001.sql', name: '001.sql', version: '001', createdTables: [], referencedTables: ['users'] },
      { path: '002.sql', name: '002.sql', version: '002', createdTables: ['users'], referencedTables: [] },
    ];
    const issues = validateOrdering(files);
    const dep = issues.find(i => i.type === 'missing-dependency');
    expect(dep).toBeDefined();
    expect(dep!.message).toContain('references table "users"');
  });

  it('no dependency issue when table created in earlier migration', () => {
    const files: MigrationFile[] = [
      { path: '001.sql', name: '001.sql', version: '001', createdTables: ['users'], referencedTables: [] },
      { path: '002.sql', name: '002.sql', version: '002', createdTables: [], referencedTables: ['users'] },
    ];
    const issues = validateOrdering(files);
    expect(issues.find(i => i.type === 'missing-dependency')).toBeUndefined();
  });

  it('flags invalid naming', () => {
    const files: MigrationFile[] = [
      { path: '001.sql', name: '001.sql', version: '001', createdTables: [], referencedTables: [] },
      { path: 'random.sql', name: 'random.sql', version: '', createdTables: [], referencedTables: [] },
    ];
    const issues = validateOrdering(files);
    expect(issues.find(i => i.type === 'invalid-name')).toBeDefined();
  });

  it('handles properly ordered files with no issues', () => {
    const files: MigrationFile[] = [
      { path: '001.sql', name: '001.sql', version: '001', createdTables: ['users'], referencedTables: [] },
      { path: '002.sql', name: '002.sql', version: '002', createdTables: ['orders'], referencedTables: ['users'] },
      { path: '003.sql', name: '003.sql', version: '003', createdTables: [], referencedTables: ['users', 'orders'] },
    ];
    const issues = validateOrdering(files);
    expect(issues).toHaveLength(0);
  });
});

describe('buildMigrationFiles', () => {
  it('builds from file data', () => {
    const result = buildMigrationFiles([
      { path: 'migrations/V001__init.sql', createdTables: ['users'], referencedTables: [] },
      { path: 'migrations/V002__add_orders.sql', createdTables: ['orders'], referencedTables: ['users'] },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0].version).toBe('001');
    expect(result[0].name).toBe('V001__init.sql');
    expect(result[1].referencedTables).toContain('users');
  });
});
