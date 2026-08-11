/**
 * Prisma adapter — Tier 1 (full support).
 *
 * `prisma migrate dev` writes plain SQL to
 * `prisma/migrations/<timestamp>_<name>/migration.sql`, and applies those
 * folders in timestamp (lexicographic) order. Both the schema location and the
 * migrations directory can be moved with `prisma.config.ts` or the `prisma`
 * key in package.json, so those are read before falling back to the default.
 */

import { join } from 'node:path';
import type { Adapter, AdapterResult, ResolvedMigration, SkippedFile } from './types.js';
import { exists, isDirectory, labelFor, listDirs, listFiles, readJson, readText, toPosix } from './util.js';

const CONFIG_FILES = ['prisma.config.ts', 'prisma.config.mts', 'prisma.config.js', 'prisma.config.mjs'];

export const prismaAdapter: Adapter = {
  id: 'prisma',
  name: 'Prisma',
  support: 'full',
  async resolve(root: string): Promise<AdapterResult | null> {
    const migrationsDir = await findMigrationsDir(root);
    if (!migrationsDir) return null;

    const notes: string[] = [];
    const skipped: SkippedFile[] = [];
    const migrations: ResolvedMigration[] = [];

    // Prisma applies migration folders in lexicographic order of their names,
    // which for its `YYYYMMDDHHMMSS_name` convention is chronological order.
    const dirs = (await listDirs(migrationsDir)).sort();

    for (const dir of dirs) {
      const full = join(migrationsDir, dir, 'migration.sql');
      const sql = await readText(full);
      if (sql === null) {
        skipped.push({
          path: join(migrationsDir, dir),
          label: labelFor(root, join(migrationsDir, dir)),
          reason: 'folder has no migration.sql',
        });
        continue;
      }
      migrations.push({
        path: full,
        label: labelFor(root, full),
        sql,
        version: dir,
        origin: 'sql-file',
        notes: [],
      });
    }

    const lock = await readText(join(migrationsDir, 'migration_lock.toml'));
    const provider = lock?.match(/provider\s*=\s*"([^"]+)"/)?.[1];
    if (provider && provider !== 'postgresql') {
      notes.push(`migration_lock.toml declares provider "${provider}" — MigrationPilot's rules are PostgreSQL-specific.`);
    }

    if (dirs.length === 0) {
      notes.push('No migration folders yet — run `prisma migrate dev` to create one.');
    }

    return {
      id: 'prisma',
      name: 'Prisma',
      support: 'full',
      root,
      sources: [toPosix(labelFor(root, migrationsDir))],
      ordering: 'migration folder name (timestamp), the order Prisma applies them in',
      migrations,
      skipped,
      notes,
    };
  },
};

/** Locate the migrations directory, honoring prisma.config.ts and package.json overrides. */
async function findMigrationsDir(root: string): Promise<string | null> {
  for (const file of CONFIG_FILES) {
    const source = await readText(join(root, file));
    if (source === null) continue;

    const migrationsPath = source.match(/migrations\s*:\s*\{[^}]*?path\s*:\s*['"`]([^'"`]+)['"`]/s)?.[1];
    if (migrationsPath) {
      const dir = join(root, migrationsPath);
      if (await isDirectory(dir)) return dir;
    }

    const schemaPath = source.match(/(?:^|[\s,{])schema\s*:\s*['"`]([^'"`]+)['"`]/)?.[1];
    if (schemaPath) {
      const dir = await migrationsDirForSchema(root, schemaPath);
      if (dir) return dir;
    }
  }

  const pkg = await readJson<{ prisma?: { schema?: string } }>(join(root, 'package.json'));
  if (pkg?.prisma?.schema) {
    const dir = await migrationsDirForSchema(root, pkg.prisma.schema);
    if (dir) return dir;
  }

  const fallback = join(root, 'prisma', 'migrations');
  if (await isDirectory(fallback)) return fallback;

  // A schema with no migrations directory still identifies the project — report
  // it so the user gets "Prisma detected, 0 migrations" instead of silence.
  if (await exists(join(root, 'prisma', 'schema.prisma'))) return fallback;
  if (await isDirectory(join(root, 'prisma', 'schema'))) return fallback;

  return null;
}

/** `prisma/schema.prisma` → `prisma/migrations`; `prisma/` (folder schema) → `prisma/migrations`. */
async function migrationsDirForSchema(root: string, schemaPath: string): Promise<string | null> {
  const full = join(root, schemaPath);
  const dir = (await isDirectory(full)) ? full : join(full, '..');
  const candidate = join(dir, 'migrations');
  if (await isDirectory(candidate)) return candidate;
  const files = await listFiles(dir);
  return files.some(f => f.endsWith('.prisma')) ? candidate : null;
}
