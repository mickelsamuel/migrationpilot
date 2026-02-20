import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// We test the module by mocking homedir so it writes to a temp dir
const testDir = join(tmpdir(), `mp-usage-test-${Date.now()}`);

vi.mock('node:os', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:os')>();
  return { ...original, homedir: () => testDir };
});

const { checkFreeUsage, recordFreeUsage, FREE_LIMIT } = await import('../src/usage/track.js');

describe('usage/track', () => {
  beforeEach(async () => {
    await mkdir(join(testDir, '.migrationpilot'), { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // cleanup best-effort
    }
  });

  it('allows usage when no file exists', async () => {
    const result = await checkFreeUsage();
    expect(result.allowed).toBe(true);
    expect(result.used).toBe(0);
    expect(result.remaining).toBe(FREE_LIMIT);
    expect(result.limit).toBe(FREE_LIMIT);
  });

  it('tracks usage correctly', async () => {
    await recordFreeUsage();
    const result = await checkFreeUsage();
    expect(result.used).toBe(1);
    expect(result.remaining).toBe(FREE_LIMIT - 1);
    expect(result.allowed).toBe(true);
  });

  it('blocks usage after limit reached', async () => {
    for (let i = 0; i < FREE_LIMIT; i++) {
      await recordFreeUsage();
    }
    const result = await checkFreeUsage();
    expect(result.allowed).toBe(false);
    expect(result.used).toBe(FREE_LIMIT);
    expect(result.remaining).toBe(0);
  });

  it('resets on new month', async () => {
    // Write a usage file for a past month
    const usageFile = join(testDir, '.migrationpilot', 'usage.json');
    await writeFile(usageFile, JSON.stringify({ month: '2020-01', productionAnalyses: 99 }));

    const result = await checkFreeUsage();
    expect(result.allowed).toBe(true);
    expect(result.used).toBe(0);
    expect(result.remaining).toBe(FREE_LIMIT);
  });

  it('handles corrupted usage file gracefully', async () => {
    const usageFile = join(testDir, '.migrationpilot', 'usage.json');
    await writeFile(usageFile, 'not-json!!!');

    const result = await checkFreeUsage();
    expect(result.allowed).toBe(true);
    expect(result.used).toBe(0);
  });

  it('FREE_LIMIT is 3', () => {
    expect(FREE_LIMIT).toBe(3);
  });
});
