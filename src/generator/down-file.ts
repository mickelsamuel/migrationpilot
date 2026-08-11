/**
 * Finding the down migration that pairs with an up migration.
 *
 * Split out from ./grade.ts on purpose: grading is pure and runs in the browser
 * playground, this half touches the filesystem. Keep the import direction
 * one-way — grade.ts may import the `CompanionDown` type from here, never the
 * functions.
 */

import { access } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

export interface CompanionDown {
  present: boolean;
  /** Path to the down file, when the companion is a separate file. */
  path?: string;
  /** `file` — a sibling down migration. `inline` — a down section in this file. */
  kind?: 'file' | 'inline';
}

/**
 * Does this migration ship its own down section?
 *
 * Covers the tools that keep up and down in one file: dbmate, goose, and
 * Liquibase's two SQL-format rollback markers.
 */
export function hasInlineDownSection(sql: string): boolean {
  return /^[ \t]*(--\s*migrate:down|--\s*\+goose\s+down|--rollback\s+\S|--\/\/@UNDO)/im.test(sql);
}

/**
 * Look for a companion down migration next to `filePath`.
 *
 * @returns the path of the first companion found, or undefined.
 */
export async function findCompanionDownFile(filePath: string): Promise<string | undefined> {
  for (const candidate of downFileCandidates(filePath)) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Not there — try the next convention.
    }
  }
  return undefined;
}

/**
 * Resolve whether a migration has a hand-written down path at all — either an
 * inline down section or a companion file.
 */
export async function resolveCompanionDown(filePath: string, sql: string): Promise<CompanionDown> {
  if (hasInlineDownSection(sql)) {
    return { present: true, kind: 'inline' };
  }

  const path = await findCompanionDownFile(filePath);
  return path ? { present: true, path, kind: 'file' } : { present: false };
}

/**
 * Every path that could hold the reverse of `filePath`, in the order we trust
 * them. Covers the common layouts: `.down.sql` / `.rollback.sql` / `.undo.sql`
 * siblings, golang-migrate's `.up.sql` → `.down.sql` pair, Flyway's
 * `V1__x.sql` → `U1__x.sql` undo script, and `down/` or `revert/` directories.
 *
 * Exported for testing — it does not touch the filesystem.
 */
export function downFileCandidates(filePath: string): string[] {
  const dir = dirname(filePath);
  const file = basename(filePath);
  const ext = file.slice(file.lastIndexOf('.')) || '.sql';
  const stem = file.slice(0, file.length - ext.length);
  const candidates: string[] = [];

  // golang-migrate: 001_x.up.sql → 001_x.down.sql
  if (stem.toLowerCase().endsWith('.up')) {
    candidates.push(join(dir, `${stem.slice(0, -3)}.down${ext}`));
  }

  for (const suffix of ['.down', '.rollback', '.undo', '_down', '_rollback', '-down']) {
    candidates.push(join(dir, `${stem}${suffix}${ext}`));
  }

  // Flyway undo: V1__add_users.sql → U1__add_users.sql
  if (/^V/.test(stem)) {
    candidates.push(join(dir, `U${stem.slice(1)}${ext}`));
  }

  // Directory-per-direction layouts, both as a sibling and as a parent folder.
  for (const folder of ['down', 'rollback', 'revert', 'undo']) {
    candidates.push(join(dir, folder, file));
    candidates.push(join(dirname(dir), folder, file));
  }

  return candidates;
}
