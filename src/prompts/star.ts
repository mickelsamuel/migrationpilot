/**
 * One-time "Star on GitHub" prompt after first analysis with violations.
 *
 * Shows a single non-intrusive message linking to the GitHub repo.
 * Stored in ~/.migrationpilot/config.json to never show again.
 * Suppressed in CI environments and with MIGRATIONPILOT_NO_PROMPTS=1.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

const CONFIG_DIR = join(homedir(), '.migrationpilot');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

interface UserConfig {
  starPromptShown?: boolean;
}

/**
 * Show "Star on GitHub" message if not shown before and conditions are met.
 * Returns the message string or null if suppressed.
 */
export async function maybeShowStarPrompt(hasViolations: boolean): Promise<string | null> {
  if (!hasViolations) return null;
  if (process.env.CI || process.env.MIGRATIONPILOT_NO_PROMPTS === '1') return null;

  try {
    const config = await readConfig();
    if (config.starPromptShown) return null;

    await writeConfig({ ...config, starPromptShown: true });
    return 'Tip: Star MigrationPilot on GitHub to stay updated → https://github.com/mickelsamuel/migrationpilot';
  } catch {
    return null;
  }
}

async function readConfig(): Promise<UserConfig> {
  try {
    const raw = await readFile(CONFIG_FILE, 'utf-8');
    return JSON.parse(raw) as UserConfig;
  } catch {
    return {};
  }
}

async function writeConfig(config: UserConfig): Promise<void> {
  try {
    await mkdir(CONFIG_DIR, { recursive: true });
    await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch {
    // Silently fail
  }
}
