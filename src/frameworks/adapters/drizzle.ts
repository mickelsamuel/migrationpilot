/**
 * Drizzle adapter — Tier 1 (full support).
 *
 * `drizzle-kit generate` writes SQL files into the `out` directory and records
 * the apply order in `meta/_journal.json`. The journal — not the filename — is
 * the source of truth for ordering, so it is read first and the filename order
 * is only a fallback.
 *
 * Drizzle's `--> statement-breakpoint` separators are SQL comments, so they
 * pass through the parser untouched.
 */

import { join } from 'node:path';
import type { Adapter, AdapterResult, ResolvedMigration, SkippedFile } from './types.js';
import { isDirectory, labelFor, listFiles, readJson, readText, toPosix } from './util.js';

const CONFIG_FILES = [
  'drizzle.config.ts',
  'drizzle.config.mts',
  'drizzle.config.js',
  'drizzle.config.mjs',
  'drizzle.config.cjs',
  'drizzle.config.json',
];

interface Journal {
  version?: string;
  dialect?: string;
  entries?: Array<{ idx?: number; tag?: string; when?: number; breakpoints?: boolean }>;
}

export const drizzleAdapter: Adapter = {
  id: 'drizzle',
  name: 'Drizzle',
  support: 'full',
  async resolve(root: string): Promise<AdapterResult | null> {
    const outDir = await findOutDir(root);
    if (!outDir) return null;

    const notes: string[] = [];
    const skipped: SkippedFile[] = [];
    const migrations: ResolvedMigration[] = [];

    const journal = await readJson<Journal>(join(outDir, 'meta', '_journal.json'));
    const entries = (journal?.entries ?? [])
      .filter(e => typeof e.tag === 'string')
      .sort((a, b) => (a.idx ?? 0) - (b.idx ?? 0));

    if (journal?.dialect && journal.dialect !== 'postgresql') {
      notes.push(`_journal.json declares dialect "${journal.dialect}" — MigrationPilot's rules are PostgreSQL-specific.`);
    }

    const claimed = new Set<string>();

    for (const entry of entries) {
      const tag = entry.tag!;
      const flat = join(outDir, `${tag}.sql`);
      const nested = join(outDir, tag, 'migration.sql');
      const flatSql = await readText(flat);
      const sql = flatSql ?? await readText(nested);
      const path = flatSql !== null ? flat : nested;

      if (sql === null) {
        skipped.push({
          path: flat,
          label: labelFor(root, flat),
          reason: 'listed in meta/_journal.json but the SQL file is missing',
        });
        continue;
      }

      claimed.add(`${tag}.sql`);
      migrations.push({
        path,
        label: labelFor(root, path),
        sql,
        version: String(entry.idx ?? migrations.length).padStart(4, '0'),
        origin: 'sql-file',
        notes: [],
      });
    }

    // SQL files the journal does not mention: still analyzed, but flagged — they
    // will not be applied by drizzle-kit until the journal knows about them.
    const orphans = (await listFiles(outDir)).filter(f => f.endsWith('.sql') && !claimed.has(f)).sort();
    for (const name of orphans) {
      const path = join(outDir, name);
      const sql = await readText(path);
      if (sql === null) continue;
      migrations.push({
        path,
        label: labelFor(root, path),
        sql,
        version: name,
        origin: 'sql-file',
        notes: ['not listed in meta/_journal.json — drizzle-kit will not apply it yet'],
      });
    }
    if (orphans.length > 0) {
      notes.push(`${orphans.length} SQL file(s) are not in meta/_journal.json; they were analyzed last, in filename order.`);
    }

    const ordering = entries.length > 0
      ? 'meta/_journal.json entry order (idx), the order drizzle-kit applies them in'
      : 'filename order — meta/_journal.json is missing, so drizzle-kit\'s recorded order could not be used';
    if (entries.length === 0 && migrations.length > 0) {
      notes.push('meta/_journal.json not found; ordering falls back to filenames.');
    }

    return {
      id: 'drizzle',
      name: 'Drizzle',
      support: 'full',
      root,
      sources: [toPosix(labelFor(root, outDir))],
      ordering,
      migrations,
      skipped,
      notes,
    };
  },
};

/** Resolve the `out` directory from drizzle.config.*, falling back to ./drizzle. */
async function findOutDir(root: string): Promise<string | null> {
  for (const file of CONFIG_FILES) {
    const source = await readText(join(root, file));
    if (source === null) continue;
    const out = source.match(/(?:^|[\s,{])["']?out["']?\s*:\s*['"`]([^'"`]+)['"`]/)?.[1];
    const dir = join(root, out ?? 'drizzle');
    if (await isDirectory(dir)) return dir;
    // Config present but the out directory has not been generated yet.
    return dir;
  }

  const fallback = join(root, 'drizzle');
  if (await isDirectory(join(fallback, 'meta'))) return fallback;
  if (await isDirectory(fallback) && (await listFiles(fallback)).some(f => f.endsWith('.sql'))) return fallback;
  return null;
}
