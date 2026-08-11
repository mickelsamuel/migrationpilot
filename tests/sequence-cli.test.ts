/**
 * CLI tests for sequence analysis and the reversibility gate.
 * Spawns the built binary, so `pnpm build` has to have run first.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

const CLI = resolve('dist/cli.cjs');
const SEQUENCE_DIR = resolve('tests/fixtures/sequence');
const REVERSIBILITY_DIR = resolve('tests/fixtures/reversibility');

function runCli(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((res) => {
    execFile('node', [CLI, ...args], {
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
      timeout: 30_000,
      maxBuffer: 10 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      res({
        stdout: stdout.toString(),
        stderr: stderr.toString(),
        exitCode: error?.code !== undefined ? (typeof error.code === 'number' ? error.code : 1) : 0,
      });
    });
  });
}

/** Shared flags: no user config, no network, no exit code from per-file rules. */
const ISOLATED = ['--no-config', '--offline'];

beforeAll(() => {
  if (!existsSync(CLI)) {
    throw new Error('dist/cli.cjs not found. Run `pnpm build` before these tests.');
  }
});

describe('check --sequence', () => {
  it('reports cross-file findings by default', async () => {
    const { stdout } = await runCli(['check', SEQUENCE_DIR, ...ISOLATED, '--fail-on', 'never']);

    expect(stdout).toContain('Sequence Analysis');
    expect(stdout).toContain('[SQ001] CRITICAL cumulative-lock-budget');
    expect(stdout).toContain('[SQ002] WARNING hot-table-multi-touch');
    expect(stdout).toContain('[SQ003] WARNING create-then-rewrite');
    expect(stdout).toContain('[SQ004] CRITICAL ordering-hazard');
    expect(stdout).toContain('[SQ005] blast-radius');
    expect(stdout).toContain('Total blocking lock time');
  });

  it('can be turned off', async () => {
    const { stdout } = await runCli(['check', SEQUENCE_DIR, ...ISOLATED, '--fail-on', 'never', '--no-sequence']);

    expect(stdout).not.toContain('Sequence Analysis');
    expect(stdout).toContain('MigrationPilot Summary');
  });

  it('accepts the flag explicitly', async () => {
    const { stdout } = await runCli(['check', SEQUENCE_DIR, ...ISOLATED, '--fail-on', 'never', '--sequence']);
    expect(stdout).toContain('Sequence Analysis');
  });

  it('honours a tighter lock budget', async () => {
    const { stdout } = await runCli([
      'check', SEQUENCE_DIR, ...ISOLATED, '--fail-on', 'never', '--lock-budget', '600',
    ]);

    expect(stdout).toContain('Sequence Analysis');
    expect(stdout).not.toContain('[SQ001]');
  });

  it('embeds the findings in JSON output', async () => {
    const { stdout } = await runCli(['check', SEQUENCE_DIR, ...ISOLATED, '--fail-on', 'never', '--format', 'json']);
    const report = JSON.parse(stdout);

    expect(report.sequence.findings.map((f: { id: string }) => f.id)).toEqual(['SQ001', 'SQ002', 'SQ003', 'SQ004']);
    expect(report.sequence.blastRadius.tables[0].table).toBe('users');
    expect(report.sequence.summary.criticalCount).toBe(2);
    expect(report.files).toHaveLength(6);
  });

  it('leaves the JSON field out when sequence analysis is off', async () => {
    const { stdout } = await runCli([
      'check', SEQUENCE_DIR, ...ISOLATED, '--fail-on', 'never', '--no-sequence', '--format', 'json',
    ]);

    expect('sequence' in JSON.parse(stdout)).toBe(false);
  });

  it('exits 0 on sequence findings unless asked to fail on them', async () => {
    const clean = await runCli(['check', SEQUENCE_DIR, ...ISOLATED, '--fail-on', 'never']);
    expect(clean.exitCode).toBe(0);

    const gated = await runCli(['check', SEQUENCE_DIR, ...ISOLATED, '--fail-on', 'never', '--fail-on-sequence']);
    expect(gated.exitCode).toBe(2);
  });
});

describe('reversibility grade in output', () => {
  it('shows the grade and what cannot be undone', async () => {
    const { stdout } = await runCli([
      'analyze', resolve(REVERSIBILITY_DIR, 'red_drop_column.sql'), ...ISOLATED, '--fail-on', 'never',
    ]);

    expect(stdout).toContain('rollback RED');
    expect(stdout).toContain('Reversibility: RED');
    expect(stdout).toContain('1 statement cannot be undone');
    expect(stdout).toContain('No down migration found next to this file');
  });

  it('stays quiet about a cleanly reversible migration', async () => {
    const { stdout } = await runCli([
      'analyze', resolve(REVERSIBILITY_DIR, 'green_add_column.sql'), ...ISOLATED, '--fail-on', 'never',
    ]);

    expect(stdout).toContain('rollback GREEN');
    expect(stdout).not.toContain('Reversibility:');
  });

  it('credits a companion down file', async () => {
    const { stdout } = await runCli([
      'analyze', resolve(REVERSIBILITY_DIR, 'red_drop_table.sql'), ...ISOLATED, '--fail-on', 'never',
    ]);

    expect(stdout).toContain('Down migration:');
    expect(stdout).toContain('red_drop_table.down.sql');
  });

  it('credits an inline down section', async () => {
    const { stdout } = await runCli([
      'analyze', resolve(REVERSIBILITY_DIR, 'red_inline_down.sql'), ...ISOLATED, '--fail-on', 'never',
    ]);

    expect(stdout).toContain('carries its own down section');
  });

  it('lists per-file grades in the check summary', async () => {
    const { stdout } = await runCli(['check', SEQUENCE_DIR, ...ISOLATED, '--fail-on', 'never']);

    expect(stdout).toContain('1 irreversible migration');
    expect(stdout).toContain('006_drop_legacy_notes.sql');
  });
});

describe('--fail-on irreversible', () => {
  it('fails a migration that destroys data with no way back', async () => {
    const { exitCode, stderr } = await runCli([
      'analyze', resolve(REVERSIBILITY_DIR, 'red_drop_column.sql'), ...ISOLATED, '--fail-on', 'irreversible',
    ]);

    expect(exitCode).toBe(2);
    expect(stderr).toContain('Irreversible migration with no down file');
  });

  it('passes the gate when a down migration exists', async () => {
    const { stderr } = await runCli([
      'analyze', resolve(REVERSIBILITY_DIR, 'red_drop_table.sql'), ...ISOLATED, '--fail-on', 'irreversible',
    ]);

    expect(stderr).not.toContain('Irreversible migration with no down file');
  });

  it('passes the gate on an inline down section', async () => {
    const { stderr } = await runCli([
      'analyze', resolve(REVERSIBILITY_DIR, 'red_inline_down.sql'), ...ISOLATED, '--fail-on', 'irreversible',
    ]);

    expect(stderr).not.toContain('Irreversible migration with no down file');
  });

  it('does not gate unless asked', async () => {
    const { stderr } = await runCli([
      'analyze', resolve(REVERSIBILITY_DIR, 'red_drop_column.sql'), ...ISOLATED, '--fail-on', 'never',
    ]);

    expect(stderr).not.toContain('Irreversible migration with no down file');
  });

  it('still fails on critical violations', async () => {
    const { exitCode } = await runCli([
      'analyze', resolve(REVERSIBILITY_DIR, 'red_drop_table.sql'), ...ISOLATED, '--fail-on', 'irreversible',
    ]);

    // DROP TABLE trips MP026; `irreversible` is a superset of `critical`.
    expect(exitCode).toBe(2);
  });

  it('gates a whole directory, naming the file that needs a down migration', async () => {
    const { exitCode, stderr } = await runCli([
      'check', SEQUENCE_DIR, ...ISOLATED, '--fail-on', 'irreversible',
    ]);

    expect(exitCode).toBe(2);
    expect(stderr).toContain('Irreversible migration with no down file');
    expect(stderr).toContain('006_drop_legacy_notes.sql');
    // The five reversible files in the fixture are not named.
    expect(stderr).not.toContain('005_widen_age.sql');
  });

  it('is accepted in the command help', async () => {
    const { stdout } = await runCli(['check', '--help']);

    expect(stdout).toContain('irreversible');
    expect(stdout).toContain('--no-sequence');
    expect(stdout).toContain('--fail-on-sequence');
    expect(stdout).toContain('--lock-budget');
  });
});
