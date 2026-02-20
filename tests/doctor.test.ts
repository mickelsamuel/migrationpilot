import { describe, it, expect } from 'vitest';
import { runDiagnostics } from '../src/doctor/check.js';

describe('doctor command', () => {
  it('returns diagnostics with correct Node.js version', async () => {
    const results = await runDiagnostics({
      currentVersion: '1.2.0',
      nodeVersion: 'v22.0.0',
      platform: 'linux',
      arch: 'x64',
      ruleCount: 80,
    });

    const nodeResult = results.find(r => r.label === 'Node.js');
    expect(nodeResult).toBeDefined();
    expect(nodeResult?.status).toBe('ok');
    expect(nodeResult?.message).toContain('v22.0.0');
  });

  it('warns on old Node.js version', async () => {
    const results = await runDiagnostics({
      currentVersion: '1.2.0',
      nodeVersion: 'v20.0.0',
      platform: 'linux',
      arch: 'x64',
      ruleCount: 80,
    });

    const nodeResult = results.find(r => r.label === 'Node.js');
    expect(nodeResult?.status).toBe('error');
    expect(nodeResult?.message).toContain('22+ required');
  });

  it('includes platform information', async () => {
    const results = await runDiagnostics({
      currentVersion: '1.2.0',
      nodeVersion: 'v22.0.0',
      platform: 'darwin',
      arch: 'arm64',
      ruleCount: 80,
    });

    const platformResult = results.find(r => r.label === 'Platform');
    expect(platformResult?.status).toBe('ok');
    expect(platformResult?.message).toBe('darwin-arm64');
  });

  it('includes version and rule count', async () => {
    const results = await runDiagnostics({
      currentVersion: '1.2.0',
      nodeVersion: 'v22.0.0',
      platform: 'linux',
      arch: 'x64',
      ruleCount: 80,
    });

    const versionResult = results.find(r => r.label === 'Version');
    expect(versionResult?.status).toBe('ok');
    expect(versionResult?.message).toContain('v1.2.0');
    expect(versionResult?.message).toContain('80 rules');
  });

  it('checks config file existence', async () => {
    const results = await runDiagnostics({
      currentVersion: '1.2.0',
      nodeVersion: 'v22.0.0',
      platform: 'linux',
      arch: 'x64',
      ruleCount: 80,
      cwd: '/nonexistent/dir',
    });

    const configResult = results.find(r => r.label === 'Config');
    expect(configResult).toBeDefined();
    expect(configResult?.status).toBe('warn');
    expect(configResult?.message).toContain('No config file');
  });

  it('returns all expected diagnostic labels', async () => {
    const results = await runDiagnostics({
      currentVersion: '1.2.0',
      nodeVersion: 'v22.0.0',
      platform: 'linux',
      arch: 'x64',
      ruleCount: 80,
    });

    const labels = results.map(r => r.label);
    expect(labels).toContain('Node.js');
    expect(labels).toContain('Platform');
    expect(labels).toContain('Version');
    expect(labels).toContain('Config');
    expect(labels).toContain('Latest');
    expect(labels).toContain('Framework');
    expect(labels).toContain('License');
  });

  it('license check returns free tier when no key set', async () => {
    const origKey = process.env.MIGRATIONPILOT_LICENSE_KEY;
    delete process.env.MIGRATIONPILOT_LICENSE_KEY;

    const results = await runDiagnostics({
      currentVersion: '1.2.0',
      nodeVersion: 'v22.0.0',
      platform: 'linux',
      arch: 'x64',
      ruleCount: 80,
    });

    const licenseResult = results.find(r => r.label === 'License');
    expect(licenseResult?.status).toBe('ok');
    expect(licenseResult?.message).toContain('Free tier');

    if (origKey) process.env.MIGRATIONPILOT_LICENSE_KEY = origKey;
  });
});
