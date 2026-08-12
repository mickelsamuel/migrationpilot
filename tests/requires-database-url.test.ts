import { describe, it, expect } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { analyzeSQL } from '../src/analysis/analyze.js';
import { allRules, staticRules } from '../src/rules/index.js';

/**
 * `requiresDatabaseUrl` is a public claim: `list-rules --json`, the MCP
 * `get_rule` tool, and the playground all repeat it. These tests keep the claim
 * true in both directions — a flagged rule must really be silent without a
 * database, and a rule that reads the catalog must really carry the flag.
 */

const RULES_DIR = resolve(__dirname, '../src/rules');
const CORPUS_DIR = resolve(__dirname, '../bench/corpus');

/** Context fields that only ever arrive with `--database-url`. */
const PRODUCTION_FIELDS = [
  'tableStats',
  'affectedQueries',
  'activeConnections',
  'existingIndexes',
  'tableFacts',
  'tableExtensions',
  'cluster',
  'production',
];

/** Helpers in catalog-helpers.ts that read the same production context. */
const PRODUCTION_HELPERS = ['lookupTableStats', 'lookupTableFacts', 'lookupTableExtensions'];

/**
 * Rules that touch production context but still fire without it, so they are
 * deliberately unflagged. MP109 reports missing HNSW/IVFFlat parameters from
 * the migration text alone and only uses table stats to enrich the message.
 */
const ENRICH_ONLY = new Set(['MP109']);

async function corpusFiles(): Promise<string[]> {
  const found: string[] = [];
  for (const category of await readdir(CORPUS_DIR, { withFileTypes: true })) {
    if (!category.isDirectory()) continue;
    const dir = join(CORPUS_DIR, category.name);
    for (const entry of await readdir(dir)) {
      if (entry.endsWith('.sql')) found.push(join(dir, entry));
    }
  }
  return found.sort();
}

describe('requiresDatabaseUrl', () => {
  it('flags a non-empty subset, and staticRules is exactly the rest', () => {
    const flagged = allRules.filter(r => r.requiresDatabaseUrl);
    expect(flagged.length).toBeGreaterThan(0);
    expect(flagged.length).toBeLessThan(allRules.length);

    expect(staticRules.length).toBe(allRules.length - flagged.length);
    expect(staticRules.some(r => r.requiresDatabaseUrl)).toBe(false);
  });

  it('only ever uses `true` — never false or undefined-as-false noise', () => {
    for (const rule of allRules) {
      if ('requiresDatabaseUrl' in rule && rule.requiresDatabaseUrl !== undefined) {
        expect(rule.requiresDatabaseUrl, `${rule.id}`).toBe(true);
      }
    }
  });

  it('no flagged rule fires anywhere in the benchmark corpus without a database', async () => {
    const flagged = new Set(allRules.filter(r => r.requiresDatabaseUrl).map(r => r.id));
    expect(flagged.size).toBeGreaterThan(0);

    const files = await corpusFiles();
    expect(files.length).toBeGreaterThan(0);

    const fired = new Map<string, string>();
    let analyzed = 0;
    for (const file of files) {
      const sql = await readFile(file, 'utf-8');
      let result;
      try {
        // Every rule, no production context — exactly what happens with no --database-url.
        result = await analyzeSQL(sql, file, 17, allRules);
      } catch {
        continue; // a few corpus files use syntax the bundled parser rejects
      }
      analyzed++;
      for (const v of result.violations) {
        if (flagged.has(v.ruleId) && !fired.has(v.ruleId)) fired.set(v.ruleId, file);
      }
    }

    // Guard against the corpus silently becoming unparseable and the test vacuous.
    expect(analyzed).toBeGreaterThan(files.length * 0.9);

    expect(
      [...fired].map(([id, file]) => `${id} fired in ${file}`),
    ).toEqual([]);
  }, 60_000);

  it('every rule that reads production context is flagged', async () => {
    // Match the field only as a property read off the rule context — the bare
    // words ("production", "cluster") appear in plenty of rule prose.
    const pattern = new RegExp(
      `\\b\\w+\\.(?:${PRODUCTION_FIELDS.join('|')})\\b|\\b(?:${PRODUCTION_HELPERS.join('|')})\\s*\\(`,
    );
    const byId = new Map(allRules.map(r => [r.id, r]));
    const missing: string[] = [];

    for (const entry of await readdir(RULES_DIR)) {
      const id = entry.match(/^(MP\d+)-/)?.[1];
      if (!id || ENRICH_ONLY.has(id)) continue;
      const rule = byId.get(id);
      if (!rule || rule.requiresDatabaseUrl) continue;
      if (pattern.test(await readFile(join(RULES_DIR, entry), 'utf-8'))) missing.push(id);
    }

    expect(missing).toEqual([]);
  });
});
