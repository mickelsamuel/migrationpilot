import { describe, it, expect } from 'vitest';
import { resolvePreset, loadConfig, generateDefaultConfig } from '../src/config/load.js';

describe('resolvePreset', () => {
  it('returns config for migrationpilot:recommended', () => {
    const preset = resolvePreset('migrationpilot:recommended');
    expect(preset).not.toBeNull();
    expect(preset!.failOn).toBe('critical');
  });

  it('returns config for migrationpilot:strict with all rules at critical', () => {
    const preset = resolvePreset('migrationpilot:strict');
    expect(preset).not.toBeNull();
    expect(preset!.failOn).toBe('warning');
    expect(preset!.rules).toBeDefined();
    // All 48 rules should be set to critical
    expect(Object.keys(preset!.rules!)).toHaveLength(48);
    expect(preset!.rules!['MP001']).toEqual({ severity: 'critical' });
    expect(preset!.rules!['MP048']).toEqual({ severity: 'critical' });
  });

  it('returns config for migrationpilot:ci', () => {
    const preset = resolvePreset('migrationpilot:ci');
    expect(preset).not.toBeNull();
    expect(preset!.failOn).toBe('critical');
  });

  it('returns null for unknown preset', () => {
    expect(resolvePreset('unknown')).toBeNull();
    expect(resolvePreset('strict')).toBeNull();
  });
});

describe('loadConfig with extends', () => {
  it('returns defaults when no config file found', async () => {
    // Use a directory unlikely to have a config file
    const { config, configPath } = await loadConfig('/tmp/nonexistent-migrationpilot-test');
    expect(configPath).toBeUndefined();
    expect(config.pgVersion).toBe(17);
    expect(config.failOn).toBe('critical');
  });
});

describe('generateDefaultConfig', () => {
  it('mentions extends in generated config', () => {
    const content = generateDefaultConfig();
    expect(content).toContain('extends');
    expect(content).toContain('migrationpilot:recommended');
  });
});
