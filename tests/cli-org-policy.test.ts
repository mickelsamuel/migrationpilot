/**
 * The built CLI with a policy block and no usable Org key. The run applies
 * neither the policy nor the audit log, and says so on stderr every time:
 * a config that asks for more than the run does is never quiet about it.
 *
 * The paths with a valid key are covered in-process by tests/org-policy.test.ts,
 * where a test signing key stands in for the real one.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'node:child_process';
import { generateKeyPairSync, createPrivateKey, sign } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CLI = resolve('dist/cli.cjs');

let dir: string;

function runCli(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NO_COLOR: '1',
    FORCE_COLOR: '0',
    MIGRATIONPILOT_NO_UPDATE_CHECK: '1',
    MIGRATIONPILOT_NO_PROMPTS: '1',
  };
  delete env.MIGRATIONPILOT_LICENSE_KEY;
  return new Promise((res) => {
    execFile('node', [CLI, ...args], { cwd: dir, env, timeout: 15_000, windowsHide: true }, (error, stdout, stderr) => {
      res({ stdout, stderr, exitCode: error ? (typeof error.code === 'number' ? error.code : 1) : 0 });
    });
  });
}

/** A key in a given format, signed by a key the CLI has never trusted. */
function forged(payload: string): string {
  const { privateKey } = generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  return `${payload}-${sign(null, Buffer.from(payload), createPrivateKey(privateKey)).toString('base64url')}`;
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'mp-cli-policy-'));
  writeFileSync(join(dir, '.migrationpilotrc.yml'), 'policy:\n  blockedPatterns:\n    - "TRUNCATE"\n');
  writeFileSync(join(dir, 'wipe.sql'), "SET lock_timeout = '5s';\nTRUNCATE audit_log;\n");
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('a policy block without an Org key', () => {
  it('is not applied, and the run says so', async () => {
    const { stderr, exitCode } = await runCli(['analyze', 'wipe.sql', '--fail-on', 'never', '--offline']);
    expect(stderr).toContain(
      "The config's policy block needs an Org plan license key (--license-key or MIGRATIONPILOT_LICENSE_KEY), and no key was given. It is not applied on this run.",
    );
    expect(stderr).not.toContain('[policy]');
    expect(exitCode).toBe(0);
  });

  it('says so even with --quiet', async () => {
    const { stderr } = await runCli(['analyze', 'wipe.sql', '--fail-on', 'never', '--quiet', '--offline']);
    expect(stderr).toContain("The config's policy block needs an Org plan license key");
  });

  it('keeps the warning off stdout, so a JSON report still parses', async () => {
    const { stdout, stderr } = await runCli(['analyze', 'wipe.sql', '--format', 'json', '--fail-on', 'never', '--offline']);
    expect(stderr).toContain('needs an Org plan license key');
    const report = JSON.parse(stdout) as Record<string, unknown>;
    expect(report.policy).toBeUndefined();
  });

  it('is not applied by check either', async () => {
    const { stderr, exitCode } = await runCli(['check', '.', '--fail-on', 'never', '--offline']);
    expect(stderr).toContain('needs an Org plan license key');
    expect(exitCode).toBe(0);
  });

  it('is not applied with a key the CLI did not issue', async () => {
    const { stderr, exitCode } = await runCli([
      'analyze', 'wipe.sql', '--fail-on', 'never', '--offline', '--license-key', forged('MP-v2-ORG-20991231'),
    ]);
    expect(stderr).toContain('the key was refused (Invalid signature)');
    expect(exitCode).toBe(0);
  });

  it('is not applied with a key in the retired unversioned format', async () => {
    const { stderr } = await runCli([
      'precommit', 'wipe.sql', '--fail-on', 'never', '--license-key', forged('MP-ENTERPRISE-20991231'),
    ]);
    expect(stderr).toContain('This key was signed with a retired signing key');
  });
});

describe('the policy command', () => {
  it('needs an Org key', async () => {
    const { stderr, exitCode } = await runCli(['policy', 'wipe.sql']);
    expect(stderr).toContain('The policy check needs an Org plan license key (--license-key or MIGRATIONPILOT_LICENSE_KEY), and no key was given.');
    expect(exitCode).toBe(1);
  });
});

describe('--license-key', () => {
  it('describes what the key does', async () => {
    const { stdout } = await runCli(['analyze', '--help']);
    expect(stdout).toContain('Org plan license key');
    expect(stdout).not.toContain('no longer affects analysis');
  });
});
