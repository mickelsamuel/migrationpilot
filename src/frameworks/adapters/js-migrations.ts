/**
 * TypeORM / Sequelize / Knex adapters — Tier 2 (static extraction).
 *
 * These migrations are JavaScript or TypeScript. Raw SQL passed to
 * `queryRunner.query(...)`, `knex.raw(...)` or `sequelize.query(...)` as a
 * plain string literal is extracted and analyzed for real. Anything the file
 * builds at runtime — interpolated templates, concatenation, schema-builder
 * calls — is reported per file with the reason, never silently dropped and
 * never guessed at.
 */

import { join } from 'node:path';
import type { FrameworkId } from '../detect.js';
import type { Adapter, AdapterResult, FrameworkRecipe, ResolvedMigration, SkippedFile } from './types.js';
import { compareVersions, isDirectory, labelFor, leadingNumericVersion, listFiles, readJson, readText, toPosix } from './util.js';
import { extractSqlFromJs } from './js-extract.js';

const SOURCE_EXTENSIONS = ['.ts', '.js', '.mjs', '.cjs', '.mts', '.cts'];

const SHARED_RECIPE_TAIL = [
  'For migrations that build SQL at runtime, print the SQL your ORM will actually run and pipe it in:',
  '  migrationpilot check --from-command "<command that prints SQL to stdout>"',
];

interface JsFrameworkSpec {
  id: FrameworkId;
  name: string;
  /** Directories to try, in order */
  dirCandidates: string[];
  /** Locate a configured migrations directory, if the framework has one */
  configuredDir?: (root: string) => Promise<string | null>;
  /** Extra evidence the framework is in use at all */
  detect: (root: string) => Promise<boolean>;
  /** Content signature that confirms a directory holds this framework's migrations */
  signature: RegExp;
  ordering: string;
  recipe: FrameworkRecipe;
}

const typeormSpec: JsFrameworkSpec = {
  id: 'typeorm',
  name: 'TypeORM',
  dirCandidates: ['src/migrations', 'src/migration', 'src/database/migrations', 'src/db/migrations', 'migrations', 'db/migrations'],
  detect: async root =>
    (await anyExists(root, ['ormconfig.json', 'ormconfig.js', 'ormconfig.ts', 'data-source.ts', 'src/data-source.ts', 'ormconfig.yml'])) ||
    (await hasDependency(root, 'typeorm')),
  signature: /MigrationInterface|queryRunner/,
  ordering: 'timestamp prefix of the filename — the order TypeORM runs migrations in',
  recipe: {
    summary: 'TypeORM migrations are TypeScript; only raw `queryRunner.query()` string literals can be read statically.',
    steps: [
      'Migrations written with the query-builder API (`queryRunner.createTable(...)`) produce SQL only at runtime.',
      ...SHARED_RECIPE_TAIL,
      '  e.g. run the migration against a scratch database with `logging: ["query"]` and capture the log.',
    ],
  },
};

const sequelizeSpec: JsFrameworkSpec = {
  id: 'sequelize',
  name: 'Sequelize',
  dirCandidates: ['migrations', 'db/migrations', 'src/migrations', 'database/migrations'],
  configuredDir: async root => {
    const rc = await readText(join(root, '.sequelizerc'));
    const match = rc?.match(/['"]migrations-path['"]\s*:\s*[^'"]*['"]([^'"]+)['"]/);
    return match?.[1] ?? null;
  },
  detect: async root => (await anyExists(root, ['.sequelizerc'])) || (await hasDependency(root, 'sequelize')),
  signature: /queryInterface|sequelize/i,
  ordering: 'filename order — the order sequelize-cli runs migrations in',
  recipe: {
    summary: 'Sequelize migrations are JavaScript; only raw `sequelize.query()` string literals can be read statically.',
    steps: [
      '`queryInterface.addColumn(...)` and friends generate their SQL at runtime.',
      ...SHARED_RECIPE_TAIL,
    ],
  },
};

const knexSpec: JsFrameworkSpec = {
  id: 'knex',
  name: 'Knex.js',
  dirCandidates: ['migrations', 'db/migrations', 'src/migrations', 'database/migrations'],
  configuredDir: async root => {
    for (const file of ['knexfile.js', 'knexfile.ts', 'knexfile.mjs', 'knexfile.cjs']) {
      const source = await readText(join(root, file));
      const match = source?.match(/migrations\s*:\s*\{[^}]*?directory\s*:\s*['"`]([^'"`]+)['"`]/s);
      if (match?.[1]) return match[1];
    }
    return null;
  },
  detect: async root =>
    (await anyExists(root, ['knexfile.js', 'knexfile.ts', 'knexfile.mjs', 'knexfile.cjs'])) ||
    (await hasDependency(root, 'knex')),
  signature: /knex/i,
  ordering: 'filename order — the order Knex runs migrations in',
  recipe: {
    summary: 'Knex migrations are JavaScript; only `knex.raw()` string literals can be read statically.',
    steps: [
      'Schema-builder chains (`knex.schema.table(...)`) generate their SQL at runtime — `.toSQL()`/`.toString()` will print it.',
      ...SHARED_RECIPE_TAIL,
    ],
  },
};

export const typeormAdapter: Adapter = makeAdapter(typeormSpec);
export const sequelizeAdapter: Adapter = makeAdapter(sequelizeSpec);
export const knexAdapter: Adapter = makeAdapter(knexSpec);

function makeAdapter(spec: JsFrameworkSpec): Adapter {
  return {
    id: spec.id,
    name: spec.name,
    support: 'extracted',
    resolve: root => resolveJsMigrations(root, spec),
  };
}

async function resolveJsMigrations(root: string, spec: JsFrameworkSpec): Promise<AdapterResult | null> {
  if (!(await spec.detect(root))) return null;

  const dir = await findDir(root, spec);
  if (!dir) return null;

  const notes: string[] = [];
  const skipped: SkippedFile[] = [];
  const migrations: ResolvedMigration[] = [];

  for (const name of await listFiles(dir)) {
    if (name.endsWith('.d.ts') || !SOURCE_EXTENSIONS.some(ext => name.endsWith(ext))) continue;
    const path = join(dir, name);
    const source = await readText(path);
    if (source === null) continue;

    const extraction = extractSqlFromJs(source);
    const label = labelFor(root, path);

    if (extraction.statements.length === 0) {
      skipped.push({ path, label, reason: skipReason(extraction.usesSchemaBuilder, extraction.dynamic.length) });
      continue;
    }

    const fileNotes: string[] = [];
    if (extraction.dynamic.length > 0) {
      const lines = extraction.dynamic.map(d => `line ${d.line} (${d.reason})`).join(', ');
      fileNotes.push(`${extraction.dynamic.length} call(s) could not be extracted statically: ${lines}`);
    }
    if (!extraction.foundUp) {
      fileNotes.push('no up() entry point recognized — the whole file was scanned, which may include down-migration SQL');
    }
    if (extraction.usesSchemaBuilder) {
      fileNotes.push('also calls the schema-builder API, whose SQL is generated at runtime and was not analyzed');
    }

    migrations.push({
      path,
      label,
      sql: extraction.sql,
      version: leadingNumericVersion(name) || name,
      origin: 'static-extract',
      notes: fileNotes,
    });
  }

  if (migrations.length === 0 && skipped.length === 0) return null;

  migrations.sort((a, b) => compareVersions(a.version, b.version) || a.label.localeCompare(b.label));

  notes.push('SQL was extracted from string literals in the up() migration only.');
  if (skipped.length > 0) {
    notes.push(`${skipped.length} of ${skipped.length + migrations.length} migration file(s) had no statically readable SQL — see the list below.`);
  }

  return {
    id: spec.id,
    name: spec.name,
    support: 'extracted',
    root,
    sources: [toPosix(labelFor(root, dir))],
    ordering: spec.ordering,
    migrations,
    skipped,
    notes,
    recipe: spec.recipe,
  };
}

function skipReason(usesSchemaBuilder: boolean, dynamicCount: number): string {
  if (dynamicCount > 0) {
    return `${dynamicCount} raw-SQL call(s) build their SQL at runtime — cannot statically extract`;
  }
  if (usesSchemaBuilder) {
    return 'uses the schema-builder API — the SQL is generated at runtime and cannot be read from the file';
  }
  return 'no raw SQL literals found';
}

async function findDir(root: string, spec: JsFrameworkSpec): Promise<string | null> {
  const configured = await spec.configuredDir?.(root);
  const candidates = configured ? [configured, ...spec.dirCandidates] : spec.dirCandidates;

  for (const candidate of candidates) {
    const dir = join(root, candidate);
    if (!(await isDirectory(dir))) continue;
    const files = (await listFiles(dir)).filter(f => !f.endsWith('.d.ts') && SOURCE_EXTENSIONS.some(ext => f.endsWith(ext)));
    if (files.length === 0) continue;
    for (const file of files) {
      const source = await readText(join(dir, file));
      if (source && spec.signature.test(source)) return dir;
    }
  }
  return null;
}

async function anyExists(root: string, files: string[]): Promise<boolean> {
  for (const file of files) {
    if (await readText(join(root, file)) !== null) return true;
  }
  return false;
}

async function hasDependency(root: string, name: string): Promise<boolean> {
  const pkg = await readJson<{ dependencies?: Record<string, string>; devDependencies?: Record<string, string> }>(
    join(root, 'package.json'),
  );
  return Boolean(pkg?.dependencies?.[name] ?? pkg?.devDependencies?.[name]);
}
