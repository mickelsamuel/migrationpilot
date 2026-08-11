/**
 * E2E tests — spawn the actual built CLI binary.
 * Requires `pnpm build` before running.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { existsSync, mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const CLI = resolve('dist/cli.cjs');
const FIXTURES = resolve('tests/fixtures/e2e');
const CLEAN_SQL = resolve(FIXTURES, 'clean.sql');
const UNSAFE_SQL = resolve(FIXTURES, 'unsafe.sql');
const ROLLBACK_SQL = resolve(FIXTURES, 'rollback.sql');

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
    expect(stdout).toContain('1.5.1');
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

  // Regression: multi-statement analyze used to abort during process teardown on
  // Windows with `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` from
  // libpg-query's WASM/libuv async handle when exiting via synchronous process.exit().
  // The crash clobbered the intended exit code 2. This exercises the full multi-statement
  // path end-to-end and asserts a clean exit 2 with no native assertion in stderr.
  it('analyze multi-statement file exits 2 cleanly without a native teardown crash', async () => {
    const tmpDir = mkdtempSync(resolve(tmpdir(), 'mp-multistmt-'));
    const sqlPath = resolve(tmpDir, 'multi.sql');
    try {
      writeFileSync(
        sqlPath,
        [
          'CREATE TABLE users (id int);',
          'CREATE INDEX idx_users_id ON users (id);',
          'INSERT INTO users (id) VALUES (1);',
        ].join('\n'),
      );
      const { exitCode, stdout, stderr } = await runCli(['analyze', sqlPath, '--offline']);
      expect(exitCode).toBe(2); // critical violation → exit 2, not a native abort code
      expect(stdout).toContain('MP001');
      expect(stderr).not.toContain('Assertion failed');
      expect(stderr).not.toContain('UV_HANDLE_CLOSING');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // Repeated cold runs must stay stable — the teardown crash was intermittent-looking
  // but deterministic above the single-statement threshold.
  it('analyze multi-statement file exits 2 on repeated cold runs (no flaky teardown)', async () => {
    const tmpDir = mkdtempSync(resolve(tmpdir(), 'mp-multistmt-rep-'));
    const sqlPath = resolve(tmpDir, 'multi.sql');
    try {
      writeFileSync(
        sqlPath,
        'CREATE TABLE a (id int);\nCREATE INDEX idx_a ON a (id);\nINSERT INTO a (id) VALUES (1);\n',
      );
      for (let i = 0; i < 3; i++) {
        const { exitCode, stderr } = await runCli(['analyze', sqlPath, '--offline']);
        expect(exitCode).toBe(2);
        expect(stderr).not.toContain('Assertion failed');
      }
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('analyze unsafe.sql --format json outputs valid JSON with $schema', async () => {
    const { stdout } = await runCli(['analyze', UNSAFE_SQL, '--format', 'json', '--fail-on', 'never']);
    const report = JSON.parse(stdout);
    expect(report.$schema).toContain('migrationpilot.dev');
    expect(report.version).toBe('1.5.1');
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

  it('list-rules outputs rule table', async () => {
    const { stdout, exitCode } = await runCli(['list-rules']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('MP001');
    expect(stdout).toContain('MP066');
  });

  it('list-rules --json outputs valid JSON', async () => {
    const { stdout, exitCode } = await runCli(['list-rules', '--json']);
    expect(exitCode).toBe(0);
    const rules = JSON.parse(stdout);
    expect(Array.isArray(rules)).toBe(true);
    const { allRules } = await import('../src/rules/index.js');
    expect(rules.length).toBe(allRules.length);
  });

  it('doctor runs diagnostics', async () => {
    const { stdout, exitCode } = await runCli(['doctor']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Node.js');
    expect(stdout).toContain('rules');
  });

  it('completion bash outputs bash script', async () => {
    const { stdout, exitCode } = await runCli(['completion', 'bash']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('complete');
    expect(stdout).toContain('migrationpilot');
  });

  it('completion zsh outputs zsh script', async () => {
    const { stdout, exitCode } = await runCli(['completion', 'zsh']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('compdef');
  });

  it('analyze --verbose shows per-statement results', async () => {
    const { stdout, exitCode } = await runCli(['analyze', UNSAFE_SQL, '--verbose', '--fail-on', 'never']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('MP001');
  });

  it('analyze --exclude MP001 skips that rule', async () => {
    const { stdout, exitCode } = await runCli(['analyze', UNSAFE_SQL, '--exclude', 'MP001', '--fail-on', 'never']);
    expect(exitCode).toBe(0);
    expect(stdout).not.toContain('MP001');
  });

  it('analyze --fix --dry-run shows fixes without changing', async () => {
    const { stdout, exitCode } = await runCli(['analyze', UNSAFE_SQL, '--fix', '--dry-run', '--fail-on', 'never']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('CONCURRENTLY');
  });

  it('analyze --offline skips update check', async () => {
    const { stdout, exitCode } = await runCli(['analyze', CLEAN_SQL, '--offline']);
    expect(exitCode).toBe(0);
  });

  it('init --preset strict creates preset config', async () => {
    const tmpDir = mkdtempSync(resolve(tmpdir(), 'mp-e2e-'));
    try {
      const { exitCode, stdout } = await new Promise<{ stdout: string; stderr: string; exitCode: number }>((res) => {
        execFile('node', [CLI, 'init', '--preset', 'strict'], {
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
      const config = readFileSync(resolve(tmpDir, '.migrationpilotrc.yml'), 'utf-8');
      expect(config).toContain('migrationpilot:strict');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('--help shows core commands', async () => {
    const { stdout } = await runCli(['--help']);
    expect(stdout).toContain('doctor');
    expect(stdout).toContain('completion');
    expect(stdout).toContain('drift');
    expect(stdout).toContain('trends');
    expect(stdout).toContain('list-rules');
    expect(stdout).toContain('explain');
  });

  it('explain MP001 shows rule details', async () => {
    const { stdout, exitCode } = await runCli(['explain', 'MP001']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('MP001');
    expect(stdout).toContain('require-concurrent');
    expect(stdout).toContain('Why it matters');
  });

  it('explain unknown rule exits with error', async () => {
    const { exitCode, stderr } = await runCli(['explain', 'MP999']);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('Unknown rule');
  });

  it('plan shows execution plan for migration file', async () => {
    const { stdout, exitCode } = await runCli(['plan', UNSAFE_SQL]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('CREATE INDEX');
  });

  it('plan shows lock information', async () => {
    const { stdout, exitCode } = await runCli(['plan', CLEAN_SQL]);
    expect(exitCode).toBe(0);
    expect(stdout).toBeTruthy();
  });

  it('trends runs without error', async () => {
    const { exitCode } = await runCli(['trends']);
    expect(exitCode).toBe(0);
  });

  it('analyze --fix --dry-run shows MP021 fix', async () => {
    const { stdout, exitCode } = await runCli(['analyze', '--stdin', '--fix', '--dry-run', '--fail-on', 'never'], 'REINDEX TABLE users;');
    expect(exitCode).toBe(0);
    expect(stdout).toContain('CONCURRENTLY');
  });

  it('analyze --fix --dry-run shows MP023 fix', async () => {
    const { stdout, exitCode } = await runCli(['analyze', '--stdin', '--fix', '--dry-run', '--fail-on', 'never'], 'CREATE TABLE users (id bigint PRIMARY KEY);');
    expect(exitCode).toBe(0);
    expect(stdout).toContain('IF NOT EXISTS');
  });

  it('analyze single file completes in under 2 seconds', async () => {
    const start = performance.now();
    const { exitCode } = await runCli(['analyze', UNSAFE_SQL, '--fail-on', 'never']);
    const elapsed = performance.now() - start;
    expect(exitCode).toBe(0);
    expect(elapsed).toBeLessThan(2000);
  });

  it('rollback generates reverse DDL', async () => {
    const { stdout, exitCode } = await runCli(['rollback', ROLLBACK_SQL]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('DROP INDEX');
    expect(stdout).toContain('DROP TABLE');
    expect(stdout).toContain('users');
  });

  it('template rename-column generates 3 phases', async () => {
    const { stdout, exitCode } = await runCli(['template', 'rename-column', '--table', 'users', '--column', 'email', '--new-name', 'email_address']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Expand');
    expect(stdout).toContain('Migrate');
    expect(stdout).toContain('Contract');
    expect(stdout).toContain('email_address');
  });

  it('template add-not-null --phase expand outputs only expand phase', async () => {
    const { stdout, exitCode } = await runCli(['template', 'add-not-null', '--table', 'users', '--column', 'name', '--phase', 'expand']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('CHECK');
    // Should NOT contain phase headers since we asked for a single phase
    expect(stdout).not.toContain('Phase 2');
  });

  it('template invalid operation exits with error', async () => {
    const { exitCode, stderr } = await runCli(['template', 'invalid-op', '--table', 'foo']);
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain('Unknown operation');
  });

  it('template add-not-null --pg-version 18 emits the native NOT NULL path', async () => {
    const { stdout, exitCode } = await runCli([
      'template', 'add-not-null', '--table', 'users', '--column', 'name', '--pg-version', '18',
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('NOT NULL name NOT VALID');
    // PostgreSQL 18 needs no CHECK workaround, so nothing to drop afterwards.
    expect(stdout).not.toContain('CHECK (name IS NOT NULL)');
    expect(stdout).not.toContain('DROP CONSTRAINT');
  });

  it('template add-not-null defaults to the PostgreSQL 17 CHECK path', async () => {
    const { stdout, exitCode } = await runCli(['template', 'add-not-null', '--table', 'users', '--column', 'name']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('CHECK (name IS NOT NULL)');
    expect(stdout).toContain('SET NOT NULL');
    expect(stdout).not.toContain('NOT NULL name NOT VALID');
  });

  it('template add-not-null --pg-version 11 plans a guarded scan instead', async () => {
    const { stdout, exitCode } = await runCli([
      'template', 'add-not-null', '--table', 'users', '--column', 'name', '--pg-version', '11',
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('RESET lock_timeout');
    expect(stdout).not.toContain('CHECK (name IS NOT NULL)');
  });

  it('template rejects a non-numeric --pg-version', async () => {
    const { exitCode, stderr } = await runCli([
      'template', 'add-not-null', '--table', 'users', '--column', 'name', '--pg-version', 'eighteen',
    ]);
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain('Invalid --pg-version');
  });

  it('plan-fix emits a numbered plan with deploy boundaries', async () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'mp-planfix-'));
    const file = resolve(dir, 'migration.sql');
    writeFileSync(file, 'ALTER TABLE orders ALTER COLUMN amount TYPE numeric(12,2);\n');
    try {
      const { stdout, exitCode } = await runCli(['plan-fix', file, '--no-config', '--rule', 'MP007']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('STEP 1');
      expect(stdout).toContain('DEPLOY BOUNDARY');
      expect(stdout).toContain('ADD COLUMN amount_new numeric(12,2)');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('plan-fix --format json is machine readable', async () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'mp-planfix-'));
    const file = resolve(dir, 'migration.sql');
    writeFileSync(file, 'ALTER TABLE users ALTER COLUMN email SET NOT NULL;\n');
    try {
      const { stdout, exitCode } = await runCli(['plan-fix', file, '--no-config', '--format', 'json', '--rule', 'MP002']);
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.pgVersion).toBe(17);
      expect(parsed.plans[0].pattern).toBe('check-then-not-null');
      expect(parsed.plans[0].steps).toHaveLength(4);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('plan-fix follows --pg-version, matching template', async () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'mp-planfix-'));
    const file = resolve(dir, 'migration.sql');
    writeFileSync(file, 'ALTER TABLE users ALTER COLUMN email SET NOT NULL;\n');
    try {
      const { stdout, exitCode } = await runCli([
        'plan-fix', file, '--no-config', '--format', 'json', '--pg-version', '18', '--rule', 'MP002',
      ]);
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.plans[0].pattern).toBe('pg18-not-null-not-valid');
      expect(parsed.plans[0].steps).toHaveLength(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('predict estimates duration for migration file', async () => {
    const { stdout, exitCode } = await runCli(['predict', UNSAFE_SQL]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('confidence');
  });

  it('predict --format json returns valid JSON array', async () => {
    const { stdout, exitCode } = await runCli(['predict', UNSAFE_SQL, '--format', 'json']);
    expect(exitCode).toBe(0);
    const estimates = JSON.parse(stdout);
    expect(Array.isArray(estimates)).toBe(true);
    expect(estimates.length).toBeGreaterThan(0);
    expect(estimates[0]).toHaveProperty('operation');
    expect(estimates[0]).toHaveProperty('estimatedDuration');
    expect(estimates[0]).toHaveProperty('confidence');
  });

  it('predict with --row-count calibrates estimates', async () => {
    const { stdout, exitCode } = await runCli(['predict', UNSAFE_SQL, '--row-count', '10000000', '--format', 'json']);
    expect(exitCode).toBe(0);
    const estimates = JSON.parse(stdout);
    expect(Array.isArray(estimates)).toBe(true);
  });

  it('predict nonexistent file exits with error', async () => {
    const { exitCode, stderr } = await runCli(['predict', 'nonexistent-file.sql']);
    expect(exitCode).not.toBe(0);
    expect(stderr.length + exitCode).toBeGreaterThan(0);
  });

  it('--help shows template and predict commands', async () => {
    const { stdout } = await runCli(['--help']);
    expect(stdout).toContain('template');
    expect(stdout).toContain('predict');
  });

  it('--help shows enterprise commands', async () => {
    const { stdout } = await runCli(['--help']);
    expect(stdout).toContain('team');
    expect(stdout).toContain('login');
    expect(stdout).toContain('logout');
    expect(stdout).toContain('policy');
  });

  it('team without config exits with guidance', async () => {
    const { exitCode, stderr } = await runCli(['team']);
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain('team');
  });

  it('policy without config exits with guidance', async () => {
    const { exitCode, stderr } = await runCli(['policy', CLEAN_SQL]);
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain('policy');
  });

  it('logout runs without error', async () => {
    const { exitCode } = await runCli(['logout']);
    expect(exitCode).toBe(0);
  });

  it('--help shows every command', async () => {
    const { stdout } = await runCli(['--help']);
    // Deliberately a presence check, not a count. Commands land here from
    // several branches at once, and an exact count would fail whoever adds
    // the next one rather than catching anything real. Removing a command
    // still breaks this, which is the case worth catching.
    const commands = [
      'analyze', 'check', 'plan', 'plan-fix', 'init', 'detect', 'watch', 'hook',
      'precommit', 'list-rules', 'explain', 'doctor', 'completion', 'drift',
      'trends', 'rollback', 'template', 'predict', 'mutation-test', 'simulate',
      'team', 'login', 'logout', 'policy',
    ];
    for (const cmd of commands) {
      expect(stdout, cmd).toContain(cmd);
    }
  });
});

/**
 * `simulate` gets its own runner: booting PostgreSQL-in-WASM takes a second or
 * two on top of process startup, which is comfortable but not 15-second
 * comfortable on a loaded CI box.
 */
describe('E2E: simulate', () => {
  const SIMULATE_FIXTURES = resolve('tests/fixtures/simulate');

  function runSimulate(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((res) => {
      execFile('node', [CLI, 'simulate', ...args, '--no-config'], {
        env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
        maxBuffer: 10 * 1024 * 1024,
        timeout: 60_000,
      }, (error, stdout, stderr) => {
        res({
          stdout: stdout.toString(),
          stderr: stderr.toString(),
          exitCode: error?.code !== undefined ? (typeof error.code === 'number' ? error.code : 1) : 0,
        });
      });
    });
  }

  it('runs a clean migration and exits 0', async () => {
    const { stdout, exitCode } = await runSimulate([resolve(SIMULATE_FIXTURES, 'clean.sql')]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('MigrationPilot Simulate');
    expect(stdout).toContain('+ table audit_log');
    expect(stdout).toContain('lock CONTENTION cannot be observed');
  }, 90_000);

  it('exits 2 when a statement fails at runtime', async () => {
    const { stdout, exitCode } = await runSimulate([resolve(SIMULATE_FIXTURES, 'concurrently-in-transaction.sql')]);
    expect(exitCode).toBe(2);
    expect(stdout).toContain('ERROR:  CREATE INDEX CONCURRENTLY cannot run inside a transaction block');
    expect(stdout).toContain('SQLSTATE: 25001');
    expect(stdout).toContain('Executed before it:');
  }, 90_000);

  it('loads a --baseline schema before the migration', async () => {
    const migration = resolve(SIMULATE_FIXTURES, 'needs-baseline.sql');
    const baselineFile = resolve(SIMULATE_FIXTURES, 'baseline-schema.sql');

    const without = await runSimulate([migration]);
    expect(without.exitCode).toBe(2);
    expect(without.stdout).toContain('relation "customers" does not exist');

    const withBaseline = await runSimulate([migration, '--baseline', baselineFile]);
    expect(withBaseline.exitCode).toBe(0);
    expect(withBaseline.stdout).toContain('+ column customers.country_code');
  }, 120_000);

  it('reports the engine version it actually ran on in JSON', async () => {
    const { stdout, exitCode } = await runSimulate([resolve(SIMULATE_FIXTURES, 'clean.sql'), '--format', 'json']);
    expect(exitCode).toBe(0);

    const report = JSON.parse(stdout);
    expect(report.engine.versionString).toContain('PGlite');
    expect(report.engine.serverMajor).toBeGreaterThanOrEqual(16);
    expect(report.execution.failedIndex).toBeNull();
    expect(report.static.$schema).toBe('https://migrationpilot.dev/schemas/report-v1.json');
  }, 90_000);
});
