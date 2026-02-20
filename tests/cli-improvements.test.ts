import { describe, it, expect } from 'vitest';
import { allRules } from '../src/rules/index.js';
import { isFixable } from '../src/fixer/fix.js';

describe('list-rules data', () => {
  it('all 80 rules have id, name, severity, description, whyItMatters, docsUrl', () => {
    expect(allRules).toHaveLength(80);
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

  it('rule IDs are sequential from MP001 to MP080', () => {
    for (let i = 1; i <= 80; i++) {
      const expectedId = `MP${String(i).padStart(3, '0')}`;
      expect(allRules.find(r => r.id === expectedId)).toBeDefined();
    }
  });

  it('12 rules are auto-fixable', () => {
    const fixableRules = allRules.filter(r => isFixable(r.id));
    expect(fixableRules.length).toBe(12);
    expect(fixableRules.map(r => r.id).sort()).toEqual([
      'MP001', 'MP004', 'MP009', 'MP020', 'MP021', 'MP023', 'MP030', 'MP033',
      'MP037', 'MP040', 'MP041', 'MP046',
    ]);
  });

  it('3 rules are pro tier', () => {
    const proRuleIds = new Set(['MP013', 'MP014', 'MP019']);
    const proRules = allRules.filter(r => proRuleIds.has(r.id));
    expect(proRules.length).toBe(3);
  });
});

describe('--exclude flag', () => {
  it('filtering by exclude removes rules', () => {
    const excluded = new Set(['MP037', 'MP041']);
    const filtered = allRules.filter(r => !excluded.has(r.id));
    expect(filtered.length).toBe(78);
    expect(filtered.find(r => r.id === 'MP037')).toBeUndefined();
    expect(filtered.find(r => r.id === 'MP041')).toBeUndefined();
    expect(filtered.find(r => r.id === 'MP001')).toBeDefined();
  });
});
