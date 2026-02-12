import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { installPreCommitHook, uninstallPreCommitHook } from '../src/hooks/install.js';

let testDir: string;

beforeEach(async () => {
  testDir = join(tmpdir(), `mp-hook-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(testDir, { recursive: true });
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe('installPreCommitHook', () => {
  it('fails if not a git repo', async () => {
    const result = await installPreCommitHook(testDir);
    expect(result.success).toBe(false);
    expect(result.message).toContain('Not a git repository');
  });

  it('installs standalone hook in .git/hooks', async () => {
    await mkdir(join(testDir, '.git'), { recursive: true });
    const result = await installPreCommitHook(testDir);
    expect(result.success).toBe(true);
    expect(result.hookPath).toContain('pre-commit');

    const content = await readFile(result.hookPath!, 'utf-8');
    expect(content).toContain('migrationpilot');
    expect(content).toContain('#!/bin/sh');
  });

  it('does not overwrite existing non-MP hook', async () => {
    await mkdir(join(testDir, '.git', 'hooks'), { recursive: true });
    await writeFile(join(testDir, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\necho "custom hook"');
    const result = await installPreCommitHook(testDir);
    expect(result.success).toBe(false);
    expect(result.message).toContain('already exists');
  });

  it('detects already installed hook', async () => {
    await mkdir(join(testDir, '.git'), { recursive: true });
    // Install first time
    await installPreCommitHook(testDir);
    // Install second time
    const result = await installPreCommitHook(testDir);
    expect(result.success).toBe(true);
    expect(result.message).toContain('already installed');
  });

  it('appends to existing husky hook', async () => {
    await mkdir(join(testDir, '.git'), { recursive: true });
    await mkdir(join(testDir, '.husky'), { recursive: true });
    await writeFile(join(testDir, '.husky', 'pre-commit'), '#!/usr/bin/env sh\n. "$(dirname -- "$0")/_/husky.sh"\n\nnpx lint-staged\n');

    const result = await installPreCommitHook(testDir);
    expect(result.success).toBe(true);
    expect(result.message).toContain('Added MigrationPilot');

    const content = await readFile(result.hookPath!, 'utf-8');
    expect(content).toContain('lint-staged');
    expect(content).toContain('migrationpilot');
  });

  it('creates husky hook if .husky exists but no pre-commit', async () => {
    await mkdir(join(testDir, '.git'), { recursive: true });
    await mkdir(join(testDir, '.husky'), { recursive: true });

    const result = await installPreCommitHook(testDir);
    expect(result.success).toBe(true);
    expect(result.message).toContain('Created husky');
  });
});

describe('uninstallPreCommitHook', () => {
  it('removes standalone hook', async () => {
    await mkdir(join(testDir, '.git'), { recursive: true });
    await installPreCommitHook(testDir);

    const result = await uninstallPreCommitHook(testDir);
    expect(result.success).toBe(true);
    expect(result.message).toContain('Removed');

    // Hook file should be gone
    try {
      await stat(join(testDir, '.git', 'hooks', 'pre-commit'));
      expect.fail('Hook file should have been deleted');
    } catch {
      // Expected
    }
  });

  it('removes MP lines from husky hook', async () => {
    await mkdir(join(testDir, '.git'), { recursive: true });
    await mkdir(join(testDir, '.husky'), { recursive: true });
    await writeFile(join(testDir, '.husky', 'pre-commit'), '#!/usr/bin/env sh\nnpx lint-staged\n# migrationpilot-hook\nnpx migrationpilot check . --fail-on critical\n');

    const result = await uninstallPreCommitHook(testDir);
    expect(result.success).toBe(true);

    const content = await readFile(join(testDir, '.husky', 'pre-commit'), 'utf-8');
    expect(content).toContain('lint-staged');
    expect(content).not.toContain('migrationpilot');
  });

  it('reports no hook found', async () => {
    await mkdir(join(testDir, '.git'), { recursive: true });
    const result = await uninstallPreCommitHook(testDir);
    expect(result.success).toBe(false);
    expect(result.message).toContain('No pre-commit hook found');
  });
});
