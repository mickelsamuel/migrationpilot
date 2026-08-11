/**
 * End-to-end coverage of zero-config `check`: run the built CLI inside the
 * framework fixtures the way a user would run it inside their repo.
 * Requires `pnpm build`.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { execFile } from 'node:child_process';
import { resolve, join } from 'node:path';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const CLI = resolve('dist/cli.cjs');
const FIXTURES = resolve('tests/fixtures/frameworks');

function runCli(args: string[], cwd: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise(res => {
    execFile('node', [CLI, ...args], {
      cwd,
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
      timeout: 30_000,
    }, (error, stdout, stderr) => {
      res({
        stdout: stdout.toString(),
        stderr: stderr.toString(),
        exitCode: error?.code !== undefined ? (typeof error.code === 'number' ? error.code : 1) : 0,
      });
    });
  });
}

beforeAll(() => {
  if (!existsSync(CLI)) {
    throw new Error('dist/cli.cjs not found. Run `pnpm build` before these tests.');
  }
});

describe('check with no arguments', () => {
  it('detects Prisma and says what it is analyzing', async () => {
    const { stdout, exitCode } = await runCli(['check'], join(FIXTURES, 'prisma'));
    expect(stdout).toContain('Detected Prisma — analyzing 3 migrations from prisma/migrations/');
    expect(stdout).toContain('Ordering: migration folder name (timestamp)');
    expect(stdout).toContain('prisma/migrations/20240401000000_wip — folder has no migration.sql');
    // The fixture ships a non-concurrent CREATE INDEX, so this must fail the gate.
    expect(exitCode).toBe(2);
  });

  it('analyzes every migration the adapter found', async () => {
    const { stdout } = await runCli(['check', '--fail-on', 'never'], join(FIXTURES, 'prisma'));
    expect(stdout).toContain('20240101120000_init/migration.sql');
    expect(stdout).toContain('20240215093000_add_email_index/migration.sql');
    expect(stdout).toContain('20240320174500_name_required/migration.sql');
  });

  it('keeps JSON output parseable — the banner goes to stderr', async () => {
    const { stdout, stderr } = await runCli(['check', '--format', 'json', '--fail-on', 'never'], join(FIXTURES, 'prisma'));
    expect(stderr).toContain('Detected Prisma');
    const parsed = JSON.parse(stdout) as { files: Array<{ file: string }> };
    expect(parsed.files).toHaveLength(3);
    expect(parsed.files[0]!.file).toContain('20240101120000_init');
  });

  it('orders Flyway migrations V1, V1.1, V2, V10, then repeatable', async () => {
    const { stdout } = await runCli(['check', '--fail-on', 'never', '--format', 'json'], join(FIXTURES, 'flyway'));
    const order = [...stdout.matchAll(/(V1__create_users|V1\.1__add_last_login|V2__add_email_index|V10__add_orders|R__active_users_view)\.sql/g)]
      .map(m => m[1]);
    expect(order.slice(0, 5)).toEqual([
      'V1__create_users',
      'V1.1__add_last_login',
      'V2__add_email_index',
      'V10__add_orders',
      'R__active_users_view',
    ]);
  });

  it('fails, rather than passing quietly, when a framework has no analyzable SQL', async () => {
    const { stdout, stderr, exitCode } = await runCli(['check', '--fail-on', 'never'], join(FIXTURES, 'django'));
    expect(stdout).toContain('none analyzable');
    expect(stdout).toContain('python manage.py sqlmigrate shop 0001_initial');
    expect(stderr).toContain('Nothing was analyzed — this is not a pass');
    expect(exitCode).toBe(1);
  });

  it('explains itself when no framework is present', async () => {
    const { stderr, exitCode } = await runCli(['check'], join(FIXTURES, 'empty'));
    expect(stderr).toContain('No migration framework detected');
    expect(stderr).toContain('prisma, drizzle, flyway');
    expect(exitCode).toBe(1);
  });
});

describe('check --framework', () => {
  it('forces a specific adapter', async () => {
    const { stdout } = await runCli(['check', '.', '--framework', 'goose', '--fail-on', 'never'], join(FIXTURES, 'goose'));
    expect(stdout).toContain('Detected goose');
    expect(stdout).toContain('Only the `-- +goose Up` section');
  });

  it('fails when the forced framework is not there', async () => {
    const { stderr, exitCode } = await runCli(['check', '.', '--framework', 'drizzle'], join(FIXTURES, 'prisma'));
    expect(stderr).toContain('No drizzle migrations found');
    expect(exitCode).toBe(1);
  });
});

describe('check --from-command', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'mp-from-command-'));
  const printer = join(scratch, 'print-sql.js');
  const failer = join(scratch, 'fail.js');
  const silent = join(scratch, 'silent.js');

  beforeAll(() => {
    writeFileSync(printer, "console.log('CREATE INDEX idx_users_email ON users (email);');\n");
    writeFileSync(failer, "console.error('boom');\nprocess.exit(3);\n");
    writeFileSync(silent, 'process.exit(0);\n');
  });

  it('analyzes the SQL a command prints', async () => {
    const { stdout, exitCode } = await runCli(['check', '--from-command', `node "${printer}"`], FIXTURES);
    expect(stdout).toContain('Analyzing generated SQL');
    expect(stdout).toContain('MP001');
    expect(exitCode).toBe(2);
  });

  it('refuses to analyze partial output when the command fails', async () => {
    const { stderr, exitCode } = await runCli(['check', '--from-command', `node "${failer}"`], FIXTURES);
    expect(stderr).toContain('exited with code 3');
    expect(stderr).toContain('refusing to analyze partial output');
    expect(exitCode).toBe(1);
  });

  it('says so when the command prints nothing', async () => {
    const { stderr, exitCode } = await runCli(['check', '--from-command', `node "${silent}"`], FIXTURES);
    expect(stderr).toContain('printed nothing to stdout');
    expect(exitCode).toBe(1);
  });
});

describe('check with an explicit directory', () => {
  it('still uses the plain glob, unchanged', async () => {
    const { stdout } = await runCli(
      ['check', 'db/migration', '--pattern', 'V1__*.sql', '--fail-on', 'never'],
      join(FIXTURES, 'flyway'),
    );
    expect(stdout).toContain('V1__create_users.sql');
    expect(stdout).not.toContain('Detected Flyway');
  });

  it('reports an empty directory the way it always did', async () => {
    const { stdout, exitCode } = await runCli(
      ['check', 'db/migration', '--pattern', 'nothing-here-*.sql'],
      join(FIXTURES, 'flyway'),
    );
    expect(stdout).toContain('No SQL files found');
    expect(exitCode).toBe(0);
  });
});
