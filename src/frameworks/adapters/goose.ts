/**
 * goose adapter — Tier 1 (full support).
 *
 * goose keeps the up and down migration in one SQL file, separated by
 * `-- +goose Up` / `-- +goose Down`. Only the up half is analyzed; the down
 * half is blanked out so violation line numbers still match the file.
 *
 * Ordering is by the numeric prefix of the filename, which is what goose sorts
 * on — timestamps (`20170506082420_x.sql`) or sequence numbers (`00001_x.sql`).
 */

import { join } from 'node:path';
import type { Adapter, AdapterResult, ResolvedMigration, SkippedFile } from './types.js';
import { compareVersions, isDirectory, labelFor, leadingNumericVersion, listFiles, readText, toPosix } from './util.js';
import { extractGooseUp } from './sections.js';

const DIR_CANDIDATES = [
  'migrations',
  'db/migrations',
  'sql/migrations',
  'db/migration',
  'internal/migrations',
];

export const gooseAdapter: Adapter = {
  id: 'goose',
  name: 'goose',
  support: 'full',
  async resolve(root: string): Promise<AdapterResult | null> {
    const dir = await findDir(root);
    if (!dir) return null;

    const notes: string[] = [];
    const skipped: SkippedFile[] = [];
    const migrations: ResolvedMigration[] = [];

    for (const name of await listFiles(dir)) {
      const path = join(dir, name);

      if (name.endsWith('.go')) {
        skipped.push({
          path,
          label: labelFor(root, path),
          reason: 'Go migration — the SQL is built in Go code and cannot be read statically',
        });
        continue;
      }
      if (!name.endsWith('.sql')) continue;

      const raw = await readText(path);
      if (raw === null) continue;

      const extracted = extractGooseUp(raw);
      if (!extracted.foundUp) {
        skipped.push({
          path,
          label: labelFor(root, path),
          reason: 'no `-- +goose Up` marker — goose would reject this file too',
        });
        continue;
      }

      const fileNotes: string[] = [];
      if (extracted.directives.includes('NO TRANSACTION')) {
        fileNotes.push('declares `-- +goose NO TRANSACTION` — statements run unwrapped');
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
    notes.push('Only the `-- +goose Up` section of each file is analyzed.');

    return {
      id: 'goose',
      name: 'goose',
      support: 'full',
      root,
      sources: [toPosix(labelFor(root, dir))],
      ordering: 'numeric filename prefix (goose version order)',
      migrations,
      skipped,
      notes,
    };
  },
};

/** A directory is goose's when its SQL files carry goose annotations. */
async function findDir(root: string): Promise<string | null> {
  const fromEnv = process.env.GOOSE_MIGRATION_DIR;
  const candidates = fromEnv ? [fromEnv, ...DIR_CANDIDATES] : DIR_CANDIDATES;

  for (const candidate of candidates) {
    const dir = join(root, candidate);
    if (!(await isDirectory(dir))) continue;
    for (const name of await listFiles(dir)) {
      if (!name.endsWith('.sql')) continue;
      const content = await readText(join(dir, name));
      if (content && /--\s*\+goose\s/i.test(content)) return dir;
    }
  }
  return null;
}
