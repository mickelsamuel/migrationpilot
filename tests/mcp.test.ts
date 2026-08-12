import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { analyzeSQL } from '../src/analysis/analyze.js';
import { allRules, staticRules } from '../src/rules/index.js';
import { classifyLock } from '../src/locks/classify.js';
import { parseMigration } from '../src/parser/parse.js';
import { extractTargets } from '../src/parser/extract.js';
import { isFixable, autoFix } from '../src/fixer/fix.js';
import { createServer } from '../src/mcp/create-server.js';

/**
 * Tests for MCP server tool logic.
 *
 * Two layers:
 * 1. The underlying functions the tools call (fast, no transport).
 * 2. The real server over the SDK's in-memory transport, which exercises tool
 *    registration, JSON Schema generation, argument validation, and the
 *    content envelope the way a client actually sees them.
 */

/** Connect a client to a fresh server over a linked in-memory transport pair. */
async function connect(): Promise<Client> {
  const server = createServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'migrationpilot-test', version: '1.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

interface ToolCallResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

/** Call a tool and parse its single text block as JSON. */
async function callJson(client: Client, name: string, args: Record<string, unknown> = {}): Promise<{ data: any; isError: boolean; text: string }> {
  const result = await client.callTool({ name, arguments: args }) as unknown as ToolCallResult;
  const text = result.content[0]?.text ?? '';
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = undefined;
  }
  return { data, isError: result.isError === true, text };
}

describe('MCP: analyze_migration', () => {
  it('returns violations for unsafe SQL', async () => {
    const sql = 'CREATE INDEX idx_users_email ON users (email);';
    const result = await analyzeSQL(sql, '<mcp>', 17, staticRules);

    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.violations.some(v => v.ruleId === 'MP001')).toBe(true);
    expect(result.overallRisk.level).toBeDefined();
    expect(result.overallRisk.score).toBeGreaterThan(0);
  });

  it('returns clean result for safe SQL', async () => {
    const sql = 'SET lock_timeout = \'5s\';\nCREATE INDEX CONCURRENTLY idx_users_email ON users (email);';
    const result = await analyzeSQL(sql, '<mcp>', 17, staticRules);

    const criticalViolations = result.violations.filter(v => v.severity === 'critical');
    expect(criticalViolations.length).toBe(0);
  });

  it('includes statement lock analysis', async () => {
    const sql = 'ALTER TABLE users ADD COLUMN age integer;';
    const result = await analyzeSQL(sql, '<mcp>', 17, staticRules);

    expect(result.statements.length).toBeGreaterThan(0);
    expect(result.statements[0]!.lock.lockType).toBeDefined();
    expect(typeof result.statements[0]!.lock.blocksReads).toBe('boolean');
    expect(typeof result.statements[0]!.lock.blocksWrites).toBe('boolean');
  });

  it('respects pg_version parameter', async () => {
    const sql = 'ALTER TABLE users ALTER COLUMN name SET DEFAULT now();';
    const resultPg10 = await analyzeSQL(sql, '<mcp>', 10, staticRules);
    const resultPg17 = await analyzeSQL(sql, '<mcp>', 17, staticRules);

    // PG 10 and PG 17 may produce different violations for volatile defaults
    expect(resultPg10.violations).toBeDefined();
    expect(resultPg17.violations).toBeDefined();
  });

  it('throws on empty SQL', async () => {
    await expect(analyzeSQL('', '<mcp>', 17, staticRules)).rejects.toThrow();
  });

  it('throws on invalid SQL', async () => {
    await expect(analyzeSQL('NOT VALID SQL AT ALL !!!', '<mcp>', 17, staticRules)).rejects.toThrow();
  });
});

describe('MCP: suggest_fix', () => {
  it('fixes CREATE INDEX without CONCURRENTLY', async () => {
    const sql = 'CREATE INDEX idx_test ON users (email);';
    const result = await analyzeSQL(sql, '<mcp>', 17, staticRules);
    const fixResult = autoFix(sql, result.violations);

    expect(fixResult.fixedSql).toContain('CONCURRENTLY');
    expect(fixResult.fixedCount).toBeGreaterThan(0);
  });

  it('reports unfixable violations', async () => {
    const sql = 'ALTER TABLE users ALTER COLUMN name TYPE varchar(50);';
    const result = await analyzeSQL(sql, '<mcp>', 17, staticRules);

    if (result.violations.length > 0) {
      const fixResult = autoFix(sql, result.violations);
      // MP007 (no-column-type-change) is not auto-fixable
      const unfixableIds = fixResult.unfixable.map(v => v.ruleId);
      expect(unfixableIds.includes('MP007')).toBe(true);
    }
  });

  it('returns original SQL when no violations', async () => {
    const sql = 'SET lock_timeout = \'5s\';\nSET statement_timeout = \'30s\';\nCREATE INDEX CONCURRENTLY IF NOT EXISTS idx_test ON users (email);';
    const result = await analyzeSQL(sql, '<mcp>', 17, staticRules);
    const fixResult = autoFix(sql, result.violations);
    expect(fixResult.fixedCount).toBe(0);
  });

  it('identifies fixable rules correctly', () => {
    expect(isFixable('MP001')).toBe(true);
    expect(isFixable('MP004')).toBe(true);
    expect(isFixable('MP009')).toBe(true);
    expect(isFixable('MP020')).toBe(true);
    expect(isFixable('MP007')).toBe(false);
    expect(isFixable('MP010')).toBe(false);
  });
});

describe('MCP: explain_lock', () => {
  it('classifies CREATE INDEX lock', async () => {
    const parsed = await parseMigration('CREATE INDEX idx_test ON users (email);');
    expect(parsed.errors.length).toBe(0);

    const stmt = parsed.statements[0]!;
    const lock = classifyLock(stmt.stmt, 17);

    expect(lock.lockType).toBe('SHARE');
    expect(lock.blocksReads).toBe(false);
    expect(lock.blocksWrites).toBe(true);
  });

  it('classifies ALTER TABLE lock as AccessExclusiveLock', async () => {
    const parsed = await parseMigration('ALTER TABLE users ADD COLUMN age integer;');
    const stmt = parsed.statements[0]!;
    const lock = classifyLock(stmt.stmt, 17);

    expect(lock.lockType).toBe('ACCESS EXCLUSIVE');
    expect(lock.blocksReads).toBe(true);
    expect(lock.blocksWrites).toBe(true);
  });

  it('classifies CREATE INDEX CONCURRENTLY as ShareUpdateExclusiveLock', async () => {
    const parsed = await parseMigration('CREATE INDEX CONCURRENTLY idx_test ON users (email);');
    const stmt = parsed.statements[0]!;
    const lock = classifyLock(stmt.stmt, 17);

    expect(lock.lockType).toBe('SHARE UPDATE EXCLUSIVE');
    expect(lock.blocksReads).toBe(false);
    expect(lock.blocksWrites).toBe(false);
  });

  it('extracts target tables', async () => {
    const parsed = await parseMigration('ALTER TABLE public.users ADD COLUMN age integer;');
    const stmt = parsed.statements[0]!;
    const targets = extractTargets(stmt.stmt);

    expect(targets.length).toBeGreaterThan(0);
    expect(targets[0]!.tableName).toBe('users');
  });

  it('handles parse errors', async () => {
    const parsed = await parseMigration('INVALID SQL !!!');
    expect(parsed.errors.length).toBeGreaterThan(0);
  });
});

describe('MCP: list_rules', () => {
  it('returns every rule that runs without a database connection', () => {
    const needsDatabase = allRules.filter(r => r.requiresDatabaseUrl);
    expect(needsDatabase.length).toBeGreaterThan(0);
    expect(staticRules.length).toBe(allRules.length - needsDatabase.length);
    expect(staticRules.some(r => r.requiresDatabaseUrl)).toBe(false);
  });

  it('each rule has required metadata', () => {
    for (const rule of staticRules) {
      expect(rule.id).toMatch(/^MP\d{3}$/);
      expect(rule.name).toBeTruthy();
      expect(rule.severity).toMatch(/^(critical|warning)$/);
      expect(rule.description).toBeTruthy();
      expect(typeof rule.check).toBe('function');
    }
  });

  it('omits the rules that can only fire against a live database', () => {
    const ruleIds = staticRules.map(r => r.id);
    for (const rule of allRules.filter(r => r.requiresDatabaseUrl)) {
      expect(ruleIds).not.toContain(rule.id);
    }
  });

  it('includes auto-fix metadata', () => {
    const fixableRules = staticRules.filter(r => isFixable(r.id));
    expect(fixableRules.length).toBeGreaterThan(0);

    // Known fixable rules
    expect(isFixable('MP001')).toBe(true);
    expect(isFixable('MP030')).toBe(true);
    expect(isFixable('MP033')).toBe(true);
  });

  it('each rule has docsUrl', () => {
    for (const rule of staticRules) {
      expect(rule.docsUrl).toMatch(/^https:\/\/migrationpilot\.dev\/rules\/mp\d{3}$/);
    }
  });
});

const UNSAFE_SQL = 'CREATE INDEX idx_users_email ON users (email);';
const SAFE_SQL = "SET lock_timeout = '5s';\nSET statement_timeout = '30s';\nCREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email ON users (email);";

describe('MCP server: tool listing', () => {
  it('advertises all seven tools', async () => {
    const client = await connect();
    const { tools } = await client.listTools();

    expect(tools.map(t => t.name).sort()).toEqual([
      'analyze_migration',
      'analyze_migration_dir',
      'check_before_apply',
      'explain_lock',
      'get_rule',
      'list_rules',
      'suggest_fix',
    ]);
    await client.close();
  });

  it('every tool has a description and an object input schema', async () => {
    const client = await connect();
    const { tools } = await client.listTools();

    for (const tool of tools) {
      expect(tool.description, `${tool.name} description`).toBeTruthy();
      expect(tool.inputSchema.type).toBe('object');
    }
    await client.close();
  });

  it('exposes the documented input schema for the new tools', async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    const byName = new Map(tools.map(t => [t.name, t.inputSchema as { properties?: Record<string, unknown>; required?: string[] }]));

    const gate = byName.get('check_before_apply')!;
    expect(Object.keys(gate.properties ?? {}).sort()).toEqual(['configPath', 'pgVersion', 'sql']);
    expect(gate.required).toEqual(['sql']);

    const dir = byName.get('analyze_migration_dir')!;
    expect(Object.keys(dir.properties ?? {}).sort()).toEqual(['path', 'pattern', 'pgVersion']);
    expect(dir.required).toEqual(['path']);

    const rule = byName.get('get_rule')!;
    expect(Object.keys(rule.properties ?? {}).sort()).toEqual(['ruleId', 'sql']);
    expect(rule.required).toEqual(['ruleId']);

    await client.close();
  });

  it('rejects a call that omits a required argument', async () => {
    const client = await connect();
    const { isError, text } = await callJson(client, 'check_before_apply', {});
    expect(isError).toBe(true);
    expect(text.toLowerCase()).toContain('sql');
    await client.close();
  });

  it('still serves the original four tools over the transport', async () => {
    const client = await connect();

    const analyze = await callJson(client, 'analyze_migration', { sql: UNSAFE_SQL });
    expect(analyze.isError).toBe(false);
    expect(analyze.data.violations.some((v: any) => v.ruleId === 'MP001')).toBe(true);

    const fix = await callJson(client, 'suggest_fix', { sql: UNSAFE_SQL });
    expect(fix.data.fixedSql).toContain('CONCURRENTLY');

    const lock = await callJson(client, 'explain_lock', { sql: 'ALTER TABLE users ADD COLUMN age integer;' });
    expect(lock.data.lockType).toBe('ACCESS EXCLUSIVE');
    expect(lock.data.affectedTables[0].table).toBe('users');

    const rules = await callJson(client, 'list_rules');
    expect(Array.isArray(rules.data)).toBe(true);
    expect(rules.data.length).toBe(staticRules.length);

    await client.close();
  });
});

describe('MCP server: check_before_apply', () => {
  const CONFIG_DIR = resolve('test-mcp-config-temp');

  beforeAll(async () => {
    await mkdir(CONFIG_DIR, { recursive: true });
    await writeFile(resolve(CONFIG_DIR, '.migrationpilotrc.yml'), 'pgVersion: 16\nfailOn: warning\n');
    await writeFile(resolve(CONFIG_DIR, 'disabled.yml'), 'failOn: critical\nrules:\n  MP001: false\n');
    await writeFile(resolve(CONFIG_DIR, 'never.yml'), 'failOn: never\n');
  });

  afterAll(async () => {
    await rm(CONFIG_DIR, { recursive: true, force: true });
  });

  it('fails an unsafe migration and names the blocking rule', async () => {
    const client = await connect();
    const { data, isError } = await callJson(client, 'check_before_apply', { sql: UNSAFE_SQL });

    expect(isError).toBe(false);
    expect(data.verdict).toBe('fail');
    expect(data.failOn).toBe('critical');
    expect(data.violations.some((v: any) => v.ruleId === 'MP001' && v.blocking === true)).toBe(true);
    expect(data.summary).toContain('MP001');
    expect(data.summary).toMatch(/^FAIL/);
    expect(data.counts.blocking).toBeGreaterThan(0);
    await client.close();
  });

  it('passes a safe migration', async () => {
    const client = await connect();
    const { data } = await callJson(client, 'check_before_apply', { sql: SAFE_SQL });

    expect(data.verdict).toBe('pass');
    expect(data.counts.critical).toBe(0);
    expect(data.summary).toMatch(/^PASS/);
    await client.close();
  });

  it('carries the rule docs an agent needs to act on a violation', async () => {
    const client = await connect();
    const { data } = await callJson(client, 'check_before_apply', { sql: UNSAFE_SQL });

    const mp001 = data.violations.find((v: any) => v.ruleId === 'MP001');
    expect(mp001.safeAlternative).toContain('CONCURRENTLY');
    expect(mp001.whyItMatters).toBeTruthy();
    expect(mp001.docsUrl).toBe('https://migrationpilot.dev/rules/mp001');
    await client.close();
  });

  it('resolves a config directory the way the CLI would', async () => {
    const client = await connect();
    const { data } = await callJson(client, 'check_before_apply', { sql: UNSAFE_SQL, configPath: CONFIG_DIR });

    expect(data.failOn).toBe('warning');
    expect(data.pgVersion).toBe(16);
    expect(data.configPath).toContain('.migrationpilotrc.yml');
    await client.close();
  });

  it('lets an explicit pgVersion override the config', async () => {
    const client = await connect();
    const { data } = await callJson(client, 'check_before_apply', { sql: UNSAFE_SQL, configPath: CONFIG_DIR, pgVersion: 15 });
    expect(data.pgVersion).toBe(15);
    await client.close();
  });

  it('honours a rule the config disables', async () => {
    const client = await connect();
    const { data } = await callJson(client, 'check_before_apply', {
      sql: UNSAFE_SQL,
      configPath: resolve(CONFIG_DIR, 'disabled.yml'),
    });

    expect(data.violations.some((v: any) => v.ruleId === 'MP001')).toBe(false);
    expect(data.ruleCount).toBe(staticRules.length - 1);
    await client.close();
  });

  it('passes everything when the config sets failOn never', async () => {
    const client = await connect();
    const { data } = await callJson(client, 'check_before_apply', {
      sql: UNSAFE_SQL,
      configPath: resolve(CONFIG_DIR, 'never.yml'),
    });

    expect(data.failOn).toBe('never');
    expect(data.verdict).toBe('pass');
    expect(data.violations.length).toBeGreaterThan(0);
    expect(data.violations.every((v: any) => v.blocking === false)).toBe(true);
    await client.close();
  });

  it('reports a missing config path instead of silently using defaults', async () => {
    const client = await connect();
    const { isError, text } = await callJson(client, 'check_before_apply', {
      sql: SAFE_SQL,
      configPath: resolve(CONFIG_DIR, 'does-not-exist.yml'),
    });

    expect(isError).toBe(true);
    expect(text).toContain('Config path not found');
    await client.close();
  });

  it('does not report pass when it cannot parse the SQL', async () => {
    const client = await connect();
    const { data, isError } = await callJson(client, 'check_before_apply', { sql: 'NOT VALID SQL AT ALL !!!' });

    expect(isError).toBe(true);
    expect(data.verdict).toBe('fail');
    expect(data.violations).toEqual([]);
    expect(data.parseErrors.length).toBeGreaterThan(0);
    expect(data.summary).toContain('did not run');
    await client.close();
  });
});

describe('MCP server: analyze_migration_dir', () => {
  const DIR = resolve('test-mcp-dir-temp');

  beforeAll(async () => {
    await mkdir(resolve(DIR, 'nested'), { recursive: true });
    await writeFile(resolve(DIR, '001_unsafe.sql'), UNSAFE_SQL);
    await writeFile(resolve(DIR, '002_safe.sql'), SAFE_SQL);
    await writeFile(resolve(DIR, '003_broken.sql'), 'THIS IS NOT SQL !!!');
    await writeFile(resolve(DIR, 'nested', 'V004__nested.sql'), 'DROP TABLE users;');
  });

  afterAll(async () => {
    await rm(DIR, { recursive: true, force: true });
  });

  it('returns per-file results and an aggregate', async () => {
    const client = await connect();
    const { data, isError } = await callJson(client, 'analyze_migration_dir', { path: DIR });

    expect(isError).toBe(false);
    expect(data.fileCount).toBe(4);
    expect(data.aggregate.filesAnalyzed).toBe(3);
    expect(data.aggregate.verdict).toBe('fail');
    expect(data.aggregate.totalViolations).toBeGreaterThan(0);
    expect(data.aggregate.summary).toMatch(/^FAIL/);

    const unsafe = data.files.find((f: any) => f.file.endsWith('001_unsafe.sql'));
    expect(unsafe.verdict).toBe('fail');
    expect(unsafe.violations.some((v: any) => v.ruleId === 'MP001')).toBe(true);

    const safe = data.files.find((f: any) => f.file.endsWith('002_safe.sql'));
    expect(safe.verdict).toBe('pass');
    expect(safe.critical).toBe(0);

    await client.close();
  });

  it('skips an unparseable file instead of failing the whole sweep', async () => {
    const client = await connect();
    const { data } = await callJson(client, 'analyze_migration_dir', { path: DIR });

    expect(data.errors.length).toBe(1);
    expect(data.errors[0].file).toContain('003_broken.sql');
    expect(data.aggregate.filesSkipped).toBe(1);
    expect(data.aggregate.summary).toContain('could not be parsed');
    await client.close();
  });

  it('lists the files that would block a release', async () => {
    const client = await connect();
    const { data } = await callJson(client, 'analyze_migration_dir', { path: DIR });

    expect(data.aggregate.blockingFiles.some((f: string) => f.endsWith('001_unsafe.sql'))).toBe(true);
    expect(data.aggregate.blockingFiles.some((f: string) => f.endsWith('002_safe.sql'))).toBe(false);
    await client.close();
  });

  it('honours a custom glob pattern', async () => {
    const client = await connect();
    const { data } = await callJson(client, 'analyze_migration_dir', { path: DIR, pattern: 'nested/*.sql' });

    expect(data.fileCount).toBe(1);
    expect(data.files[0].file).toContain('V004__nested.sql');
    await client.close();
  });

  it('reports an empty match without erroring', async () => {
    const client = await connect();
    const { data, isError } = await callJson(client, 'analyze_migration_dir', { path: DIR, pattern: '*.nope' });

    expect(isError).toBe(false);
    expect(data.fileCount).toBe(0);
    expect(data.aggregate.verdict).toBe('pass');
    expect(data.aggregate.summary).toContain('No files matched');
    await client.close();
  });

  it('errors on a directory that does not exist', async () => {
    const client = await connect();
    const { isError, text } = await callJson(client, 'analyze_migration_dir', { path: resolve(DIR, 'no-such-dir') });

    expect(isError).toBe(true);
    expect(text).toContain('Directory error');
    await client.close();
  });
});

describe('MCP server: get_rule', () => {
  it('returns the full doc for a rule', async () => {
    const client = await connect();
    const { data, isError } = await callJson(client, 'get_rule', { ruleId: 'MP001' });

    expect(isError).toBe(false);
    expect(data.ruleId).toBe('MP001');
    expect(data.name).toBe('require-concurrent-index-creation');
    expect(data.severity).toBe('critical');
    expect(data.requiresDatabaseUrl).toBe(false);
    expect(data.message).toBeTruthy();
    // SHARE, not ACCESS EXCLUSIVE: a non-concurrent CREATE INDEX blocks writes
    // and lets reads through, which is what the lock table in the same report
    // has always said.
    expect(data.whyItMatters).toContain('SHARE');
    expect(data.docsUrl).toBe('https://migrationpilot.dev/rules/mp001');
    expect(data.autoFixable).toBe(true);
    expect(data.config.disable).toContain('MP001: false');
    expect(data.config.inlineDisable).toBe('-- migrationpilot-disable MP001');
    await client.close();
  });

  it('accepts a lowercase rule id', async () => {
    const client = await connect();
    const { data } = await callJson(client, 'get_rule', { ruleId: 'mp037' });
    expect(data.ruleId).toBe('MP037');
    await client.close();
  });

  it('marks a rule that cannot run over MCP as needing a database url', async () => {
    const client = await connect();
    const { data } = await callJson(client, 'get_rule', { ruleId: 'MP013' });

    expect(data.requiresDatabaseUrl).toBe(true);
    expect(data.databaseUrlNote).toContain('does not run over MCP');
    await client.close();
  });

  it('returns a concrete safe alternative when given SQL', async () => {
    const client = await connect();
    const { data } = await callJson(client, 'get_rule', { ruleId: 'MP001', sql: UNSAFE_SQL });

    expect(data.example.fires).toBe(true);
    expect(data.example.line).toBe(1);
    expect(data.safeAlternative).toContain('CREATE INDEX CONCURRENTLY');
    expect(data.safeAlternativeNote).toBeUndefined();
    await client.close();
  });

  it('says so when the rule does not fire on the given SQL', async () => {
    const client = await connect();
    const { data } = await callJson(client, 'get_rule', { ruleId: 'MP001', sql: SAFE_SQL });

    expect(data.example.fires).toBe(false);
    expect(data.safeAlternative).toBeNull();
    await client.close();
  });

  it('explains an unknown rule id', async () => {
    const client = await connect();
    const { isError, text } = await callJson(client, 'get_rule', { ruleId: 'MP999' });

    expect(isError).toBe(true);
    expect(text).toContain('Unknown rule: MP999');
    expect(text).toContain('list_rules');
    await client.close();
  });

  it('documents every built-in rule', async () => {
    const client = await connect();
    for (const rule of staticRules) {
      const { data, isError } = await callJson(client, 'get_rule', { ruleId: rule.id });
      expect(isError, `${rule.id} lookup`).toBe(false);
      expect(data.message, `${rule.id} message`).toBeTruthy();
      expect(data.whyItMatters, `${rule.id} whyItMatters`).toBeTruthy();
    }
    await client.close();
  });
});
