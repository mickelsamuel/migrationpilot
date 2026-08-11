/**
 * Flyway adapter — Tier 1 (full support).
 *
 * Flyway migrations are SQL files named `V<version>__<description>.sql`, found
 * in the configured `locations`. Ordering is Flyway's own: all pending
 * versioned migrations in version order, then repeatable (`R__`) migrations in
 * description order. Undo migrations (`U__`) only run on `flyway undo`, so they
 * are listed as skipped rather than analyzed as if they were going to prod.
 *
 * `flyway.conf` and `flyway.toml` are both read for locations and for the
 * prefix/separator/suffix settings, since those change what counts as a
 * migration file.
 */

import { join } from 'node:path';
import type { Adapter, AdapterResult, ResolvedMigration, SkippedFile } from './types.js';
import { compareVersions, hasExtension, isDirectory, labelFor, readText, toPosix, walkFiles } from './util.js';

interface FlywaySettings {
  locations: string[];
  prefix: string;
  repeatablePrefix: string;
  undoPrefix: string;
  separator: string;
  suffixes: string[];
  /** Config files the settings came from, relative to root */
  configFiles: string[];
}

const DEFAULT_LOCATION_CANDIDATES = [
  'sql',
  'db/migration',
  'src/main/resources/db/migration',
  'migrations',
];

export const flywayAdapter: Adapter = {
  id: 'flyway',
  name: 'Flyway',
  support: 'full',
  async resolve(root: string): Promise<AdapterResult | null> {
    const settings = await readSettings(root);
    const dirs = await resolveLocations(root, settings);
    if (dirs.length === 0) return null;

    const notes: string[] = [];
    const skipped: SkippedFile[] = [];
    const versioned: Array<ResolvedMigration & { sortKey: string }> = [];
    const repeatable: Array<ResolvedMigration & { description: string }> = [];

    for (const dir of dirs) {
      for (const file of await walkFiles(dir)) {
        const name = file.split(/[\\/]/).pop() ?? file;
        if (!hasExtension(name, ...settings.suffixes)) continue;

        const parsed = parseName(name, settings);
        if (!parsed) {
          skipped.push({
            path: file,
            label: labelFor(root, file),
            reason: `filename does not match the Flyway convention (${settings.prefix}<version>${settings.separator}<description>${settings.suffixes[0] ?? '.sql'})`,
          });
          continue;
        }
        if (parsed.kind === 'undo') {
          skipped.push({
            path: file,
            label: labelFor(root, file),
            reason: 'undo migration — only runs on `flyway undo`, never on the way forward',
          });
          continue;
        }

        const sql = await readText(file);
        if (sql === null) continue;
        const migration: ResolvedMigration = {
          path: file,
          label: labelFor(root, file),
          sql,
          version: parsed.version,
          origin: 'sql-file',
          notes: [],
        };

        if (parsed.kind === 'repeatable') {
          repeatable.push({ ...migration, description: parsed.description });
        } else {
          versioned.push({ ...migration, sortKey: parsed.version });
        }
      }
    }

    if (versioned.length === 0 && repeatable.length === 0) return null;

    versioned.sort((a, b) => compareVersions(a.sortKey, b.sortKey) || a.label.localeCompare(b.label));
    repeatable.sort((a, b) => a.description.localeCompare(b.description));

    const duplicates = findDuplicateVersions(versioned);
    for (const [version, labels] of duplicates) {
      notes.push(`Duplicate version ${version}: ${labels.join(', ')} — Flyway refuses to run with duplicate versions.`);
    }
    if (repeatable.length > 0) {
      notes.push(`${repeatable.length} repeatable migration(s) analyzed after the versioned ones, in description order.`);
    }
    if (settings.configFiles.length > 0) {
      notes.push(`Locations read from ${settings.configFiles.join(', ')}.`);
    }

    const migrations: ResolvedMigration[] = [
      ...versioned.map(({ sortKey: _sortKey, ...m }) => m),
      ...repeatable.map(({ description: _description, ...m }) => m),
    ];

    return {
      id: 'flyway',
      name: 'Flyway',
      support: 'full',
      root,
      sources: dirs.map(d => toPosix(labelFor(root, d))),
      ordering: 'Flyway version order (V…), then repeatable migrations (R…) by description',
      migrations,
      skipped,
      notes,
    };
  },
};

interface ParsedName {
  kind: 'versioned' | 'repeatable' | 'undo';
  version: string;
  description: string;
}

/** Split a Flyway filename into prefix / version / description. */
function parseName(name: string, settings: FlywaySettings): ParsedName | null {
  const suffix = settings.suffixes.find(s => name.toLowerCase().endsWith(s.toLowerCase()));
  if (!suffix) return null;
  const base = name.slice(0, name.length - suffix.length);

  const kinds: Array<{ prefix: string; kind: ParsedName['kind'] }> = [
    { prefix: settings.prefix, kind: 'versioned' },
    { prefix: settings.repeatablePrefix, kind: 'repeatable' },
    { prefix: settings.undoPrefix, kind: 'undo' },
  ];

  for (const { prefix, kind } of kinds) {
    if (prefix === '' || !base.startsWith(prefix)) continue;
    const rest = base.slice(prefix.length);
    const sepAt = rest.indexOf(settings.separator);

    if (kind === 'repeatable') {
      // R__description — repeatable migrations carry no version.
      if (sepAt !== 0) continue;
      return { kind, version: '', description: rest.slice(settings.separator.length) };
    }

    if (sepAt <= 0) continue;
    const version = rest.slice(0, sepAt);
    if (!/^[\d._]+$/.test(version)) continue;
    return { kind, version, description: rest.slice(sepAt + settings.separator.length) };
  }

  return null;
}

function findDuplicateVersions(files: Array<{ version: string; label: string }>): Map<string, string[]> {
  const byVersion = new Map<string, string[]>();
  for (const f of files) {
    const key = f.version.replace(/_/g, '.');
    byVersion.set(key, [...(byVersion.get(key) ?? []), f.label]);
  }
  return new Map([...byVersion].filter(([, labels]) => labels.length > 1));
}

/** Read locations and naming settings from flyway.conf / flyway.toml. */
async function readSettings(root: string): Promise<FlywaySettings> {
  const settings: FlywaySettings = {
    locations: [],
    prefix: 'V',
    repeatablePrefix: 'R',
    undoPrefix: 'U',
    separator: '__',
    suffixes: ['.sql'],
    configFiles: [],
  };

  const conf = await readText(join(root, 'flyway.conf'));
  if (conf !== null) {
    settings.configFiles.push('flyway.conf');
    const value = (key: string): string | undefined =>
      conf.match(new RegExp(`^\\s*flyway\\.${key}\\s*=\\s*(.+)$`, 'mi'))?.[1]?.trim();

    const locations = value('locations');
    if (locations) settings.locations.push(...locations.split(',').map(s => s.trim()).filter(Boolean));
    settings.prefix = value('sqlMigrationPrefix') ?? settings.prefix;
    settings.repeatablePrefix = value('repeatableSqlMigrationPrefix') ?? settings.repeatablePrefix;
    settings.undoPrefix = value('undoSqlMigrationPrefix') ?? settings.undoPrefix;
    settings.separator = value('sqlMigrationSeparator') ?? settings.separator;
    const suffixes = value('sqlMigrationSuffixes');
    if (suffixes) settings.suffixes = suffixes.split(',').map(s => s.trim()).filter(Boolean);
  }

  const toml = await readText(join(root, 'flyway.toml'));
  if (toml !== null) {
    settings.configFiles.push('flyway.toml');
    const array = toml.match(/^\s*(?:flyway\.)?locations\s*=\s*\[([^\]]*)\]/mi)?.[1];
    if (array) {
      for (const match of array.matchAll(/["']([^"']+)["']/g)) {
        if (match[1]) settings.locations.push(match[1]);
      }
    }
    const scalar = (key: string): string | undefined =>
      toml.match(new RegExp(`^\\s*(?:flyway\\.)?${key}\\s*=\\s*["']([^"']*)["']`, 'mi'))?.[1];
    settings.prefix = scalar('sqlMigrationPrefix') ?? settings.prefix;
    settings.repeatablePrefix = scalar('repeatableSqlMigrationPrefix') ?? settings.repeatablePrefix;
    settings.undoPrefix = scalar('undoSqlMigrationPrefix') ?? settings.undoPrefix;
    settings.separator = scalar('sqlMigrationSeparator') ?? settings.separator;
  }

  return settings;
}

/** Turn configured locations (or the conventional defaults) into real directories. */
async function resolveLocations(root: string, settings: FlywaySettings): Promise<string[]> {
  const candidates: string[] = [];

  for (const location of settings.locations) {
    if (location.startsWith('filesystem:')) {
      candidates.push(location.slice('filesystem:'.length));
    } else if (location.startsWith('classpath:')) {
      const path = location.slice('classpath:'.length);
      // Classpath locations live under the build's resource roots on disk.
      candidates.push(`src/main/resources/${path}`, `src/test/resources/${path}`, path);
    } else {
      candidates.push(location);
    }
  }

  if (candidates.length === 0) candidates.push(...DEFAULT_LOCATION_CANDIDATES);

  const dirs: string[] = [];
  for (const candidate of candidates) {
    const full = join(root, candidate);
    if (await isDirectory(full) && !dirs.includes(full)) dirs.push(full);
  }
  return dirs;
}
