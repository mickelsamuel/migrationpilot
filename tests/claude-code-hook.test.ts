import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { chmodSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Tests for the Claude Code PreToolUse guardrail hook.
 *
 * Two layers:
 * 1. The predicates and content reconstruction, required directly.
 * 2. The script end-to-end, spawned with a stub `migrationpilot` on
 *    MIGRATIONPILOT_BIN so the exit-code contract is pinned without needing
 *    the real binary installed.
 *
 * The contract that matters most is fail-open: everything except "MigrationPilot
 * ran and reported blocking violations" must exit 0.
 */

const HOOK = resolve('integrations/claude-code/hooks/hook.js');
const require_ = createRequire(import.meta.url);
const hook = require_(HOOK) as {
  collectCandidates(toolName: string, toolInput: Record<string, unknown>): Array<{ label: string; sql: string | null }>;
  resolveFileContent(toolName: string, toolInput: Record<string, unknown>, filePath: string): string | null;
  isMigrationSqlPath(filePath: string): boolean;
  isMigrationCommand(command: string): boolean;
  candidatesFromCommand(command: string): Array<{ label: string; sql: string | null }>;
  parseReport(stdout: string): { violations: unknown[] } | null;
  isBlocking(severity: string, failOn: string, exitCode: number): boolean;
  normalizeFailOn(value: string | undefined): string;
  formatReport(blocking: unknown[], failOn: string): string;
};

const TMP = resolve('test-hook-temp');

/** A fake migrationpilot that prints a canned report and exits with a chosen code. */
function makeStub(name: string, stdout: string, exitCode: number): string {
  const scriptPath = resolve(TMP, `${name}.js`);
  writeFileSync(scriptPath, `process.stdout.write(${JSON.stringify(stdout)});\nprocess.exit(${exitCode});\n`);

  if (process.platform === 'win32') {
    const cmdPath = resolve(TMP, `${name}.cmd`);
    writeFileSync(cmdPath, `@echo off\r\nnode "${scriptPath}" %*\r\n`);
    return cmdPath;
  }

  const shPath = resolve(TMP, name);
  writeFileSync(shPath, `#!/bin/sh\nexec node "${scriptPath}" "$@"\n`);
  chmodSync(shPath, 0o755);
  return shPath;
}

function report(violations: Array<Record<string, unknown>>, riskLevel = 'RED'): string {
  return JSON.stringify({
    $schema: 'https://migrationpilot.dev/schemas/report-v1.json',
    file: '<stdin>',
    riskLevel,
    violations,
    summary: {
      totalViolations: violations.length,
      criticalCount: violations.filter(v => v.severity === 'critical').length,
      warningCount: violations.filter(v => v.severity === 'warning').length,
    },
  });
}

const CRITICAL = {
  ruleId: 'MP001',
  ruleName: 'require-concurrent-index-creation',
  severity: 'critical',
  message: 'CREATE INDEX without CONCURRENTLY will lock all writes on "users".',
  line: 1,
  safeAlternative: 'CREATE INDEX CONCURRENTLY idx_users_email ON users (email);',
  whyItMatters: 'ACCESS EXCLUSIVE lock for the whole build.',
  docsUrl: 'https://migrationpilot.dev/rules/mp001',
};

const WARNING = {
  ruleId: 'MP023',
  ruleName: 'require-if-not-exists',
  severity: 'warning',
  message: 'CREATE INDEX without IF NOT EXISTS is not idempotent.',
  line: 1,
};

/** Run the hook with a PreToolUse payload on stdin. */
function runHook(payload: unknown, env: Record<string, string> = {}) {
  const result = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, MIGRATIONPILOT_HOOK_DISABLE: '', MIGRATIONPILOT_HOOK_FAILON: '', ...env },
  });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

const writePayload = (filePath: string, content: string) => ({
  hook_event_name: 'PreToolUse',
  tool_name: 'Write',
  tool_input: { file_path: filePath, content },
});

const UNSAFE_SQL = 'CREATE INDEX idx_users_email ON users (email);';

describe('claude-code hook: what it intercepts', () => {
  it('recognises migration directories', () => {
    for (const path of [
      'db/migrations/001_init.sql',
      'db/migrate/20240101120000_add_index.sql',
      'alembic/versions/abc123_add_column.sql',
      'prisma/migrations/20240101_init/migration.sql',
      'supabase/migrations/20240101_init.sql',
      'sql/deploy/add_users.sql',
      'C:\\repo\\db\\migrations\\002.sql',
    ]) {
      expect(hook.isMigrationSqlPath(path), path).toBe(true);
    }
  });

  it('recognises versioned migration filenames anywhere', () => {
    expect(hook.isMigrationSqlPath('sql/V1__init.sql')).toBe(true);
    expect(hook.isMigrationSqlPath('anywhere/20240101120000_add_index.sql')).toBe(true);
    expect(hook.isMigrationSqlPath('anywhere/001_init.up.sql')).toBe(true);
  });

  it('ignores SQL that is not a migration', () => {
    expect(hook.isMigrationSqlPath('src/queries/report.sql')).toBe(false);
    expect(hook.isMigrationSqlPath('analytics/dashboard.sql')).toBe(false);
  });

  it('ignores non-SQL files inside a migrations directory', () => {
    expect(hook.isMigrationSqlPath('db/migrations/README.md')).toBe(false);
    expect(hook.isMigrationSqlPath('db/migrations/001_init.ts')).toBe(false);
  });

  it('honours MIGRATIONPILOT_HOOK_PATHS', () => {
    expect(hook.isMigrationSqlPath('infra/ops/apply.sql')).toBe(false);
    process.env.MIGRATIONPILOT_HOOK_PATHS = 'ops';
    try {
      expect(hook.isMigrationSqlPath('infra/ops/apply.sql')).toBe(true);
    } finally {
      delete process.env.MIGRATIONPILOT_HOOK_PATHS;
    }
  });

  it('recognises migration runners', () => {
    for (const command of [
      'psql -d app -f db/migrations/001.sql',
      'npx prisma migrate deploy',
      'alembic upgrade head',
      'flyway -url=... migrate',
      'liquibase update',
      'bundle exec rails db:migrate',
      'npx knex migrate:latest',
      'goose -dir migrations postgres "$DSN" up',
      'dbmate up',
      'sqitch deploy db:pg://localhost/app',
      'atlas migrate apply --url "$DSN"',
      'migrate -path ./migrations -database "$DSN" up',
      'sqlx migrate run',
      'npx drizzle-kit migrate',
      'python manage.py migrate',
    ]) {
      expect(hook.isMigrationCommand(command), command).toBe(true);
    }
  });

  it('ignores unrelated commands', () => {
    for (const command of ['ls -la', 'pnpm test', 'git status', 'cat migrations/001.sql']) {
      expect(hook.isMigrationCommand(command), command).toBe(false);
    }
  });

  it('pulls inline SQL out of a psql command', () => {
    const candidates = hook.candidatesFromCommand('psql -d app -c "CREATE INDEX idx ON t (c);"');
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.sql).toBe('CREATE INDEX idx ON t (c);');
  });

  it('reports a runner whose SQL it cannot reach', () => {
    const candidates = hook.candidatesFromCommand('npx prisma migrate deploy');
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.sql).toBeNull();
  });

  it('collects nothing for unrelated tool calls', () => {
    expect(hook.collectCandidates('Read', { file_path: 'db/migrations/001.sql' })).toEqual([]);
    expect(hook.collectCandidates('Write', { file_path: 'src/app.ts', content: 'x' })).toEqual([]);
    expect(hook.collectCandidates('Bash', { command: 'ls' })).toEqual([]);
  });
});

describe('claude-code hook: edit reconstruction', () => {
  const MIGRATIONS = resolve(TMP, 'migrations');
  const FILE = resolve(MIGRATIONS, '001_add_index.sql');
  const ORIGINAL = "SET lock_timeout = '5s';\nCREATE INDEX CONCURRENTLY idx_ok ON users (email);\n";

  beforeAll(() => {
    mkdirSync(MIGRATIONS, { recursive: true });
    writeFileSync(FILE, ORIGINAL);
  });

  afterAll(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it('analyzes the file as it will be after the edit, not the replacement text', () => {
    // The replacement text alone is an unparseable fragment; only the whole
    // file shows that the edit removed CONCURRENTLY.
    const [candidate] = hook.collectCandidates('Edit', {
      file_path: FILE,
      old_string: 'CREATE INDEX CONCURRENTLY idx_ok',
      new_string: 'CREATE INDEX idx_ok',
    });

    expect(candidate!.label).toBe(FILE);
    expect(candidate!.sql).toBe("SET lock_timeout = '5s';\nCREATE INDEX idx_ok ON users (email);\n");
  });

  it('applies every edit of a MultiEdit in order', () => {
    const content = hook.resolveFileContent('MultiEdit', {
      edits: [
        { old_string: 'CONCURRENTLY ', new_string: '' },
        { old_string: "'5s'", new_string: "'10s'" },
      ],
    }, FILE);

    expect(content).toContain('CREATE INDEX idx_ok');
    expect(content).not.toContain('CONCURRENTLY');
    expect(content).toContain("'10s'");
  });

  it('falls back to the replacement text when the file cannot be read', () => {
    const content = hook.resolveFileContent('Edit', {
      old_string: 'nope',
      new_string: 'CREATE INDEX idx ON t (c);',
    }, resolve(MIGRATIONS, 'does-not-exist.sql'));

    expect(content).toBe('CREATE INDEX idx ON t (c);');
  });

  it('takes the content verbatim for a Write', () => {
    expect(hook.resolveFileContent('Write', { content: 'SELECT 1;' }, FILE)).toBe('SELECT 1;');
  });
});

describe('claude-code hook: blocking logic', () => {
  it('defers to the CLI exit code when no override is set', () => {
    delete process.env.MIGRATIONPILOT_HOOK_FAILON;
    expect(hook.isBlocking('critical', 'critical', 2)).toBe(true);
    expect(hook.isBlocking('warning', 'critical', 2)).toBe(false);
    expect(hook.isBlocking('warning', 'critical', 1)).toBe(true);
    expect(hook.isBlocking('critical', 'critical', 0)).toBe(false);
  });

  it('uses the override when one is set', () => {
    process.env.MIGRATIONPILOT_HOOK_FAILON = 'warning';
    try {
      expect(hook.isBlocking('warning', 'warning', 0)).toBe(true);
    } finally {
      delete process.env.MIGRATIONPILOT_HOOK_FAILON;
    }

    process.env.MIGRATIONPILOT_HOOK_FAILON = 'never';
    try {
      expect(hook.isBlocking('critical', 'never', 2)).toBe(false);
    } finally {
      delete process.env.MIGRATIONPILOT_HOOK_FAILON;
    }
  });

  it('falls back to critical for a bogus threshold', () => {
    expect(hook.normalizeFailOn('nonsense')).toBe('critical');
    expect(hook.normalizeFailOn(undefined)).toBe('critical');
    expect(hook.normalizeFailOn('warning')).toBe('warning');
  });

  it('only accepts stdout that is a real report', () => {
    expect(hook.parseReport('')).toBeNull();
    expect(hook.parseReport('command not found')).toBeNull();
    expect(hook.parseReport('{"notAReport": true}')).toBeNull();
    expect(hook.parseReport('{"violations": []}')).toEqual({ violations: [] });
  });

  it('prints the rule, the reason, and the safe alternative when it blocks', () => {
    const text = hook.formatReport([{
      label: 'db/migrations/003.sql',
      violations: [CRITICAL],
      report: { riskLevel: 'RED' },
    }], 'critical');

    expect(text).toContain('MigrationPilot blocked this change');
    expect(text).toContain('MP001 (critical) line 1');
    expect(text).toContain('CREATE INDEX CONCURRENTLY idx_users_email');
    expect(text).toContain('https://migrationpilot.dev/rules/mp001');
    expect(text).toContain('MIGRATIONPILOT_HOOK_DISABLE=1');
  });
});

describe('claude-code hook: end to end', () => {
  let blockingBin: string;
  let cleanBin: string;
  let warningBin: string;

  beforeAll(() => {
    mkdirSync(TMP, { recursive: true });
    blockingBin = makeStub('mp-blocking', report([CRITICAL]), 2);
    cleanBin = makeStub('mp-clean', report([]), 0);
    warningBin = makeStub('mp-warning', report([WARNING], 'YELLOW'), 0);
  });

  afterAll(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it('blocks a migration write with a critical violation', () => {
    const { status, stderr } = runHook(
      writePayload('db/migrations/003_add_index.sql', UNSAFE_SQL),
      { MIGRATIONPILOT_BIN: blockingBin },
    );

    expect(status).toBe(2);
    expect(stderr).toContain('MigrationPilot blocked this change');
    expect(stderr).toContain('MP001');
    expect(stderr).toContain('CREATE INDEX CONCURRENTLY');
  });

  it('allows a clean migration silently', () => {
    const { status, stdout, stderr } = runHook(
      writePayload('db/migrations/004_ok.sql', 'SELECT 1;'),
      { MIGRATIONPILOT_BIN: cleanBin },
    );

    expect(status).toBe(0);
    expect(stdout).toBe('');
    expect(stderr).toBe('');
  });

  it('passes non-blocking violations to Claude as context', () => {
    const { status, stdout } = runHook(
      writePayload('db/migrations/005_warn.sql', UNSAFE_SQL),
      { MIGRATIONPILOT_BIN: warningBin },
    );

    expect(status).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.hookSpecificOutput.hookEventName).toBe('PreToolUse');
    expect(parsed.hookSpecificOutput.additionalContext).toContain('MP023');
    expect(parsed.hookSpecificOutput.additionalContext).toContain('do not block');
  });

  it('fails open when migrationpilot is not installed', () => {
    const { status, stderr } = runHook(
      writePayload('db/migrations/006.sql', UNSAFE_SQL),
      { MIGRATIONPILOT_BIN: resolve(TMP, 'no-such-binary') },
    );

    expect(status).toBe(0);
    expect(stderr).toContain('Allowing');
  });

  it('fails open when the payload is not JSON', () => {
    const result = spawnSync(process.execPath, [HOOK], { input: 'not json', encoding: 'utf8' });
    expect(result.status).toBe(0);
  });

  it('does nothing when MIGRATIONPILOT_HOOK_DISABLE is set', () => {
    const { status, stdout, stderr } = runHook(
      writePayload('db/migrations/007.sql', UNSAFE_SQL),
      { MIGRATIONPILOT_BIN: blockingBin, MIGRATIONPILOT_HOOK_DISABLE: '1' },
    );

    expect(status).toBe(0);
    expect(stdout).toBe('');
    expect(stderr).toBe('');
  });

  it('ignores a write outside a migration path even when the SQL is unsafe', () => {
    const { status } = runHook(
      writePayload('src/queries/report.sql', UNSAFE_SQL),
      { MIGRATIONPILOT_BIN: blockingBin },
    );
    expect(status).toBe(0);
  });

  it('ignores a shell command that does not run migrations', () => {
    const { status } = runHook(
      { tool_name: 'Bash', tool_input: { command: 'pnpm test' } },
      { MIGRATIONPILOT_BIN: blockingBin },
    );
    expect(status).toBe(0);
  });

  it('blocks inline DDL passed to psql', () => {
    const { status, stderr } = runHook(
      { tool_name: 'Bash', tool_input: { command: `psql -d app -c "${UNSAFE_SQL}"` } },
      { MIGRATIONPILOT_BIN: blockingBin },
    );

    expect(status).toBe(2);
    expect(stderr).toContain('inline SQL');
  });

  it('advises rather than blocks when a runner hides its SQL', () => {
    const { status, stdout } = runHook(
      { tool_name: 'Bash', tool_input: { command: 'npx prisma migrate deploy' } },
      { MIGRATIONPILOT_BIN: blockingBin },
    );

    expect(status).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.hookSpecificOutput.additionalContext).toContain('did not see the SQL');
  });
});
