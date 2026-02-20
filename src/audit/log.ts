/**
 * Audit logging for enterprise compliance.
 *
 * Records all MigrationPilot operations as JSONL events.
 * Configurable via `auditLog` in .migrationpilotrc.yml:
 *
 * auditLog:
 *   enabled: true
 *   path: ./migrationpilot-audit.jsonl
 */

import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface AuditEvent {
  timestamp: string;
  event: string;
  command: string;
  file?: string;
  riskLevel?: string;
  riskScore?: number;
  violationCount?: number;
  exitCode?: number;
  user?: string;
  ci?: boolean;
  metadata?: Record<string, unknown>;
}

export interface AuditConfig {
  enabled: boolean;
  path: string;
}

const DEFAULT_AUDIT_PATH = './migrationpilot-audit.jsonl';

let auditConfig: AuditConfig | null = null;

/**
 * Configure audit logging. Call once at CLI startup.
 */
export function configureAudit(config: Partial<AuditConfig> | undefined): void {
  if (!config || !config.enabled) {
    auditConfig = null;
    return;
  }
  auditConfig = {
    enabled: true,
    path: config.path || DEFAULT_AUDIT_PATH,
  };
}

/**
 * Record an audit event. No-op if audit logging is disabled.
 */
export async function auditLog(event: Omit<AuditEvent, 'timestamp' | 'ci' | 'user'>): Promise<void> {
  if (!auditConfig?.enabled) return;

  const fullEvent: AuditEvent = {
    ...event,
    timestamp: new Date().toISOString(),
    user: process.env.USER || process.env.USERNAME || 'unknown',
    ci: !!(process.env.CI || process.env.GITHUB_ACTIONS || process.env.GITLAB_CI),
  };

  try {
    await mkdir(dirname(auditConfig.path), { recursive: true });
    await appendFile(auditConfig.path, JSON.stringify(fullEvent) + '\n');
  } catch {
    // Audit logging is best-effort — don't crash the tool
  }
}

/**
 * Check if audit logging is enabled.
 */
export function isAuditEnabled(): boolean {
  return auditConfig?.enabled ?? false;
}
