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
) as { name: string; version: string; exports: Record<string, unknown> };

const mcpPkg = JSON.parse(
  readFileSync(resolve(root, 'packages/mcp/package.json'), 'utf-8'),
) as { name: string; version: string; bin: Record<string, string>; dependencies: Record<string, string> };

const parts = (s: string) => s.replace(/^\^/, '').split('.').map(Number);

/** Negative when a < b, zero when equal, positive when a > b. */
function compareVersions(a: string, b: string): number {
  const [x, y] = [parts(a), parts(b)];
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
}

/** Does `^x.y.z` admit `version`? Enough for the one shape used here. */
function caretAdmits(range: string, version: string): boolean {
  return parts(range)[0] === parts(version)[0] && compareVersions(version, range) >= 0;
}

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

  // The launcher's own version is frozen by the hook pin, but the CLI range it
  // installs still has to admit the CLI this repo ships, or the hook resolves
  // an older parser than the docs describe.
  it('installs a CLI range that admits the shipped version', () => {
    expect(caretAdmits(launcherPkg.dependencies.migrationpilot, rootPkg.version)).toBe(true);
  });
});

/**
 * migrationpilot-mcp is published from packages/mcp and is the package the MCP
 * Registry entry and every `npx migrationpilot-mcp` invocation resolve. It sat
 * at 1.0.0 pinning `^1.5.1` while the CLI moved on, so it version-locks to the
 * parent now and this is what holds it there.
 */
describe('migrationpilot-mcp launcher', () => {
  // Stated as "never behind" rather than "equal" so the manifest can be raised
  // to the next release ahead of the CLI bump that follows it in the release
  // sequence. Falling behind is the failure that actually shipped, and that is
  // what fails here. The tag build additionally requires exact equality with
  // the tag itself — see the version guard in .github/workflows/publish.yml.
  it('is never older than the CLI it launches', () => {
    expect(compareVersions(mcpPkg.version, rootPkg.version)).toBeGreaterThanOrEqual(0);
  });

  it('pins the CLI to its own release', () => {
    expect(mcpPkg.dependencies.migrationpilot).toBe(`^${mcpPkg.version}`);
  });

  it('resolves the server through an export the root package actually declares', () => {
    const source = readFileSync(
      resolve(root, 'packages/mcp/bin/migrationpilot-mcp.cjs'),
      'utf-8',
    );
    const subpaths = [...source.matchAll(/require\.resolve\('migrationpilot\/([^']+)'\)/g)].map(
      m => `./${m[1]}`,
    );
    expect(subpaths).toContain('./mcp');
    // The fallback path is deliberately a raw file, not an export, so only the
    // preferred subpath is held to the exports map.
    expect(Object.keys(rootPkg.exports)).toContain('./mcp');
  });

  it('exposes the bin the MCP Registry entry names', () => {
    expect(Object.keys(mcpPkg.bin)).toContain('migrationpilot-mcp');
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
