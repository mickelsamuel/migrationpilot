import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { configureAudit, auditLog, isAuditEnabled } from '../src/audit/log.js';

const testDir = join(tmpdir(), `mp-audit-test-${Date.now()}`);

describe('audit/log', () => {
  beforeEach(async () => {
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    configureAudit(undefined);
    try { await rm(testDir, { recursive: true, force: true }); } catch {}
  });

  it('is disabled by default', () => {
    expect(isAuditEnabled()).toBe(false);
  });

  it('is disabled when config is undefined', () => {
    configureAudit(undefined);
    expect(isAuditEnabled()).toBe(false);
  });

  it('is disabled when enabled is false', () => {
    configureAudit({ enabled: false });
    expect(isAuditEnabled()).toBe(false);
  });

  it('enables audit logging when configured', () => {
    configureAudit({ enabled: true, path: join(testDir, 'audit.jsonl') });
    expect(isAuditEnabled()).toBe(true);
  });

  it('is a no-op when disabled', async () => {
    configureAudit(undefined);
    await auditLog({ event: 'test', command: 'analyze' });
    // Should not throw or create any file
  });

  it('writes events as JSONL', async () => {
    const auditPath = join(testDir, 'audit.jsonl');
    configureAudit({ enabled: true, path: auditPath });

    await auditLog({
      event: 'analysis_complete',
      command: 'analyze',
      file: 'migrations/001.sql',
      riskLevel: 'RED',
      riskScore: 75,
      violationCount: 3,
      exitCode: 2,
    });

    const content = await readFile(auditPath, 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(1);

    const parsed = JSON.parse(lines[0]!);
    expect(parsed.event).toBe('analysis_complete');
    expect(parsed.command).toBe('analyze');
    expect(parsed.file).toBe('migrations/001.sql');
    expect(parsed.riskLevel).toBe('RED');
    expect(parsed.riskScore).toBe(75);
    expect(parsed.violationCount).toBe(3);
    expect(parsed.exitCode).toBe(2);
    expect(parsed.timestamp).toBeDefined();
    expect(parsed.user).toBeDefined();
    expect(typeof parsed.ci).toBe('boolean');
  });

  it('appends multiple events', async () => {
    const auditPath = join(testDir, 'audit.jsonl');
    configureAudit({ enabled: true, path: auditPath });

    await auditLog({ event: 'analysis_complete', command: 'analyze' });
    await auditLog({ event: 'check_complete', command: 'check' });
    await auditLog({ event: 'analysis_complete', command: 'analyze' });

    const content = await readFile(auditPath, 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[0]!).event).toBe('analysis_complete');
    expect(JSON.parse(lines[1]!).event).toBe('check_complete');
    expect(JSON.parse(lines[2]!).event).toBe('analysis_complete');
  });

  it('includes metadata when provided', async () => {
    const auditPath = join(testDir, 'audit.jsonl');
    configureAudit({ enabled: true, path: auditPath });

    await auditLog({
      event: 'check_complete',
      command: 'check',
      metadata: { fileCount: 5 },
    });

    const content = await readFile(auditPath, 'utf-8');
    const parsed = JSON.parse(content.trim());
    expect(parsed.metadata).toEqual({ fileCount: 5 });
  });

  it('creates parent directories for audit file', async () => {
    const auditPath = join(testDir, 'nested', 'dir', 'audit.jsonl');
    configureAudit({ enabled: true, path: auditPath });

    await auditLog({ event: 'test', command: 'analyze' });

    const content = await readFile(auditPath, 'utf-8');
    expect(content.trim()).toBeTruthy();
  });

  it('uses default path when none specified', () => {
    configureAudit({ enabled: true });
    expect(isAuditEnabled()).toBe(true);
  });

  it('can be re-disabled after enabling', () => {
    configureAudit({ enabled: true, path: join(testDir, 'audit.jsonl') });
    expect(isAuditEnabled()).toBe(true);
    configureAudit(undefined);
    expect(isAuditEnabled()).toBe(false);
  });
});
