import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, unlink, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadConfig, resolveRuleConfig, generateDefaultConfig } from '../src/config/load.js';
import type { MigrationPilotConfig } from '../src/config/load.js';

const TEST_DIR = resolve('test-config-temp');

describe('loadConfig', () => {
  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test config files
    const files = [
      '.migrationpilotrc.yml',
      '.migrationpilotrc.yaml',
      'migrationpilot.config.yml',
    ];
    for (const f of files) {
      try { await unlink(resolve(TEST_DIR, f)); } catch { /* ignore */ }
    }
    try { await unlink(resolve(TEST_DIR, 'package.json')); } catch { /* ignore */ }
  });

  it('returns defaults when no config file exists', async () => {
    const { config, configPath } = await loadConfig(TEST_DIR);
    expect(configPath).toBeUndefined();
    expect(config.pgVersion).toBe(17);
    expect(config.failOn).toBe('critical');
    expect(config.thresholds?.highTrafficQueries).toBe(10000);
  });

  it('loads .migrationpilotrc.yml', async () => {
    await writeFile(resolve(TEST_DIR, '.migrationpilotrc.yml'), `
pgVersion: 15
failOn: warning
rules:
  MP001: false
  MP004:
    severity: warning
`);
    const { config, configPath } = await loadConfig(TEST_DIR);
    expect(configPath).toContain('.migrationpilotrc.yml');
    expect(config.pgVersion).toBe(15);
    expect(config.failOn).toBe('warning');
    expect(config.rules?.MP001).toBe(false);
    expect((config.rules?.MP004 as { severity: string }).severity).toBe('warning');
  });

  it('loads migrationpilot.config.yml', async () => {
    await writeFile(resolve(TEST_DIR, 'migrationpilot.config.yml'), `
pgVersion: 14
thresholds:
  highTrafficQueries: 5000
  largeTableRows: 500000
`);
    const { config } = await loadConfig(TEST_DIR);
    expect(config.pgVersion).toBe(14);
    expect(config.thresholds?.highTrafficQueries).toBe(5000);
    expect(config.thresholds?.largeTableRows).toBe(500000);
  });

  it('loads from package.json migrationpilot key', async () => {
    await writeFile(resolve(TEST_DIR, 'package.json'), JSON.stringify({
      name: 'test',
      migrationpilot: {
        pgVersion: 13,
        failOn: 'never',
      },
    }));
    const { config } = await loadConfig(TEST_DIR);
    expect(config.pgVersion).toBe(13);
    expect(config.failOn).toBe('never');
  });

  it('prefers .migrationpilotrc.yml over package.json', async () => {
    await writeFile(resolve(TEST_DIR, '.migrationpilotrc.yml'), 'pgVersion: 15\n');
    await writeFile(resolve(TEST_DIR, 'package.json'), JSON.stringify({
      name: 'test',
      migrationpilot: { pgVersion: 13 },
    }));
    const { config } = await loadConfig(TEST_DIR);
    expect(config.pgVersion).toBe(15);
  });

  it('merges with defaults', async () => {
    await writeFile(resolve(TEST_DIR, '.migrationpilotrc.yml'), 'pgVersion: 16\n');
    const { config } = await loadConfig(TEST_DIR);
    expect(config.pgVersion).toBe(16);
    expect(config.failOn).toBe('critical'); // default preserved
    expect(config.thresholds?.highTrafficQueries).toBe(10000); // default preserved
  });

  it('handles ignore patterns', async () => {
    await writeFile(resolve(TEST_DIR, '.migrationpilotrc.yml'), `
ignore:
  - "seed_*.sql"
  - "test_*.sql"
`);
    const { config } = await loadConfig(TEST_DIR);
    expect(config.ignore).toEqual(['seed_*.sql', 'test_*.sql']);
  });

  it('validates pgVersion range', async () => {
    await writeFile(resolve(TEST_DIR, '.migrationpilotrc.yml'), 'pgVersion: 999\n');
    const { config } = await loadConfig(TEST_DIR);
    expect(config.pgVersion).toBe(17); // falls back to default (invalid value ignored)
  });

  it('validates failOn values', async () => {
    await writeFile(resolve(TEST_DIR, '.migrationpilotrc.yml'), 'failOn: invalid\n');
    const { config } = await loadConfig(TEST_DIR);
    expect(config.failOn).toBe('critical'); // falls back to default
  });

  it('warns on unknown config keys', async () => {
    await writeFile(resolve(TEST_DIR, '.migrationpilotrc.yml'), `
pgVersion: 16
unknownKey: true
anotherBadKey: 42
`);
    const { config, warnings } = await loadConfig(TEST_DIR);
    expect(config.pgVersion).toBe(16);
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain('unknownKey');
    expect(warnings[1]).toContain('anotherBadKey');
  });

  it('returns empty warnings for valid config', async () => {
    await writeFile(resolve(TEST_DIR, '.migrationpilotrc.yml'), `
pgVersion: 15
failOn: warning
`);
    const { warnings } = await loadConfig(TEST_DIR);
    expect(warnings).toHaveLength(0);
  });

  it('warns on invalid extends preset', async () => {
    await writeFile(resolve(TEST_DIR, '.migrationpilotrc.yml'), `
extends: "migrationpilot:invalid"
`);
    const { config, warnings } = await loadConfig(TEST_DIR);
    expect(config.extends).toBeUndefined();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('Unknown preset');
    expect(warnings[0]).toContain('migrationpilot:invalid');
  });

  it('accepts valid extends presets without warning', async () => {
    for (const preset of ['recommended', 'strict', 'ci', 'startup', 'enterprise']) {
      await writeFile(resolve(TEST_DIR, '.migrationpilotrc.yml'), `extends: "migrationpilot:${preset}"\n`);
      const { warnings } = await loadConfig(TEST_DIR);
      expect(warnings).toHaveLength(0);
    }
  });

  it('rejects HTTP team.configUrl', async () => {
    await writeFile(resolve(TEST_DIR, '.migrationpilotrc.yml'), `
team:
  org: test-org
  configUrl: "http://insecure.example.com/config"
`);
    const { config, warnings } = await loadConfig(TEST_DIR);
    expect(config.team?.configUrl).toBeUndefined();
    expect(warnings.some(w => w.includes('HTTPS'))).toBe(true);
  });

  it('accepts HTTPS team.configUrl', async () => {
    await writeFile(resolve(TEST_DIR, '.migrationpilotrc.yml'), `
team:
  org: test-org
  configUrl: "https://config.example.com/team.yml"
`);
    const { config, warnings } = await loadConfig(TEST_DIR);
    expect(config.team?.configUrl).toBe('https://config.example.com/team.yml');
    expect(warnings).toHaveLength(0);
  });

  it('loads auditLog config', async () => {
    await writeFile(resolve(TEST_DIR, '.migrationpilotrc.yml'), `
auditLog:
  enabled: true
  path: /var/log/mp-audit.jsonl
`);
    const { config } = await loadConfig(TEST_DIR);
    expect(config.auditLog?.enabled).toBe(true);
    expect(config.auditLog?.path).toBe('/var/log/mp-audit.jsonl');
  });
});

describe('resolveRuleConfig', () => {
  it('returns default when no config for rule', () => {
    const result = resolveRuleConfig('MP001', 'critical', {});
    expect(result.enabled).toBe(true);
    expect(result.severity).toBe('critical');
  });

  it('disables rule with boolean false', () => {
    const config: MigrationPilotConfig = { rules: { MP001: false } };
    const result = resolveRuleConfig('MP001', 'critical', config);
    expect(result.enabled).toBe(false);
  });

  it('enables rule with boolean true', () => {
    const config: MigrationPilotConfig = { rules: { MP001: true } };
    const result = resolveRuleConfig('MP001', 'critical', config);
    expect(result.enabled).toBe(true);
  });

  it('overrides severity', () => {
    const config: MigrationPilotConfig = {
      rules: { MP001: { severity: 'warning' } },
    };
    const result = resolveRuleConfig('MP001', 'critical', config);
    expect(result.enabled).toBe(true);
    expect(result.severity).toBe('warning');
  });

  it('disables rule via enabled: false', () => {
    const config: MigrationPilotConfig = {
      rules: { MP001: { enabled: false } },
    };
    const result = resolveRuleConfig('MP001', 'critical', config);
    expect(result.enabled).toBe(false);
  });

  it('passes through threshold', () => {
    const config: MigrationPilotConfig = {
      rules: { MP013: { threshold: 5000 } },
    };
    const result = resolveRuleConfig('MP013', 'warning', config);
    expect(result.threshold).toBe(5000);
  });
});

describe('generateDefaultConfig', () => {
  it('generates valid YAML content', () => {
    const content = generateDefaultConfig();
    expect(content).toContain('pgVersion: 17');
    expect(content).toContain('failOn: critical');
    expect(content).toContain('highTrafficQueries: 10000');
    expect(content).toContain('largeTableRows: 1000000');
  });
});
