/**
 * Health check diagnostics for MigrationPilot.
 *
 * Verifies environment, configuration, and installation status.
 * Returns a list of diagnostic results for display.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export interface DiagnosticResult {
  label: string;
  status: 'ok' | 'warn' | 'error';
  message: string;
}

/**
 * Run all diagnostic checks and return results.
 */
export async function runDiagnostics(opts: {
  currentVersion: string;
  nodeVersion: string;
  platform: string;
  arch: string;
  ruleCount: number;
  cwd?: string;
}): Promise<DiagnosticResult[]> {
  const results: DiagnosticResult[] = [];
  const cwd = opts.cwd ?? process.cwd();

  // Node.js version check
  const nodeVersion = parseInt(opts.nodeVersion.replace('v', ''), 10);
  if (nodeVersion >= 22) {
    results.push({ label: 'Node.js', status: 'ok', message: `${opts.nodeVersion} (>= 22 required)` });
  } else {
    results.push({ label: 'Node.js', status: 'error', message: `${opts.nodeVersion} — Node 22+ required` });
  }

  // Platform
  results.push({ label: 'Platform', status: 'ok', message: `${opts.platform}-${opts.arch}` });

  // Version
  results.push({ label: 'Version', status: 'ok', message: `v${opts.currentVersion} (${opts.ruleCount} rules)` });

  // Config file check
  const configResult = await checkConfigFile(cwd);
  results.push(configResult);

  // Latest version check
  const updateResult = await checkLatestVersion(opts.currentVersion);
  results.push(updateResult);

  // Framework detection
  const frameworkResult = await checkFramework(cwd);
  results.push(frameworkResult);

  // License check
  const licenseResult = await checkLicense();
  results.push(licenseResult);

  return results;
}

async function checkConfigFile(cwd: string): Promise<DiagnosticResult> {
  const configFiles = [
    '.migrationpilotrc.yml',
    '.migrationpilotrc.yaml',
    'migrationpilot.config.yml',
    'migrationpilot.config.yaml',
  ];

  for (const name of configFiles) {
    try {
      await readFile(resolve(cwd, name), 'utf-8');
      return { label: 'Config', status: 'ok', message: `Found ${name}` };
    } catch {
      // try next
    }
  }

  // Check package.json for migrationpilot key
  try {
    const pkg = JSON.parse(await readFile(resolve(cwd, 'package.json'), 'utf-8'));
    if (pkg.migrationpilot) {
      return { label: 'Config', status: 'ok', message: 'Found in package.json' };
    }
  } catch {
    // no package.json
  }

  return { label: 'Config', status: 'warn', message: 'No config file found (run migrationpilot init)' };
}

async function checkLatestVersion(currentVersion: string): Promise<DiagnosticResult> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch('https://registry.npmjs.org/migrationpilot/latest', {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return { label: 'Latest', status: 'warn', message: 'Could not check npm registry' };
    }

    const data = await res.json() as { version: string };
    if (data.version === currentVersion) {
      return { label: 'Latest', status: 'ok', message: `v${currentVersion} is up to date` };
    } else {
      return { label: 'Latest', status: 'warn', message: `v${data.version} available (current: v${currentVersion})` };
    }
  } catch {
    return { label: 'Latest', status: 'warn', message: 'Could not reach npm registry (offline?)' };
  }
}

async function checkFramework(cwd: string): Promise<DiagnosticResult> {
  try {
    const { detectFrameworks } = await import('../frameworks/detect.js');
    const frameworks = await detectFrameworks(cwd);
    if (frameworks.length > 0) {
      const names = frameworks.map(f => f.name).join(', ');
      return { label: 'Framework', status: 'ok', message: names };
    }
    return { label: 'Framework', status: 'warn', message: 'No migration framework detected' };
  } catch {
    return { label: 'Framework', status: 'warn', message: 'Could not detect framework' };
  }
}

async function checkLicense(): Promise<DiagnosticResult> {
  const key = process.env.MIGRATIONPILOT_LICENSE_KEY;
  if (!key) {
    return { label: 'License', status: 'ok', message: 'Free tier (77 rules)' };
  }

  try {
    const { validateLicense, isProOrAbove } = await import('../license/validate.js');
    const status = validateLicense(key);
    if (status.valid && isProOrAbove(status)) {
      const expiry = status.expiresAt ? ` (expires ${status.expiresAt.toISOString().slice(0, 10)})` : '';
      return { label: 'License', status: 'ok', message: `${status.tier} tier${expiry}` };
    }
    if (status.error === 'License expired') {
      return { label: 'License', status: 'warn', message: `Expired on ${status.expiresAt?.toISOString().slice(0, 10)}` };
    }
    return { label: 'License', status: 'error', message: status.error || 'Invalid license key' };
  } catch {
    return { label: 'License', status: 'ok', message: 'Free tier (77 rules)' };
  }
}
