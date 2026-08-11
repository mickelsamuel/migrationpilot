/**
 * Shared helpers for framework adapters: filesystem probing, path labelling,
 * and the version comparison every ordering rule ends up needing.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

export async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

export async function readText(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf-8');
  } catch {
    return null;
  }
}

export async function readJson<T>(path: string): Promise<T | null> {
  const raw = await readText(path);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Files directly inside `dir` (no recursion), sorted by name. Empty when the dir is missing. */
export async function listFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter(e => e.isFile())
      .map(e => e.name)
      .sort();
  } catch {
    return [];
  }
}

/** Subdirectory names directly inside `dir`, sorted by name. Empty when the dir is missing. */
export async function listDirs(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .sort();
  } catch {
    return [];
  }
}

/** Every file under `dir`, recursively, as absolute paths sorted by path. */
export async function walkFiles(dir: string, maxDepth = 8): Promise<string[]> {
  const out: string[] = [];
  async function walk(current: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const full = join(current, entry.name);
      if (entry.isDirectory()) await walk(full, depth + 1);
      else if (entry.isFile()) out.push(full);
    }
  }
  await walk(dir, 0);
  return out.sort();
}

/** Display label for a path: relative to root, always with forward slashes. */
export function labelFor(root: string, path: string): string {
  const rel = relative(root, path);
  if (rel === '') return '.';
  if (rel.startsWith('..')) return path.split(sep).join('/');
  return rel.split(sep).join('/');
}

/** Normalize a relative path for display (forward slashes, no leading "./"). */
export function toPosix(path: string): string {
  return path.split(sep).join('/').replace(/^\.\//, '');
}

/**
 * Compare dotted/underscored numeric versions the way migration tools do:
 * part by part, numerically when both parts are numeric, lexically otherwise.
 * `1.10` sorts after `1.9`; `V2` after `V1_5`.
 */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[._]/);
  const pb = b.split(/[._]/);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const xa = pa[i] ?? '';
    const xb = pb[i] ?? '';
    if (xa === xb) continue;
    const na = Number(xa);
    const nb = Number(xb);
    if (xa !== '' && xb !== '' && !Number.isNaN(na) && !Number.isNaN(nb)) {
      if (na !== nb) return na - nb;
      continue;
    }
    return xa < xb ? -1 : 1;
  }
  return 0;
}

/** Leading digits of a filename — the version for goose, dbmate, Knex, Sequelize, TypeORM. */
export function leadingNumericVersion(filename: string): string {
  const match = filename.match(/^(\d+)/);
  return match?.[1] ?? '';
}

/** True when the file has one of the given extensions (case-insensitive). */
export function hasExtension(filename: string, ...exts: string[]): boolean {
  const lower = filename.toLowerCase();
  return exts.some(e => lower.endsWith(e.toLowerCase()));
}

/** True when the SQL has at least one statement the parser could act on. */
export function hasSqlContent(sql: string): boolean {
  const stripped = sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\n]*/g, '')
    .trim();
  return stripped.length > 0;
}
