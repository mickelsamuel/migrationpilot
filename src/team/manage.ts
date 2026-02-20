/**
 * Team management for MigrationPilot Enterprise/Team tiers.
 *
 * Handles:
 * - Organization-level license validation with seat management
 * - Team member tracking (who ran analyses, when)
 * - Centralized configuration fetching from org config URL
 * - Team activity reporting
 *
 * Config in .migrationpilotrc.yml:
 *
 * team:
 *   org: "acme-corp"
 *   configUrl: "https://config.acme.com/migrationpilot.yml"
 *   maxSeats: 25
 *   requireApproval:
 *     - "DROP TABLE"
 *     - "ALTER TYPE"
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';

const TEAM_DIR = join(homedir(), '.migrationpilot', 'team');
const MEMBERS_FILE = join(TEAM_DIR, 'members.json');
const ACTIVITY_FILE = join(TEAM_DIR, 'activity.jsonl');

export interface TeamConfig {
  /** Organization identifier */
  org: string;
  /** URL to fetch centralized team config from */
  configUrl?: string;
  /** Maximum number of licensed seats */
  maxSeats?: number;
  /** DDL operations that require explicit team lead approval */
  requireApproval?: string[];
  /** Contact email for the team admin */
  adminEmail?: string;
}

export interface TeamMember {
  /** Username (from git config or env) */
  username: string;
  /** Anonymized machine ID */
  machineId: string;
  /** When this member first ran MigrationPilot */
  firstSeen: string;
  /** When this member last ran MigrationPilot */
  lastSeen: string;
  /** Total number of analyses run */
  analysisCount: number;
}

export interface TeamActivity {
  timestamp: string;
  username: string;
  command: string;
  file?: string;
  violationCount?: number;
  riskLevel?: string;
  org: string;
}

export interface TeamStatus {
  org: string;
  seats: {
    used: number;
    max: number;
    remaining: number;
  };
  members: TeamMember[];
  recentActivity: TeamActivity[];
}

/**
 * Get the current username from git config or environment.
 */
export function getCurrentUsername(): string {
  return process.env.GIT_AUTHOR_NAME
    || process.env.USER
    || process.env.USERNAME
    || 'unknown';
}

/**
 * Generate an anonymized machine ID for seat tracking.
 * Uses hostname + username hash to identify unique seats.
 */
export function getMachineId(): string {
  const hostname = process.env.COMPUTERNAME || process.env.HOSTNAME || 'unknown';
  const user = getCurrentUsername();
  return createHash('sha256')
    .update(`${hostname}:${user}`)
    .digest('hex')
    .slice(0, 16);
}

/**
 * Read current team member list from local storage.
 */
async function readMembers(): Promise<TeamMember[]> {
  try {
    const raw = await readFile(MEMBERS_FILE, 'utf-8');
    return JSON.parse(raw) as TeamMember[];
  } catch {
    return [];
  }
}

/**
 * Write team members to local storage.
 */
async function writeMembers(members: TeamMember[]): Promise<void> {
  try {
    await mkdir(TEAM_DIR, { recursive: true });
    await writeFile(MEMBERS_FILE, JSON.stringify(members, null, 2));
  } catch {
    // Best-effort
  }
}

/**
 * Register or update the current user as a team member.
 * Returns the updated member list and whether the seat limit is exceeded.
 */
export async function registerTeamMember(maxSeats: number): Promise<{
  members: TeamMember[];
  isNewSeat: boolean;
  seatLimitExceeded: boolean;
}> {
  const members = await readMembers();
  const username = getCurrentUsername();
  const machineId = getMachineId();
  const now = new Date().toISOString();

  const existing = members.find(m => m.machineId === machineId);
  if (existing) {
    existing.lastSeen = now;
    existing.analysisCount++;
    existing.username = username; // Update in case username changed
    await writeMembers(members);
    return { members, isNewSeat: false, seatLimitExceeded: false };
  }

  // New seat
  const isNewSeat = true;
  const seatLimitExceeded = members.length >= maxSeats;

  const newMember: TeamMember = {
    username,
    machineId,
    firstSeen: now,
    lastSeen: now,
    analysisCount: 1,
  };

  members.push(newMember);
  await writeMembers(members);

  return { members, isNewSeat, seatLimitExceeded };
}

/**
 * Record a team activity event.
 */
export async function recordTeamActivity(activity: Omit<TeamActivity, 'timestamp' | 'username'>): Promise<void> {
  const fullActivity: TeamActivity = {
    ...activity,
    timestamp: new Date().toISOString(),
    username: getCurrentUsername(),
  };

  try {
    await mkdir(TEAM_DIR, { recursive: true });
    const { appendFile } = await import('node:fs/promises');
    await appendFile(ACTIVITY_FILE, JSON.stringify(fullActivity) + '\n');
  } catch {
    // Best-effort
  }
}

/**
 * Read recent team activity events.
 */
async function readRecentActivity(limit: number = 20): Promise<TeamActivity[]> {
  try {
    const raw = await readFile(ACTIVITY_FILE, 'utf-8');
    const lines = raw.trim().split('\n').filter(Boolean);
    return lines
      .slice(-limit)
      .map(line => JSON.parse(line) as TeamActivity)
      .reverse();
  } catch {
    return [];
  }
}

/**
 * Get the full team status including seats, members, and recent activity.
 */
export async function getTeamStatus(config: TeamConfig): Promise<TeamStatus> {
  const members = await readMembers();
  const recentActivity = await readRecentActivity();
  const maxSeats = config.maxSeats ?? 25;

  return {
    org: config.org,
    seats: {
      used: members.length,
      max: maxSeats,
      remaining: Math.max(0, maxSeats - members.length),
    },
    members,
    recentActivity,
  };
}

/**
 * Fetch centralized team configuration from a URL.
 * Returns the raw YAML string or null if fetch fails.
 */
export async function fetchRemoteConfig(configUrl: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const response = await fetch(configUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'MigrationPilot/1.4.0',
        'Accept': 'application/x-yaml, text/yaml, text/plain',
      },
    });

    clearTimeout(timeout);

    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

/**
 * Check if a DDL operation requires team approval.
 */
export function requiresApproval(
  sql: string,
  requireApproval: string[],
): { required: boolean; operations: string[] } {
  const upperSql = sql.toUpperCase();
  const matched = requireApproval.filter(op => upperSql.includes(op.toUpperCase()));
  return {
    required: matched.length > 0,
    operations: matched,
  };
}

/**
 * Format team status for CLI display.
 */
export function formatTeamStatus(status: TeamStatus): string {
  const lines: string[] = [];

  lines.push(`Organization: ${status.org}`);
  lines.push(`Seats: ${status.seats.used}/${status.seats.max} (${status.seats.remaining} remaining)`);
  lines.push('');

  if (status.members.length > 0) {
    lines.push('Team Members:');
    for (const member of status.members) {
      const lastSeen = new Date(member.lastSeen).toLocaleDateString();
      lines.push(`  ${member.username} — ${member.analysisCount} analyses, last active ${lastSeen}`);
    }
    lines.push('');
  }

  if (status.recentActivity.length > 0) {
    lines.push('Recent Activity:');
    for (const activity of status.recentActivity.slice(0, 10)) {
      const time = new Date(activity.timestamp).toLocaleString();
      const violations = activity.violationCount !== undefined ? `, ${activity.violationCount} violations` : '';
      lines.push(`  [${time}] ${activity.username}: ${activity.command}${activity.file ? ` ${activity.file}` : ''}${violations}`);
    }
  }

  return lines.join('\n');
}
