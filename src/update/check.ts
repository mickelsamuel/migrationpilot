/**
 * Update checker for MigrationPilot CLI.
 *
 * Fetches the latest version from npm registry and compares with the
 * current version. Caches results for 24 hours in ~/.migrationpilot/.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

interface UpdateCache {
  checkedAt: string;
  latestVersion: string;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CONFIG_DIR = join(homedir(), '.migrationpilot');
const CACHE_FILE = join(CONFIG_DIR, 'last-update-check.json');

/**
 * Check if a newer version is available on npm.
 * Returns a message string if an update is available, or null if up to date.
 * Respects MIGRATIONPILOT_NO_UPDATE_CHECK=1 and CI environments.
 */
export async function checkForUpdate(currentVersion: string): Promise<string | null> {
  if (process.env.MIGRATIONPILOT_NO_UPDATE_CHECK === '1' || process.env.CI) {
    return null;
  }

  try {
    // Check cache first
    const cached = await readCache();
    if (cached) {
      return compareVersions(currentVersion, cached.latestVersion);
    }

    // Fetch from npm
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch('https://registry.npmjs.org/migrationpilot/latest', {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) return null;

    const data = await res.json() as { version: string };
    await writeCache(data.version);

    return compareVersions(currentVersion, data.version);
  } catch {
    return null;
  }
}

function compareVersions(current: string, latest: string): string | null {
  if (current === latest) return null;

  const [cMaj, cMin, cPatch] = current.split('.').map(Number);
  const [lMaj, lMin, lPatch] = latest.split('.').map(Number);

  if (cMaj === undefined || cMin === undefined || cPatch === undefined) return null;
  if (lMaj === undefined || lMin === undefined || lPatch === undefined) return null;

  if (lMaj > cMaj || (lMaj === cMaj && lMin > cMin) || (lMaj === cMaj && lMin === cMin && lPatch > cPatch)) {
    return `Update available: v${current} → v${latest} (npm install -g migrationpilot)`;
  }

  return null;
}

async function readCache(): Promise<UpdateCache | null> {
  try {
    const raw = await readFile(CACHE_FILE, 'utf-8');
    const cache = JSON.parse(raw) as UpdateCache;
    const age = Date.now() - new Date(cache.checkedAt).getTime();
    if (age < CACHE_TTL_MS) return cache;
    return null;
  } catch {
    return null;
  }
}

async function writeCache(latestVersion: string): Promise<void> {
  try {
    await mkdir(CONFIG_DIR, { recursive: true });
    const cache: UpdateCache = {
      checkedAt: new Date().toISOString(),
      latestVersion,
    };
    await writeFile(CACHE_FILE, JSON.stringify(cache));
  } catch {
    // Silently fail — cache is non-critical
  }
}
