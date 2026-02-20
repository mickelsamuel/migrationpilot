/**
 * Client-side usage tracking for free production analyses.
 *
 * Free-tier users get 3 production context analyses per month.
 * Usage is stored locally in ~/.migrationpilot/usage.json.
 * Resets automatically on the first day of each month.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

const CONFIG_DIR = join(homedir(), '.migrationpilot');
const USAGE_FILE = join(CONFIG_DIR, 'usage.json');
const FREE_MONTHLY_LIMIT = 3;

interface UsageData {
  month: string; // YYYY-MM
  productionAnalyses: number;
}

function currentMonth(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = (now.getMonth() + 1).toString().padStart(2, '0');
  return `${y}-${m}`;
}

async function readUsage(): Promise<UsageData> {
  try {
    const raw = await readFile(USAGE_FILE, 'utf-8');
    const data = JSON.parse(raw) as UsageData;
    if (data.month === currentMonth()) return data;
    return { month: currentMonth(), productionAnalyses: 0 };
  } catch {
    return { month: currentMonth(), productionAnalyses: 0 };
  }
}

async function writeUsage(data: UsageData): Promise<void> {
  try {
    await mkdir(CONFIG_DIR, { recursive: true });
    await writeFile(USAGE_FILE, JSON.stringify(data));
  } catch {
    // Non-critical — usage tracking is best-effort
  }
}

/**
 * Check if a free production analysis is allowed.
 * Returns { allowed, remaining, limit } to inform the user.
 */
export async function checkFreeUsage(): Promise<{
  allowed: boolean;
  used: number;
  remaining: number;
  limit: number;
}> {
  const data = await readUsage();
  const remaining = Math.max(0, FREE_MONTHLY_LIMIT - data.productionAnalyses);
  return {
    allowed: data.productionAnalyses < FREE_MONTHLY_LIMIT,
    used: data.productionAnalyses,
    remaining,
    limit: FREE_MONTHLY_LIMIT,
  };
}

/**
 * Record a free production analysis.
 * Call this AFTER a successful analysis with --database-url on free tier.
 */
export async function recordFreeUsage(): Promise<void> {
  const data = await readUsage();
  data.productionAnalyses++;
  await writeUsage(data);
}

/** Exported for testing */
export const FREE_LIMIT = FREE_MONTHLY_LIMIT;
