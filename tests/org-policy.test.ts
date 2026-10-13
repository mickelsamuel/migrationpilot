/**
 * The Org plan's policy block, applied where the gate runs.
 *
 * Before 1.6.4 only the `policy` command read the block. analyze, check,
 * precommit and the Action ignored it, so a required rule a config turned off
 * stayed off, a disable comment switched it off for one statement, the
 * severity floor never ran, and a blocked pattern failed nothing. The audit log
 * ran with no key at all.
 *
 * Now a valid paid license key turns the block and the audit log on, and the
 * run applies them: required rules hold whatever the config, a preset, an
 * exclude list or a disable comment says, the floor stops a downgrade, and a
 * blocked pattern fails the run whatever fail-on says. Without a key, neither
 * applies and the run says so instead of quietly doing less than the config asks.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// A signing pair made for this run, trusted as key version 2 in place of the
// real one, so the tests can issue keys the CLI accepts.
const TEST_KEYS = await vi.hoisted(async () => {
  const { generateKeyPairSync } = await import('node:crypto');
  return generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
});

vi.mock('../src/license/public-keys.js', () => ({
  PUBLIC_KEYS: { '2': TEST_KEYS.publicKey },
  CURRENT_KEY_VERSION: '2',
}));

const harness = vi.hoisted(() => ({
  inputs: {} as Record<string, string>,
  infos: [] as string[],
  warnings: [] as string[],
  errors: [] as Array<{ message: string; file?: string }>,
  failures: [] as string[],
  outputs: {} as Record<string, string>,
  secrets: [] as string[],
  summary: '',
  comments: [] as string[],
  changed: [] as string[],
  context: { payload: {} as Record<string, unknown>, repo: { owner: 'acme', repo: 'api' } },
}));

vi.mock('@actions/core', () => ({
  getInput: (name: string) => harness.inputs[name] ?? '',
  setSecret: (s: string) => void harness.secrets.push(s),
  info: (m: string) => void harness.infos.push(m),
  warning: (m: string) => void harness.warnings.push(m),
  error: (m: string, props?: { file?: string }) => void harness.errors.push({ message: m, file: props?.file }),
  setOutput: (k: string, v: string) => void (harness.outputs[k] = v),
  setFailed: (m: string) => void harness.failures.push(m),
  summary: {
    addRaw: (text: string) => {
      harness.summary = text;
      return { write: async () => {} };
    },
  },
}));

vi.mock('@actions/github', () => ({
  getOctokit: () => ({
    rest: {
      pulls: {
        listFiles: async () => ({
          data: harness.changed.map(filename => ({ filename, status: 'modified' })),
        }),
      },
      issues: {
        listComments: async () => ({ data: [] }),
        updateComment: async () => ({}),
        createComment: async ({ body }: { body: string }) => {
          harness.comments.push(body);
          return {};
        },
      },
    },
  }),
  context: harness.context,
}));

const { run } = await import('../src/action/run.js');
const { generateLicenseKey } = await import('../src/license/validate.js');
const {
  applyPolicy,
  checkBlockedPatterns,
  checkInlineDisables,
  checkSeverityFloor,
  enforcePolicy,
  findPatternStatements,
  matchesPattern,
  normalizeForPatternMatch,
} = await import('../src/policy/enforce.js');
const { excludeRules, resolveOrgPolicy } = await import('../src/policy/org.js');
const { allRules, runRules } = await import('../src/rules/index.js');
const { parseMigration } = await import('../src/parser/parse.js');
const { classifyLock } = await import('../src/locks/classify.js');

const ORG_KEY = generateLicenseKey('org', new Date(Date.UTC(2099, 11, 31)), TEST_KEYS.privateKey);
const EXPIRED_KEY = generateLicenseKey('org', new Date(Date.UTC(2020, 0, 1)), TEST_KEYS.privateKey);
const FORGED_KEY = generateLicenseKey(
  'org',
  new Date(Date.UTC(2099, 11, 31)),
  (await import('node:crypto')).generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  }).privateKey,
);
const HINT = '--license-key or MIGRATIONPILOT_LICENSE_KEY';

/** MP001 (index without CONCURRENTLY) and MP004 (no lock_timeout), both critical. */
const CRITICAL_SQL = 'CREATE INDEX idx_users_email ON users (email);\n';

/** The same statement, with a comment switching MP001 off for it. */
const DISABLED_SQL = '-- migrationpilot-disable MP001\nCREATE INDEX idx_users_email ON users (email);\n';

/** Warnings only (MP020, MP021). */
const WARNING_SQL = "SET lock_timeout = '5s';\nREINDEX INDEX idx_users_email;\n";

const severityOf = (id: string) => allRules.find(r => r.id === id)?.severity;

async function ruleIdsFor(sql: string, requiredRules?: ReadonlySet<string>): Promise<string[]> {
  const parsed = await parseMigration(sql);
  const statements = parsed.statements.map(s => ({ ...s, lock: classifyLock(s.stmt, 17) }));
  return runRules(allRules, statements, 17, undefined, sql, { requiredRules }).map(v => v.ruleId);
}

describe('pattern matching', () => {
  it('ignores comments but keeps string bodies, which run', () => {
    expect(normalizeForPatternMatch("-- DROP TABLE users\nSELECT 'drop table x' /* TRUNCATE */;"))
      .toBe("SELECT 'DROP TABLE X' ;");
  });

  it('matches whole words only', () => {
    expect(matchesPattern(normalizeForPatternMatch('DROP TABLESPACE old_space;'), 'DROP TABLE')).toBe(false);
    expect(matchesPattern(normalizeForPatternMatch('ALTER TABLE t DROP COLUMN legacy_drop;'), 'DROP')).toBe(true);
    expect(matchesPattern(normalizeForPatternMatch('ALTER TABLE backdrop ADD COLUMN x int;'), 'DROP')).toBe(false);
  });

  it('matches across any whitespace and either case', () => {
    expect(matchesPattern(normalizeForPatternMatch('drop\n    table\tusers;'), 'DROP TABLE')).toBe(true);
    expect(matchesPattern(normalizeForPatternMatch('DROP TABLE users;'), 'drop  table')).toBe(true);
  });

  it('does not match a pattern that only appears in a comment', () => {
    // 1.6.3 matched the raw text, so this failed a run that drops nothing.
    expect(checkBlockedPatterns('-- never DROP TABLE here\nALTER TABLE users ADD COLUMN age int;', ['DROP TABLE'])).toEqual([]);
  });

  it('reports the line of each statement a pattern matches', () => {
    const matches = findPatternStatements(
      [{ sql: 'ALTER TABLE a ADD COLUMN b int', line: 1 }, { sql: 'TRUNCATE audit', line: 3 }],
      ['TRUNCATE', 'DROP TABLE'],
    );
    expect(matches).toEqual([{ line: 3, pattern: 'TRUNCATE' }]);
  });
});

describe('the severity floor', () => {
  it('stops a downgrade below the floor', () => {
    expect(checkSeverityFloor({ MP001: { severity: 'warning' } }, 'critical', severityOf)).toHaveLength(1);
    expect(applyPolicy({ severityFloor: 'critical' }, { MP001: { severity: 'warning' } }, severityOf).MP001)
      .toEqual({ severity: 'critical' });
  });

  it("does not raise a rule that ships as a warning above its own severity", () => {
    expect(severityOf('MP020')).toBe('warning');
    expect(checkSeverityFloor({ MP020: { severity: 'warning' } }, 'critical', severityOf)).toEqual([]);
    expect(applyPolicy({ severityFloor: 'critical' }, { MP020: { severity: 'warning' } }, severityOf).MP020)
      .toEqual({ severity: 'warning' });
  });
});

describe('required rules', () => {
  it('flag a disable comment that names them, or names nothing', () => {
    expect(checkInlineDisables(DISABLED_SQL, ['MP001']).map(v => v.ruleId)).toEqual(['MP001']);
    expect(checkInlineDisables('-- migrationpilot-disable-file\nSELECT 1;', ['MP001', 'MP004']).map(v => v.ruleId))
      .toEqual(['MP001', 'MP004']);
    expect(checkInlineDisables(DISABLED_SQL, ['MP004'])).toEqual([]);
  });

  it('make the policy command report a disable comment', () => {
    const types = enforcePolicy({ requiredRules: ['MP001'] }, DISABLED_SQL, {}).map(v => v.type);
    expect(types).toContain('disabled_required_rule');
  });

  it('survive a disable comment in the rule engine', async () => {
    expect(await ruleIdsFor(DISABLED_SQL)).not.toContain('MP001');
    expect(await ruleIdsFor(DISABLED_SQL, new Set(['MP001']))).toContain('MP001');
    expect(await ruleIdsFor(`-- migrationpilot-disable-file\n${CRITICAL_SQL}`, new Set(['MP001']))).toEqual(['MP001']);
  });
});

describe('resolveOrgPolicy', () => {
  const config = {
    rules: { MP001: false as const, MP004: { severity: 'warning' as const } },
    policy: { requiredRules: ['mp001'], severityFloor: 'critical' as const, blockedPatterns: ['TRUNCATE'] },
  };

  it('does nothing, quietly, for a config without Org features', () => {
    const org = resolveOrgPolicy({ rules: { MP001: false } }, undefined, HINT);
    expect(org.entitled).toBe(false);
    expect(org.warnings).toEqual([]);
    expect(org.config.rules).toEqual({ MP001: false });
  });

  it('says what it is not applying when there is no key', () => {
    const org = resolveOrgPolicy(config, undefined, HINT);
    expect(org.entitled).toBe(false);
    expect(org.requiredRules.size).toBe(0);
    expect(org.blockedPatterns).toEqual([]);
    expect(org.config).toBe(config);
    expect(org.warnings).toEqual([
      `The config's policy block needs an Org plan license key (${HINT}), and no key was given. It is not applied on this run.`,
    ]);
  });

  it('names both parts, and why the key was refused', () => {
    const org = resolveOrgPolicy({ ...config, auditLog: { enabled: true } }, EXPIRED_KEY, HINT);
    expect(org.auditLog).toBeUndefined();
    expect(org.warnings[0]).toContain('policy block and audit log need an Org plan license key');
    expect(org.warnings[0]).toContain('the key was refused (License expired)');
    expect(org.warnings[0]).toContain('Neither is applied');
  });

  it('refuses a key signed with any other private key', () => {
    expect(resolveOrgPolicy(config, FORGED_KEY, HINT).entitled).toBe(false);
  });

  it('applies the block with a valid key, and says what it changed', () => {
    const org = resolveOrgPolicy(config, ORG_KEY, HINT);
    expect(org.entitled).toBe(true);
    expect([...org.requiredRules]).toEqual(['MP001']);
    expect(org.config.rules).toEqual({ MP001: true, MP004: { severity: 'critical' } });
    expect(org.blockedPatterns).toEqual(['TRUNCATE']);
    expect(org.notes).toContain('Policy: MP001 is required, so it runs although the config turns it off.');
    expect(org.notes.some(n => n.includes('MP004 stays critical'))).toBe(true);
  });

  it('keeps required rules out of an exclude list', () => {
    const org = resolveOrgPolicy(config, ORG_KEY, HINT);
    const { rules, kept } = excludeRules(allRules, ['MP001', 'MP037'], org);
    expect(kept).toEqual(['MP001']);
    expect(rules.map(r => r.id)).toContain('MP001');
    expect(rules.map(r => r.id)).not.toContain('MP037');
  });
});

describe('the Action with a policy block', () => {
  let workspace: string;
  let originalCwd: string;
  const originalEnvKey = process.env.MIGRATIONPILOT_LICENSE_KEY;

  function config(yaml: string): void {
    writeFileSync(join(workspace, '.migrationpilotrc.yml'), yaml);
  }

  function change(path: string, sql: string): void {
    writeFileSync(join(workspace, path), sql);
    harness.changed.push(path);
  }

  beforeEach(() => {
    originalCwd = process.cwd();
    workspace = mkdtempSync(join(tmpdir(), 'mp-action-policy-'));
    mkdirSync(join(workspace, 'migrations'), { recursive: true });
    process.chdir(workspace);
    delete process.env.MIGRATIONPILOT_LICENSE_KEY;

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
    harness.secrets = [];
    harness.summary = '';
    harness.comments = [];
    harness.changed = [];
    harness.context.payload = { pull_request: { number: 7 } };
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(workspace, { recursive: true, force: true });
    if (originalEnvKey === undefined) delete process.env.MIGRATIONPILOT_LICENSE_KEY;
    else process.env.MIGRATIONPILOT_LICENSE_KEY = originalEnvKey;
  });

  it('fails on a blocked statement whatever fail-on says', async () => {
    harness.inputs['license-key'] = ORG_KEY;
    harness.inputs['fail-on'] = 'never';
    config('policy:\n  blockedPatterns:\n    - "TRUNCATE"\n');
    change('migrations/001_wipe.sql', "SET lock_timeout = '5s';\nSELECT 1;\nTRUNCATE audit_log;\n");

    await run();

    expect(harness.failures).toHaveLength(1);
    expect(harness.failures[0]).toContain('the organization policy blocks 1 statement(s)');
    expect(harness.failures[0]).toContain('migrations/001_wipe.sql:3: TRUNCATE');
    expect(harness.errors).toContainEqual({
      file: 'migrations/001_wipe.sql',
      message: '[policy] "TRUNCATE" is blocked by the organization policy.',
    });
    expect(harness.comments.join('\n')).toContain('[!CAUTION]');
    expect(harness.summary).toContain('| Blocked by policy | 1 |');
    expect(harness.secrets).toContain(ORG_KEY);
  });

  it('runs a required rule the config turns off', async () => {
    harness.inputs['license-key'] = ORG_KEY;
    config('rules:\n  MP001: false\npolicy:\n  requiredRules:\n    - MP001\n');
    change('migrations/001_index.sql', CRITICAL_SQL);

    await run();

    expect(harness.errors.some(e => e.message.startsWith('[MP001]'))).toBe(true);
    expect(harness.infos).toContain('Policy: MP001 is required, so it runs although the config turns it off.');
  });

  it('runs a required rule a disable comment names, and says so', async () => {
    harness.inputs['license-key'] = ORG_KEY;
    config("rules:\n  MP004: false\npolicy:\n  requiredRules:\n    - MP001\n");
    change('migrations/001_index.sql', DISABLED_SQL);

    await run();

    expect(harness.errors.some(e => e.message.startsWith('[MP001]'))).toBe(true);
    expect(harness.failures.join('\n')).toContain('critical');
    expect(harness.infos).toContain('migrations/001_index.sql: Policy: MP001 on line 2 is required; the disable comment for it does not apply.');
  });

  it('runs a required rule the exclude input names', async () => {
    harness.inputs['license-key'] = ORG_KEY;
    harness.inputs.exclude = 'MP001,MP004';
    config('policy:\n  requiredRules:\n    - MP001\n');
    change('migrations/001_index.sql', CRITICAL_SQL);

    await run();

    expect(harness.errors.some(e => e.message.startsWith('[MP001]'))).toBe(true);
    expect(harness.errors.some(e => e.message.startsWith('[MP004]'))).toBe(false);
    expect(harness.infos).toContain('Policy: MP001 is required, so the exclude input does not drop it.');
  });

  it('holds the severity floor against a config downgrade', async () => {
    harness.inputs['license-key'] = ORG_KEY;
    config('rules:\n  MP001:\n    severity: warning\n  MP004: false\npolicy:\n  severityFloor: critical\n');
    change('migrations/001_index.sql', CRITICAL_SQL);

    await run();

    expect(harness.errors.some(e => e.message.startsWith('[MP001]'))).toBe(true);
    expect(harness.failures.join('\n')).toContain('critical');
  });

  it('reads the key from MIGRATIONPILOT_LICENSE_KEY too', async () => {
    process.env.MIGRATIONPILOT_LICENSE_KEY = ORG_KEY;
    harness.inputs['fail-on'] = 'never';
    config('policy:\n  blockedPatterns:\n    - "TRUNCATE"\n');
    change('migrations/001_wipe.sql', 'TRUNCATE audit_log;\n');

    await run();

    expect(harness.failures.join('\n')).toContain('the organization policy blocks 1 statement(s)');
    expect(harness.secrets).toContain(ORG_KEY);
  });

  it('applies none of it without a key, and says so', async () => {
    harness.inputs['fail-on'] = 'never';
    config('rules:\n  MP001: false\npolicy:\n  requiredRules:\n    - MP001\n  blockedPatterns:\n    - "TRUNCATE"\n');
    change('migrations/001_wipe.sql', `${CRITICAL_SQL}TRUNCATE audit_log;\n`);

    await run();

    expect(harness.failures).toEqual([]);
    expect(harness.errors.some(e => e.message.startsWith('[MP001]'))).toBe(false);
    expect(harness.warnings).toContain(
      "The config's policy block needs an Org plan license key (the license-key input, or MIGRATIONPILOT_LICENSE_KEY in the environment), and no key was given. It is not applied on this run.",
    );
  });

  it('applies none of it with a forged key', async () => {
    harness.inputs['license-key'] = FORGED_KEY;
    harness.inputs['fail-on'] = 'never';
    config('policy:\n  blockedPatterns:\n    - "TRUNCATE"\n');
    change('migrations/001_wipe.sql', 'TRUNCATE audit_log;\n');

    await run();

    expect(harness.failures).toEqual([]);
    expect(harness.warnings.join('\n')).toContain('the key was refused (Invalid signature)');
  });

  it('writes the audit log with a key, and not without one', async () => {
    const auditPath = join(workspace, 'audit', 'events.jsonl');
    config(`auditLog:\n  enabled: true\n  path: "${auditPath.replace(/\\/g, '/')}"\n`);
    change('migrations/001_index.sql', CRITICAL_SQL);

    await run();
    await new Promise(r => setTimeout(r, 200));
    expect(existsSync(auditPath)).toBe(false);
    expect(harness.warnings.join('\n')).toContain("The config's audit log needs an Org plan license key");

    harness.inputs['license-key'] = ORG_KEY;
    await run();
    await vi.waitFor(() => {
      const events = readFileSync(auditPath, 'utf-8').trim().split('\n').map(l => JSON.parse(l) as { event: string; command: string; file?: string });
      expect(events.map(e => e.event)).toEqual(['analysis_complete', 'action_complete']);
      expect(events[0]).toMatchObject({ command: 'action', file: 'migrations/001_index.sql' });
    });
  });
});
