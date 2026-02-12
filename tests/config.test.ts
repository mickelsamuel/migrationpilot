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
