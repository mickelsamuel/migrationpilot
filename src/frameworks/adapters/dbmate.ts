/**
 * dbmate adapter — Tier 1 (full support).
 *
 * dbmate migrations are SQL files with `-- migrate:up` / `-- migrate:down`
 * sections. Only the up section is analyzed, with the rest blanked out so
 * violation line numbers still match the file.
 *
 * dbmate versions a migration by the leading digits of its filename, and
 * applies them in that order.
 */

import { join } from 'node:path';
import type { Adapter, AdapterResult, ResolvedMigration, SkippedFile } from './types.js';
import { compareVersions, isDirectory, labelFor, leadingNumericVersion, listFiles, readText, toPosix } from './util.js';
import { extractDbmateUp } from './sections.js';

const DIR_CANDIDATES = ['db/migrations', 'migrations'];

export const dbmateAdapter: Adapter = {
  id: 'dbmate',
  name: 'dbmate',
  support: 'full',
  async resolve(root: string): Promise<AdapterResult | null> {
    const dir = await findDir(root);
    if (!dir) return null;

    const notes: string[] = [];
    const skipped: SkippedFile[] = [];
    const migrations: ResolvedMigration[] = [];

    for (const name of await listFiles(dir)) {
      if (!name.endsWith('.sql')) continue;
      const path = join(dir, name);
      const raw = await readText(path);
      if (raw === null) continue;

      const extracted = extractDbmateUp(raw);
      if (!extracted.foundUp) {
        skipped.push({
          path,
          label: labelFor(root, path),
          reason: 'no `-- migrate:up` marker — dbmate would reject this file too',
        });
        continue;
      }

      const fileNotes: string[] = [];
      if (extracted.directives.some(d => /transaction\s*:\s*false/i.test(d))) {
        fileNotes.push('declares `transaction:false` — statements run unwrapped');
      }

      migrations.push({
        path,
        label: labelFor(root, path),
        sql: extracted.sql,
        version: leadingNumericVersion(name),
        origin: 'sql-section',
        notes: fileNotes,
      });
    }

    if (migrations.length === 0 && skipped.length === 0) return null;

    migrations.sort((a, b) => compareVersions(a.version, b.version) || a.label.localeCompare(b.label));
    notes.push('Only the `-- migrate:up` section of each file is analyzed.');

    return {
      id: 'dbmate',
      name: 'dbmate',
      support: 'full',
      root,
      sources: [toPosix(labelFor(root, dir))],
      ordering: 'numeric filename prefix (dbmate version order)',
      migrations,
      skipped,
      notes,
    };
  },
};

/** A directory is dbmate's when its SQL files carry `-- migrate:up` markers. */
async function findDir(root: string): Promise<string | null> {
  const fromEnv = process.env.DBMATE_MIGRATIONS_DIR;
  const candidates = fromEnv ? [fromEnv, ...DIR_CANDIDATES] : DIR_CANDIDATES;

  for (const candidate of candidates) {
    const dir = join(root, candidate);
    if (!(await isDirectory(dir))) continue;
    for (const name of await listFiles(dir)) {
      if (!name.endsWith('.sql')) continue;
      const content = await readText(join(dir, name));
      if (content && /--\s*migrate:up\b/i.test(content)) return dir;
    }
  }
  return null;
}
