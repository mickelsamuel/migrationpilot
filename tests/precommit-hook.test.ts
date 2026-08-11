/**
 * Guards for the distribution surfaces that are plain config files: the
 * pre-commit hook manifest and the launcher package that backs it.
 *
 * The hook pins an npm version of the launcher, so a version bump that forgets
 * the manifest ships a hook that installs a stale CLI. These tests fail the
 * build instead.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';

const root = resolve(__dirname, '..');
const CLI = resolve(root, 'dist/cli.cjs');
const CLEAN_SQL = resolve(root, 'tests/fixtures/e2e/clean.sql');
const UNSAFE_SQL = resolve(root, 'tests/fixtures/e2e/unsafe.sql');

function runCli(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise(res => {
    execFile(
      'node',
      [CLI, ...args],
      { env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' }, timeout: 15_000 },
      (error, stdout, stderr) => {
        res({
          stdout: stdout.toString(),
          stderr: stderr.toString(),
          exitCode: error?.code !== undefined ? (typeof error.code === 'number' ? error.code : 1) : 0,
        });
      },
    );
  });
}

interface PreCommitHook {
  id: string;
  name: string;
  entry: string;
  language: string;
  files?: string;
  additional_dependencies?: string[];
}

const manifest = parse(
  readFileSync(resolve(root, '.pre-commit-hooks.yaml'), 'utf-8'),
) as PreCommitHook[];

const launcherPkg = JSON.parse(
  readFileSync(resolve(root, 'packages/precommit/package.json'), 'utf-8'),
) as { name: string; version: string; bin: Record<string, string>; dependencies: Record<string, string> };

const rootPkg = JSON.parse(
  readFileSync(resolve(root, 'package.json'), 'utf-8'),
) as { name: string; exports: Record<string, unknown> };

describe('.pre-commit-hooks.yaml', () => {
  const hook = manifest.find(h => h.id === 'migrationpilot');

  it('defines the migrationpilot hook', () => {
    expect(hook).toBeDefined();
    expect(hook!.language).toBe('node');
    expect(hook!.files).toBe('\\.sql$');
  });

  it('calls the launcher bin', () => {
    expect(hook!.entry).toBe('migrationpilot-precommit');
    expect(Object.keys(launcherPkg.bin)).toContain('migrationpilot-precommit');
  });

  it('pins the launcher at the version packages/precommit ships', () => {
    expect(hook!.additional_dependencies).toEqual([
      `${launcherPkg.name}@${launcherPkg.version}`,
    ]);
  });

  it('does not pin the CLI package itself, which would collide with the hook repo', () => {
    // pre-commit installs this repo (package name "migrationpilot") as a git
    // dependency. An additional_dependency of the same name loses to it.
    for (const dep of hook!.additional_dependencies ?? []) {
      expect(dep.startsWith(`${rootPkg.name}@`)).toBe(false);
    }
  });
});

describe('migrationpilot-precommit launcher', () => {
  it('resolves the CLI through an export the root package actually declares', () => {
    const source = readFileSync(
      resolve(root, 'packages/precommit/bin/migrationpilot-precommit.cjs'),
      'utf-8',
    );
    const match = source.match(/require\.resolve\('migrationpilot(\/[^']*)?'\)/);
    expect(match).not.toBeNull();

    const subpath = match![1] ? `.${match![1]}` : '.';
    expect(Object.keys(rootPkg.exports)).toContain(subpath);
  });

  it('depends on the CLI package', () => {
    expect(launcherPkg.dependencies).toHaveProperty('migrationpilot');
  });
});

// The whole reason the `precommit` subcommand exists: pre-commit hands a hook
// every matched file at once, and `analyze` takes exactly one path.
describe('migrationpilot precommit', () => {
  beforeAll(() => {
    if (!existsSync(CLI)) {
      throw new Error('dist/cli.cjs not found. Run `pnpm build` before these tests.');
    }
  });

  it('accepts several files in one invocation', async () => {
    const { stdout, exitCode } = await runCli(['precommit', CLEAN_SQL, UNSAFE_SQL]);
    expect(stdout).not.toContain('too many arguments');
    expect(exitCode).toBe(2);
  });

  it('says nothing when every file is clean', async () => {
    const { stdout, exitCode } = await runCli(['precommit', CLEAN_SQL]);
    expect(stdout.trim()).toBe('');
    expect(exitCode).toBe(0);
  });

  it('reports only the files that have violations', async () => {
    const { stdout, stderr } = await runCli(['precommit', CLEAN_SQL, UNSAFE_SQL]);
    expect(stdout).toContain('unsafe.sql');
    expect(stdout).not.toContain('clean.sql');
    expect(stderr).toContain('1 of 2 file(s)');
  });

  it('blocks the commit on a critical violation', async () => {
    const { stderr, exitCode } = await runCli(['precommit', UNSAFE_SQL]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain('Commit blocked');
  });

  it('honors --fail-on never', async () => {
    const { exitCode } = await runCli(['precommit', UNSAFE_SQL, '--fail-on', 'never']);
    expect(exitCode).toBe(0);
  });

  it('exits non-zero when a file is missing', async () => {
    const { exitCode } = await runCli(['precommit', resolve(root, 'tests/fixtures/e2e/nope.sql')]);
    expect(exitCode).toBe(1);
  });
});
