/**
 * A green check from the Action has to mean every migration in scope was read.
 *
 * Before 1.6.3 it could pass having read nothing. A file that didn't parse got
 * a warning: the parser hands back no statements, no rule fires, and the check
 * went green, where the CLI exits non-zero on the same file. A file the PR
 * changed but the workspace didn't have went the same way. And the
 * `migration-path: migrations/` the site's own docs showed matched no file at
 * all, so every run reported "no migration files changed".
 *
 * Now a file the Action can't read or parse fails the run unless `fail-on` is
 * `never`, the config's `ignore` list is how to leave one out on purpose, and
 * a directory means every `.sql` file under it. The config's `rules`, `failOn`
 * and `pgVersion` apply in the Action as they do in `check`.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

const harness = vi.hoisted(() => ({
  inputs: {} as Record<string, string>,
  infos: [] as string[],
  warnings: [] as string[],
  errors: [] as Array<{ message: string; file?: string }>,
  failures: [] as string[],
  outputs: {} as Record<string, string>,
  summary: '',
  comments: [] as string[],
  changed: [] as string[],
  context: { payload: {} as Record<string, unknown>, repo: { owner: 'acme', repo: 'api' } },
}));

vi.mock('@actions/core', () => ({
  getInput: (name: string) => harness.inputs[name] ?? '',
  setSecret: () => {},
  info: (m: string) => void harness.infos.push(m),
  warning: (m: string) => void harness.warnings.push(m),
  error: (m: string, props?: { file?: string }) => void harness.errors.push({ message: m, file: props?.file }),
  setOutput: (k: string, v: string) => void (harness.outputs[k] = v),
  setFailed: (m: string) => void harness.failures.push(m),
  summary: {
    addRaw: (text: string) => {
      harness.summary = text;
      return { write: async () => {} };
    },
  },
}));

vi.mock('@actions/github', () => ({
  getOctokit: () => ({
    rest: {
      pulls: {
        listFiles: async () => ({
          data: harness.changed.map(filename => ({ filename, status: 'modified' })),
        }),
      },
      issues: {
        listComments: async () => ({ data: [] }),
        updateComment: async () => ({}),
        createComment: async ({ body }: { body: string }) => {
          harness.comments.push(body);
          return {};
        },
      },
    },
  }),
  context: harness.context,
}));

const { run } = await import('../src/action/run.js');
const { filterMigrationFiles, globMigrationFiles, migrationGlob } = await import('../src/action/migration-files.js');

/** psql runs this; PostgreSQL's own parser never will. */
const PSQL_SQL = '\\set ON_ERROR_STOP on\nALTER TABLE users ADD COLUMN age int;\n';

/** A statement MP001 always calls critical. */
const CRITICAL_SQL = 'CREATE INDEX idx_users_email ON users (email);\n';

let workspace: string;
let originalCwd: string;

/** Write a file into the workspace and list it as changed by the PR. */
function change(path: string, sql: string): void {
  writeFileSync(join(workspace, path), sql);
  harness.changed.push(path);
}

beforeEach(() => {
  originalCwd = process.cwd();
  workspace = mkdtempSync(join(tmpdir(), 'mp-action-unchecked-'));
  mkdirSync(join(workspace, 'migrations'), { recursive: true });
  process.chdir(workspace);

  harness.inputs = {
    'migration-path': 'migrations/*.sql',
    'github-token': 'token',
    'pg-version': '17',
    'fail-on': 'critical',
  };
  harness.infos = [];
  harness.warnings = [];
  harness.errors = [];
  harness.failures = [];
  harness.outputs = {};
  harness.summary = '';
  harness.comments = [];
  harness.changed = [];
  harness.context.payload = { pull_request: { number: 7 } };
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(workspace, { recursive: true, force: true });
});

describe('a migration that does not parse', () => {
  it('fails the run, naming the file and the parse error', async () => {
    change('migrations/001_psql.sql', PSQL_SQL);

    await run();

    const failed = harness.failures.join('\n');
    expect(failed).toContain('could not check 1 migration');
    expect(failed).toContain('migrations/001_psql.sql: parse error: syntax error at or near');
    expect(failed).toContain('`ignore`');
    expect(failed).not.toContain('MigrationPilot error');
    expect(harness.errors).toContainEqual({
      file: 'migrations/001_psql.sql',
      message: expect.stringContaining('could not check this file (parse error:'),
    });
  });

  it('says so in the comment and the job summary instead of reporting a clean pass', async () => {
    change('migrations/001_psql.sql', PSQL_SQL);

    await run();

    const comment = harness.comments.join('\n');
    expect(comment).toContain('Migrations Not Checked');
    expect(comment).toContain('[!WARNING]');
    expect(comment).toContain('<code>migrations/001_psql.sql</code>: parse error');
    expect(comment).not.toContain('No Migrations Detected');
    expect(harness.summary).toContain('| Not checked | 1 |');
    expect(harness.summary).toContain('`migrations/001_psql.sql`');
    expect(harness.summary).not.toContain('All migrations are safe to apply');
  });

  it('still reports what the other files found', async () => {
    change('migrations/001_psql.sql', PSQL_SQL);
    change('migrations/002_index.sql', CRITICAL_SQL);

    await run();

    const failed = harness.failures.join('\n');
    expect(failed).toContain('could not check 1 migration');
    expect(failed).toContain('critical');
    expect(harness.outputs['risk-level']).toBe('RED');
    expect(harness.comments.join('\n')).toContain('[!WARNING]');
    expect(existsSync(join(workspace, 'migrationpilot-results.sarif'))).toBe(true);
  });

  it('is reported but does not fail the run under fail-on: never', async () => {
    harness.inputs['fail-on'] = 'never';
    change('migrations/001_psql.sql', PSQL_SQL);

    await run();

    expect(harness.failures).toEqual([]);
    expect(harness.errors.map(e => e.file)).toContain('migrations/001_psql.sql');
    expect(harness.comments.join('\n')).toContain('Migrations Not Checked');
  });
});

describe('a changed migration missing from the workspace', () => {
  it('fails the run and points at the checkout', async () => {
    harness.changed.push('migrations/009_elsewhere.sql');

    await run();

    const failed = harness.failures.join('\n');
    expect(failed).toContain('migrations/009_elsewhere.sql: not found in the workspace');
    expect(failed).toContain("check out the pull request's commit");
  });
});

describe('the config ignore list', () => {
  it('leaves a matching file out, and says which', async () => {
    writeFileSync(join(workspace, '.migrationpilotrc.yml'), 'ignore:\n  - "migrations/seed_*.sql"\n');
    change('migrations/seed_users.sql', PSQL_SQL);

    await run();

    expect(harness.failures).toEqual([]);
    expect(harness.infos).toContain('Ignored by config: migrations/seed_users.sql');
    expect(harness.infos.filter(m => m.startsWith('Analyzing: '))).toEqual([]);
    const comment = harness.comments.join('\n');
    expect(comment).toContain('No Migrations to Check');
    expect(comment).toContain('Ignored by your MigrationPilot config: <code>migrations/seed_users.sql</code>');
    expect(harness.summary).toContain('| Ignored by config | 1 |');
  });

  it('comes from the file the config-file input names, wherever it lives', async () => {
    mkdirSync(join(workspace, 'ci'));
    writeFileSync(join(workspace, 'ci', 'migrationpilot.yml'), 'ignore:\n  - "migrations/seed_*.sql"\n');
    harness.inputs['config-file'] = 'ci/migrationpilot.yml';
    change('migrations/seed_users.sql', PSQL_SQL);

    await run();

    expect(harness.failures).toEqual([]);
    expect(harness.infos).toContain('Ignored by config: migrations/seed_users.sql');
  });
});

describe('the migration-path input', () => {
  it('reads a directory as every .sql file under it', async () => {
    harness.inputs['migration-path'] = 'migrations/';
    mkdirSync(join(workspace, 'migrations', 'nested'));
    change('migrations/001_index.sql', CRITICAL_SQL);
    change('migrations/nested/002_index.sql', CRITICAL_SQL);
    harness.changed.push('src/app.ts');

    await run();

    expect(harness.infos).toContain('migration-path "migrations/" is a directory: analyzing migrations/**/*.sql');
    expect(harness.infos.filter(m => m.startsWith('Analyzing: '))).toEqual([
      'Analyzing: migrations/001_index.sql',
      'Analyzing: migrations/nested/002_index.sql',
    ]);
    expect(harness.failures.join('\n')).toContain('critical');
  });

  it('reads a glob written with Windows separators as the same glob, not a directory', async () => {
    harness.inputs['migration-path'] = 'migrations\\*.sql';
    change('migrations/001_index.sql', CRITICAL_SQL);

    await run();

    expect(harness.infos.filter(m => m.includes('is a directory'))).toEqual([]);
    expect(harness.infos.filter(m => m.startsWith('Analyzing: '))).toEqual(['Analyzing: migrations/001_index.sql']);
  });

  it('expands only what is a directory', () => {
    expect(migrationGlob('migrations/')).toBe('migrations/**/*.sql');
    expect(migrationGlob('db/migrations')).toBe('db/migrations/**/*.sql');
    expect(migrationGlob('db\\migrations\\')).toBe('db/migrations/**/*.sql');
    expect(migrationGlob('.')).toBe('./**/*.sql');
    expect(migrationGlob(' migrations/*.sql ')).toBe('migrations/*.sql');
    expect(migrationGlob('migrations/001_init.sql')).toBe('migrations/001_init.sql');
  });

  it('lets ** match the files directly in the directory too', () => {
    const changed = ['migrations/001_init.sql', 'migrations/old/002_x.sql', 'docs/example.sql'];
    expect(filterMigrationFiles(changed, 'migrations/**/*.sql')).toEqual([
      'migrations/001_init.sql',
      'migrations/old/002_x.sql',
    ]);
    expect(filterMigrationFiles(changed, './migrations/*.sql')).toEqual(['migrations/001_init.sql']);
  });

  it('matches the same files on the pull request path as the tree fallback does', async () => {
    const files = [
      'db/V1__init.sql',
      'db/V2__users.psql',
      'migrations/001_init.sql',
      'migrations/old/002_x.sql',
      'prisma/migrations/2024_init/migration.sql',
    ];
    for (const file of files) {
      mkdirSync(join(workspace, file, '..'), { recursive: true });
      writeFileSync(join(workspace, file), 'SELECT 1;\n');
    }
    const patterns = [
      'migrations/*.sql',
      'migrations/**/*.sql',
      '**/*.sql',
      'migrations/**',
      'prisma/migrations/*/migration.sql',
      'migrations/0??_*.sql',
      'migrations/[0-9]*.sql',
      'db/V*.{sql,psql}',
      '{migrations,prisma}/**/*.sql',
    ];
    for (const pattern of patterns) {
      expect(filterMigrationFiles(files, pattern), pattern).toEqual(await globMigrationFiles(pattern, workspace));
    }
  });
});

describe("the config's rules, failOn and pgVersion", () => {
  /** Warnings only (MP020, MP021): fails under failOn: warning, passes under critical. */
  const REINDEX_SQL = "SET lock_timeout = '5s';\nREINDEX INDEX idx_users_email;\n";

  /** MP046 is critical from PostgreSQL 14, where DETACH ... CONCURRENTLY exists, and silent before it. */
  const DETACH_SQL = "SET lock_timeout = '5s';\nALTER TABLE events DETACH PARTITION events_2020;\n";

  function config(yaml: string): void {
    writeFileSync(join(workspace, '.migrationpilotrc.yml'), yaml);
  }

  it('turns off the rules it disables, in either form', async () => {
    // MP001 and MP004 are the only critical findings on CRITICAL_SQL.
    config('rules:\n  MP001: false\n  MP004:\n    enabled: false\n');
    change('migrations/001_index.sql', CRITICAL_SQL);

    await run();

    expect(harness.infos).toContain('Disabled by config: MP001, MP004');
    expect(harness.errors.filter(e => /\[MP00[14]\]/.test(e.message))).toEqual([]);
    expect(harness.failures).toEqual([]);
  });

  it('turns off the rules a preset disables', async () => {
    config('extends: "migrationpilot:startup"\n');
    change('migrations/001_index.sql', CRITICAL_SQL);

    await run();

    expect(harness.infos.find(m => m.startsWith('Disabled by config:'))).toContain('MP037');
  });

  it('sets the fail threshold when the workflow does not', async () => {
    delete harness.inputs['fail-on'];
    config('failOn: warning\n');
    change('migrations/001_reindex.sql', REINDEX_SQL);

    await run();

    expect(harness.failures.join('\n')).toContain('found violations');
  });

  it('gives way to a fail-on the workflow sets', async () => {
    harness.inputs['fail-on'] = 'critical';
    config('failOn: warning\n');
    change('migrations/001_reindex.sql', REINDEX_SQL);

    await run();

    expect(harness.failures).toEqual([]);
    expect(harness.outputs.violations).not.toBe('0');
  });

  it('sets the PostgreSQL version when the workflow does not', async () => {
    delete harness.inputs['pg-version'];
    config('pgVersion: 13\n');
    change('migrations/001_detach.sql', DETACH_SQL);

    await run();

    expect(harness.errors.filter(e => e.message.includes('[MP046]'))).toEqual([]);
    expect(harness.failures).toEqual([]);
  });

  it('gets the chance to, because action.yml gives neither input a default', () => {
    // The runner fills in an action.yml default before the Action reads the
    // input, so a default there would always beat the config.
    const inputs = parseYaml(readFileSync(join(originalCwd, 'action.yml'), 'utf-8')).inputs;
    expect(inputs['fail-on'].default).toBeUndefined();
    expect(inputs['pg-version'].default).toBeUndefined();
  });

  it('defaults to PostgreSQL 17 with no version anywhere', async () => {
    delete harness.inputs['pg-version'];
    change('migrations/001_detach.sql', DETACH_SQL);

    await run();

    expect(harness.errors.filter(e => e.message.includes('[MP046]'))).not.toEqual([]);
    expect(harness.failures.join('\n')).toContain('critical');
  });
});

describe('a config-file input that names no file', () => {
  it('fails the run instead of falling back to defaults', async () => {
    harness.inputs['config-file'] = 'ci/missing.yml';
    change('migrations/002_index.sql', CRITICAL_SQL);

    await run();

    const failed = harness.failures.join('\n');
    expect(failed).toContain('MigrationPilot error');
    expect(failed).toContain('Config path not found');
    expect(harness.infos.filter(m => m.startsWith('Analyzing: '))).toEqual([]);
  });
});
