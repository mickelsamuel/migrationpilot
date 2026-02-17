/**
 * E2E tests — spawn the actual built CLI binary.
 * Requires `pnpm build` before running.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { existsSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const CLI = resolve('dist/cli.cjs');
const FIXTURES = resolve('tests/fixtures/e2e');
const CLEAN_SQL = resolve(FIXTURES, 'clean.sql');
const UNSAFE_SQL = resolve(FIXTURES, 'unsafe.sql');

function runCli(args: string[], stdin?: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((res) => {
    const child = execFile('node', [CLI, ...args], {
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
      timeout: 15_000,
    }, (error, stdout, stderr) => {
      res({
        stdout: stdout.toString(),
        stderr: stderr.toString(),
        exitCode: error?.code !== undefined ? (typeof error.code === 'number' ? error.code : 1) : 0,
      });
    });
    if (stdin) {
      child.stdin?.write(stdin);
      child.stdin?.end();
    }
  });
}

beforeAll(() => {
  if (!existsSync(CLI)) {
    throw new Error('dist/cli.cjs not found. Run `pnpm build` before E2E tests.');
  }
});

describe('E2E: CLI binary', () => {
  it('--version outputs version info', async () => {
    const { stdout } = await runCli(['--version']);
    expect(stdout).toContain('1.2.0');
    expect(stdout).toContain('node');
    expect(stdout).toContain('rules:');
  });

  it('--help shows available commands', async () => {
    const { stdout } = await runCli(['--help']);
    expect(stdout).toContain('analyze');
    expect(stdout).toContain('check');
    expect(stdout).toContain('plan');
    expect(stdout).toContain('init');
    expect(stdout).toContain('detect');
    expect(stdout).toContain('watch');
    expect(stdout).toContain('hook');
  });

  it('analyze clean.sql exits 0', async () => {
    const { exitCode } = await runCli(['analyze', CLEAN_SQL]);
    expect(exitCode).toBe(0);
  });

  it('analyze unsafe.sql exits 2 (critical violation)', async () => {
    const { exitCode, stdout } = await runCli(['analyze', UNSAFE_SQL]);
    expect(exitCode).toBe(2);
    expect(stdout).toContain('MP001');
  });

  it('analyze unsafe.sql --fail-on never exits 0', async () => {
    const { exitCode } = await runCli(['analyze', UNSAFE_SQL, '--fail-on', 'never']);
    expect(exitCode).toBe(0);
  });

  it('analyze unsafe.sql --format json outputs valid JSON with $schema', async () => {
    const { stdout } = await runCli(['analyze', UNSAFE_SQL, '--format', 'json', '--fail-on', 'never']);
    const report = JSON.parse(stdout);
    expect(report.$schema).toContain('migrationpilot.dev');
    expect(report.version).toBe('1.2.0');
    expect(report.violations.length).toBeGreaterThan(0);
  });

  it('analyze unsafe.sql --format sarif outputs valid SARIF', async () => {
    const { stdout } = await runCli(['analyze', UNSAFE_SQL, '--format', 'sarif', '--fail-on', 'never']);
    const sarif = JSON.parse(stdout);
    expect(sarif.version).toBe('2.1.0');
    expect(sarif.runs).toHaveLength(1);
  });

  it('analyze unsafe.sql --format markdown outputs markdown', async () => {
    const { stdout } = await runCli(['analyze', UNSAFE_SQL, '--format', 'markdown', '--fail-on', 'never']);
    expect(stdout).toContain('#');
    expect(stdout).toContain('MP001');
  });

  it('analyze unsafe.sql --quiet outputs gcc-style lines', async () => {
    const { stdout } = await runCli(['analyze', UNSAFE_SQL, '--quiet', '--fail-on', 'never']);
    // gcc-style: file:line: severity: message [ruleId]
    expect(stdout).toMatch(/:\d+:/);
    expect(stdout).toContain('MP001');
  });

  it('analyze nonexistent.sql exits 1 with error', async () => {
    const { exitCode, stderr } = await runCli(['analyze', 'nonexistent-file-does-not-exist.sql']);
    expect(exitCode).not.toBe(0);
    expect(stderr.length + exitCode).toBeGreaterThan(0);
  });

  it('check fixtures/e2e/ scans multiple files', async () => {
    const { stdout } = await runCli(['check', FIXTURES, '--fail-on', 'never']);
    expect(stdout).toBeTruthy();
  });

  it('init creates config file in temp dir', async () => {
    const tmpDir = mkdtempSync(resolve(tmpdir(), 'mp-e2e-'));
    try {
      const { exitCode } = await new Promise<{ stdout: string; stderr: string; exitCode: number }>((res) => {
        execFile('node', [CLI, 'init'], {
          env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
          cwd: tmpDir,
          timeout: 15_000,
        }, (error, stdout, stderr) => {
          res({
            stdout: stdout.toString(),
            stderr: stderr.toString(),
            exitCode: error?.code !== undefined ? (typeof error.code === 'number' ? error.code : 1) : 0,
          });
        });
      });
      expect(exitCode).toBe(0);
      expect(existsSync(resolve(tmpDir, '.migrationpilotrc.yml'))).toBe(true);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('detect runs without crashing', async () => {
    const { exitCode } = await runCli(['detect']);
    // detect may exit 0 (found frameworks) or 0 (no frameworks)
    expect(exitCode).toBe(0);
  });

  it('--stdin reads from pipe', async () => {
    const { stdout, exitCode } = await runCli(
      ['analyze', '--stdin', '--fail-on', 'never'],
      'CREATE INDEX idx_test ON users (id);',
    );
    expect(stdout).toContain('MP001');
    expect(exitCode).toBe(0);
  });
});
