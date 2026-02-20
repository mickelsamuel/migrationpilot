/**
 * Historical analysis storage.
 *
 * Stores analysis results in ~/.migrationpilot/history/ as JSONL files.
 * Provides trend analysis: violation counts, risk scores over time.
 */

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

const HISTORY_DIR = join(homedir(), '.migrationpilot', 'history');

export interface HistoryEntry {
  timestamp: string;
  file: string;
  riskLevel: string;
  riskScore: number;
  violationCount: number;
  criticalCount: number;
  warningCount: number;
  statementCount: number;
  ruleCount: number;
}

export interface TrendSummary {
  totalAnalyses: number;
  recentAnalyses: HistoryEntry[];
  averageRiskScore: number;
  totalViolations: number;
  criticalViolations: number;
  warningViolations: number;
  riskTrend: 'improving' | 'stable' | 'worsening';
  violationTrend: 'improving' | 'stable' | 'worsening';
}

/**
 * Record an analysis result in history.
 */
export async function recordAnalysis(entry: HistoryEntry): Promise<void> {
  try {
    await mkdir(HISTORY_DIR, { recursive: true });
    const month = entry.timestamp.slice(0, 7); // YYYY-MM
    const file = join(HISTORY_DIR, `${month}.jsonl`);
    const line = JSON.stringify(entry) + '\n';
    const existing = await readFile(file, 'utf-8').catch(() => '');
    await writeFile(file, existing + line);
  } catch {
    // History recording is best-effort
  }
}

/**
 * Read all history entries, most recent first.
 */
export async function readHistory(limit = 100): Promise<HistoryEntry[]> {
  try {
    await mkdir(HISTORY_DIR, { recursive: true });
    const files = await readdir(HISTORY_DIR);
    const jsonlFiles = files.filter(f => f.endsWith('.jsonl')).sort().reverse();

    const entries: HistoryEntry[] = [];
    for (const file of jsonlFiles) {
      if (entries.length >= limit) break;
      const content = await readFile(join(HISTORY_DIR, file), 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);
      for (const line of lines.reverse()) {
        if (entries.length >= limit) break;
        try {
          entries.push(JSON.parse(line) as HistoryEntry);
        } catch {
          // Skip malformed lines
        }
      }
    }

    return entries;
  } catch {
    return [];
  }
}

/**
 * Compute trend analysis from history.
 */
export async function computeTrends(): Promise<TrendSummary> {
  const entries = await readHistory(200);

  if (entries.length === 0) {
    return {
      totalAnalyses: 0,
      recentAnalyses: [],
      averageRiskScore: 0,
      totalViolations: 0,
      criticalViolations: 0,
      warningViolations: 0,
      riskTrend: 'stable',
      violationTrend: 'stable',
    };
  }

  const totalViolations = entries.reduce((sum, e) => sum + e.violationCount, 0);
  const criticalViolations = entries.reduce((sum, e) => sum + e.criticalCount, 0);
  const warningViolations = entries.reduce((sum, e) => sum + e.warningCount, 0);
  const averageRiskScore = Math.round(entries.reduce((sum, e) => sum + e.riskScore, 0) / entries.length);

  // Trend: compare recent half vs older half
  const mid = Math.floor(entries.length / 2);
  const recent = entries.slice(0, mid || 1);
  const older = entries.slice(mid || 1);

  const recentAvgRisk = recent.reduce((s, e) => s + e.riskScore, 0) / recent.length;
  const olderAvgRisk = older.length > 0 ? older.reduce((s, e) => s + e.riskScore, 0) / older.length : recentAvgRisk;

  const recentAvgViolations = recent.reduce((s, e) => s + e.violationCount, 0) / recent.length;
  const olderAvgViolations = older.length > 0 ? older.reduce((s, e) => s + e.violationCount, 0) / older.length : recentAvgViolations;

  const riskDelta = recentAvgRisk - olderAvgRisk;
  const violationDelta = recentAvgViolations - olderAvgViolations;

  const threshold = 5;

  return {
    totalAnalyses: entries.length,
    recentAnalyses: entries.slice(0, 10),
    averageRiskScore,
    totalViolations,
    criticalViolations,
    warningViolations,
    riskTrend: riskDelta < -threshold ? 'improving' : riskDelta > threshold ? 'worsening' : 'stable',
    violationTrend: violationDelta < -0.5 ? 'improving' : violationDelta > 0.5 ? 'worsening' : 'stable',
  };
}

/**
 * Format trends as readable output.
 */
export function formatTrends(trends: TrendSummary): string {
  if (trends.totalAnalyses === 0) {
    return 'No analysis history found.\nRun some analyses first, then check back for trends.';
  }

  const lines: string[] = [];
  lines.push('MigrationPilot Trends');
  lines.push('=====================');
  lines.push('');
  lines.push(`Total analyses: ${trends.totalAnalyses}`);
  lines.push(`Average risk score: ${trends.averageRiskScore}/100`);
  lines.push(`Total violations: ${trends.totalViolations} (${trends.criticalViolations} critical, ${trends.warningViolations} warning)`);
  lines.push('');

  const riskIcon = trends.riskTrend === 'improving' ? '↓' : trends.riskTrend === 'worsening' ? '↑' : '→';
  const violationIcon = trends.violationTrend === 'improving' ? '↓' : trends.violationTrend === 'worsening' ? '↑' : '→';

  lines.push(`Risk trend: ${riskIcon} ${trends.riskTrend}`);
  lines.push(`Violation trend: ${violationIcon} ${trends.violationTrend}`);
  lines.push('');

  if (trends.recentAnalyses.length > 0) {
    lines.push('Recent analyses:');
    for (const e of trends.recentAnalyses.slice(0, 5)) {
      const date = e.timestamp.slice(0, 10);
      const risk = e.riskLevel;
      lines.push(`  ${date}  ${risk.padEnd(6)} ${e.riskScore}/100  ${e.violationCount} violation(s)  ${e.file}`);
    }
  }

  return lines.join('\n');
}
