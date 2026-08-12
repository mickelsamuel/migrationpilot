/**
 * What the Action does when the workflow token is read-only.
 *
 * GitHub defaults `default_workflow_permissions` to `read` on new repositories,
 * and the first thing the Action used to do was ask the API which files the PR
 * changed. That call 403s under a read-only token, the throw reached the
 * top-level catch, and the run died as "MigrationPilot error: Resource not
 * accessible by integration" — a red check that had not read a line of SQL.
 *
 * Neither the file list nor the comment is the analysis, so neither may end the
 * run. Both degrade: warn with the block that fixes it, and finish the job.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const harness = vi.hoisted(() => ({
  inputs: {} as Record<string, string>,
  infos: [] as string[],
  warnings: [] as string[],
  errors: [] as string[],
  failures: [] as string[],
  outputs: {} as Record<string, string>,
  octokit: undefined as unknown,
  context: { payload: {} as Record<string, unknown>, repo: { owner: 'acme', repo: 'api' } },
}));

vi.mock('@actions/core', () => ({
  getInput: (name: string) => harness.inputs[name] ?? '',
  setSecret: () => {},
  info: (m: string) => void harness.infos.push(m),
  warning: (m: string) => void harness.warnings.push(m),
  error: (m: string) => void harness.errors.push(m),
  setOutput: (k: string, v: string) => void (harness.outputs[k] = v),
  setFailed: (m: string) => void harness.failures.push(m),
  summary: { addRaw: () => ({ write: async () => {} }) },
}));

vi.mock('@actions/github', () => ({
  getOctokit: () => harness.octokit,
  context: harness.context,
}));

const { run } = await import('../src/action/run.js');

/** A statement MP001 always calls critical. */
const CRITICAL_SQL = 'CREATE INDEX idx_users_email ON users (email);\n';

function httpError(status: number, message: string): Error {
  return Object.assign(new Error(message), { status });
}

const DENIED = () => httpError(403, 'Resource not accessible by integration');

/** An issues API that accepts everything, so only the pulls side is under test. */
function permissiveIssues() {
  return {
    listComments: async () => ({ data: [] }),
    updateComment: async () => ({}),
    createComment: async () => ({}),
  };
}

let workspace: string;
let originalCwd: string;

beforeEach(() => {
  originalCwd = process.cwd();
  workspace = mkdtempSync(join(tmpdir(), 'mp-action-perms-'));
  mkdirSync(join(workspace, 'migrations'), { recursive: true });
  writeFileSync(join(workspace, 'migrations', '001_index.sql'), CRITICAL_SQL);
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
  harness.context.payload = { pull_request: { number: 7 } };
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(workspace, { recursive: true, force: true });
});

describe('a read-only workflow token', () => {
  it('still analyzes when the PR file list is forbidden', async () => {
    harness.octokit = {
      rest: {
        pulls: { listFiles: async () => { throw DENIED(); } },
        issues: permissiveIssues(),
      },
    };

    await run();

    // The run reached a verdict rather than dying on the API call.
    expect(harness.failures.join('\n')).not.toContain('MigrationPilot error');
    expect(harness.outputs['risk-level']).toBe('RED');
    expect(Number(harness.outputs.violations)).toBeGreaterThan(0);
    expect(harness.failures.join('\n')).toContain('critical');
    expect(existsSync(join(workspace, 'migrationpilot-results.sarif'))).toBe(true);

    const warned = harness.warnings.join('\n');
    expect(warned).toContain("can't list this pull request's files");
    expect(warned).toContain('Resource not accessible by integration');
    expect(warned).toContain('migrations/*.sql');
    expect(warned).toContain('pull-requests: write');
  });

  it('falls back to every file in the tree, not just the ones a diff would show', async () => {
    writeFileSync(join(workspace, 'migrations', '002_drop.sql'), 'DROP TABLE sessions;\n');
    harness.octokit = {
      rest: {
        pulls: { listFiles: async () => { throw DENIED(); } },
        issues: permissiveIssues(),
      },
    };

    await run();

    const analyzed = harness.infos.filter(m => m.startsWith('Analyzing: '));
    expect(analyzed).toEqual([
      'Analyzing: migrations/001_index.sql',
      'Analyzing: migrations/002_drop.sql',
    ]);
  });

  it('still finishes the run when the comment is forbidden', async () => {
    harness.octokit = {
      rest: {
        pulls: {
          listFiles: async () => ({
            data: [{ filename: 'migrations/001_index.sql', status: 'modified' }],
          }),
        },
        issues: {
          listComments: async () => ({ data: [] }),
          updateComment: async () => ({}),
          createComment: async () => { throw DENIED(); },
        },
      },
    };

    await run();

    expect(harness.failures.join('\n')).not.toContain('MigrationPilot error');
    expect(harness.outputs['risk-level']).toBe('RED');
    expect(harness.failures.join('\n')).toContain('critical');
    expect(existsSync(join(workspace, 'migrationpilot-results.sarif'))).toBe(true);

    const warned = harness.warnings.join('\n');
    expect(warned).toContain("can't post the report comment");
    expect(warned).toContain('permissions:');
    expect(warned).toContain('pull-requests: write');
  });
});

describe('a workflow token that works', () => {
  it('analyzes only the files the PR changed', async () => {
    writeFileSync(join(workspace, 'migrations', '002_drop.sql'), 'DROP TABLE sessions;\n');
    harness.octokit = {
      rest: {
        pulls: {
          listFiles: async () => ({
            data: [
              { filename: 'migrations/001_index.sql', status: 'modified' },
              { filename: 'src/app.ts', status: 'modified' },
              { filename: 'migrations/999_deleted.sql', status: 'removed' },
            ],
          }),
        },
        issues: permissiveIssues(),
      },
    };

    await run();

    expect(harness.infos.filter(m => m.startsWith('Analyzing: '))).toEqual([
      'Analyzing: migrations/001_index.sql',
    ]);
    expect(harness.warnings.join('\n')).not.toContain("can't list");
  });
});

describe('failures that are not about permissions', () => {
  it('still fails the run', async () => {
    harness.octokit = {
      rest: {
        pulls: { listFiles: async () => { throw httpError(500, 'Internal Server Error'); } },
        issues: permissiveIssues(),
      },
    };

    await run();

    expect(harness.failures.join('\n')).toContain('MigrationPilot error');
    expect(harness.failures.join('\n')).toContain('Internal Server Error');
  });
});
