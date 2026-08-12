import { describe, it, expect } from 'vitest';
import { allRules } from '../src/rules/index.js';
import { isFixable } from '../src/fixer/fix.js';

describe('list-rules data', () => {
  it('every rule has id, name, severity, description, whyItMatters, docsUrl', () => {
    expect(allRules.length).toBeGreaterThan(0);
    for (const rule of allRules) {
      expect(rule.id).toMatch(/^MP\d{3}$/);
      expect(rule.name).toBeTruthy();
      expect(rule.severity).toMatch(/^(critical|warning)$/);
      expect(rule.description).toBeTruthy();
      expect(rule.whyItMatters).toBeTruthy();
      expect(rule.docsUrl).toMatch(/^https:\/\/migrationpilot\.dev\/rules\/mp\d{3}$/);
    }
  });

  it('rule IDs are unique', () => {
    const ids = allRules.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('rule IDs are registered in ascending order with no gaps inside a block', () => {
    // Rules are numbered in blocks (MP001+ core, MP100+ catalog-aware), so the
    // sequence can jump between blocks but must never go backwards or repeat.
    const numbers = allRules.map(r => Number(r.id.slice(2)));
    for (let i = 1; i < numbers.length; i++) {
      expect(numbers[i]).toBeGreaterThan(numbers[i - 1]!);
    }
    expect(numbers[0]).toBe(1);
  });

  it('every registered rule has a matching rule file', async () => {
    const { readdir } = await import('node:fs/promises');
    const files = await readdir(new URL('../src/rules/', import.meta.url));
    for (const rule of allRules) {
      expect(files.some(f => f.startsWith(`${rule.id}-`))).toBe(true);
    }
  });

  it('every registered rule has a docs page', async () => {
    const { readdir } = await import('node:fs/promises');
    const docs = new Set(await readdir(new URL('../docs/rules/', import.meta.url)));
    const undocumented = allRules.filter(r => !docs.has(`${r.id}.md`)).map(r => r.id);
    expect(undocumented).toEqual([]);
  });

  it('20 rules are auto-fixable', () => {
    const fixableRules = allRules.filter(r => isFixable(r.id));
    expect(fixableRules.length).toBe(20);
    expect(fixableRules.map(r => r.id).sort()).toEqual([
      'MP001', 'MP004', 'MP005', 'MP009', 'MP012', 'MP020', 'MP021', 'MP023',
      'MP025', 'MP030', 'MP033', 'MP037', 'MP038', 'MP039', 'MP040', 'MP041',
      'MP042', 'MP046', 'MP074', 'MP077',
    ]);
  });

  it('the rules that read the live catalog are flagged, not withheld', () => {
    const needsDatabase = allRules.filter(r => r.requiresDatabaseUrl);
    expect(needsDatabase.length).toBeGreaterThan(0);
    // Once withheld from unlicensed users; now just marked as needing a connection.
    for (const id of ['MP013', 'MP014', 'MP019']) {
      expect(needsDatabase.map(r => r.id)).toContain(id);
    }
  });
});

describe('--exclude flag', () => {
  it('filtering by exclude removes rules', () => {
    const excluded = new Set(['MP037', 'MP041']);
    const filtered = allRules.filter(r => !excluded.has(r.id));
    expect(filtered.length).toBe(allRules.length - excluded.size);
    expect(filtered.find(r => r.id === 'MP037')).toBeUndefined();
    expect(filtered.find(r => r.id === 'MP041')).toBeUndefined();
    expect(filtered.find(r => r.id === 'MP001')).toBeDefined();
  });
});
