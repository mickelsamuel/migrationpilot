import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadPlugins } from '../src/plugins/loader';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

describe('Plugin Loader', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = resolve(tmpdir(), `mp-plugin-test-${randomUUID().slice(0, 8)}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('loads a valid CJS plugin', async () => {
    const pluginPath = resolve(testDir, 'my-plugin.cjs');
    await writeFile(pluginPath, `
      module.exports = {
        rules: [
          {
            id: 'CUSTOM001',
            name: 'no-select-star',
            severity: 'warning',
            description: 'Avoid SELECT *',
            check(stmt) {
              if ('SelectStmt' in stmt) return {
                ruleId: 'CUSTOM001',
                ruleName: 'no-select-star',
                severity: 'warning',
                message: 'Avoid SELECT *',
                line: 0,
              };
              return null;
            },
          },
        ],
      };
    `);

    const result = await loadPlugins([pluginPath], testDir);
    expect(result.errors).toHaveLength(0);
    expect(result.rules).toHaveLength(1);
    expect(result.rules[0]?.id).toBe('CUSTOM001');
    expect(result.rules[0]?.name).toBe('no-select-star');
    expect(result.rules[0]?.severity).toBe('warning');
  });

  it('rejects plugins with reserved MP prefix', async () => {
    const pluginPath = resolve(testDir, 'bad-plugin.cjs');
    await writeFile(pluginPath, `
      module.exports = {
        rules: [{
          id: 'MP999',
          name: 'fake-built-in',
          check() { return null; },
        }],
      };
    `);

    const result = await loadPlugins([pluginPath], testDir);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain('reserved MP prefix');
    expect(result.rules).toHaveLength(0);
  });

  it('rejects rules without a check function', async () => {
    const pluginPath = resolve(testDir, 'no-check.cjs');
    await writeFile(pluginPath, `
      module.exports = {
        rules: [{
          id: 'CUSTOM002',
          name: 'missing-check',
        }],
      };
    `);

    const result = await loadPlugins([pluginPath], testDir);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain('missing a check() function');
  });

  it('rejects invalid plugin format', async () => {
    const pluginPath = resolve(testDir, 'not-plugin.cjs');
    await writeFile(pluginPath, `module.exports = "not a plugin";`);

    const result = await loadPlugins([pluginPath], testDir);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain('does not export a valid');
  });

  it('handles missing plugin files gracefully', async () => {
    const result = await loadPlugins(['./nonexistent-plugin.js'], testDir);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain('Failed to load plugin');
    expect(result.rules).toHaveLength(0);
  });

  it('loads multiple plugins', async () => {
    const p1 = resolve(testDir, 'plugin-a.cjs');
    const p2 = resolve(testDir, 'plugin-b.cjs');

    await writeFile(p1, `
      module.exports = { rules: [{ id: 'A001', name: 'rule-a', check() { return null; } }] };
    `);
    await writeFile(p2, `
      module.exports = { rules: [{ id: 'B001', name: 'rule-b', check() { return null; } }] };
    `);

    const result = await loadPlugins([p1, p2], testDir);
    expect(result.errors).toHaveLength(0);
    expect(result.rules).toHaveLength(2);
    expect(result.rules.map(r => r.id)).toEqual(['A001', 'B001']);
  });

  it('defaults severity to warning when not specified', async () => {
    const pluginPath = resolve(testDir, 'default-sev.cjs');
    await writeFile(pluginPath, `
      module.exports = { rules: [{ id: 'D001', name: 'default', check() { return null; } }] };
    `);

    const result = await loadPlugins([pluginPath], testDir);
    expect(result.rules[0]?.severity).toBe('warning');
  });

  it('loaded rules have working check functions', async () => {
    const pluginPath = resolve(testDir, 'working-rule.cjs');
    await writeFile(pluginPath, `
      module.exports = {
        rules: [{
          id: 'W001',
          name: 'detect-drop',
          severity: 'critical',
          check(stmt) {
            if ('DropStmt' in stmt) {
              return { ruleId: 'W001', ruleName: 'detect-drop', severity: 'critical', message: 'Drop detected', line: 1 };
            }
            return null;
          },
        }],
      };
    `);

    const result = await loadPlugins([pluginPath], testDir);
    expect(result.rules).toHaveLength(1);

    const rule = result.rules[0]!;
    const ctx = { originalSql: '', line: 1, pgVersion: 17, lock: { lockType: 'ACCESS SHARE', blocksReads: false, blocksWrites: false, longHeld: false }, allStatements: [], statementIndex: 0 };
    const violation = rule.check({ DropStmt: {} }, ctx as never);
    expect(violation?.ruleId).toBe('W001');

    const noViolation = rule.check({ SelectStmt: {} }, ctx as never);
    expect(noViolation).toBeNull();
  });
});
