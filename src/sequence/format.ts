/**
 * Report writers for sequence-level analysis.
 *
 * Text output follows the shape of the per-file report in ../output/cli.ts —
 * banner, findings, table — so `check` reads as one document. JSON output is
 * shaped here and embedded in the multi-file report by ../output/json.ts.
 */

import chalk from 'chalk';
import Table from 'cli-table3';
import { SEQUENCE_CHECKS, formatSeconds } from './analyze.js';
import type { SequenceAnalysis, SequenceFinding, SequenceFindingId, TableBlastRadius } from './analyze.js';

export interface SequenceReportJson {
  fileCount: number;
  files: string[];
  statementCount: number;
  thresholds: { lockBudgetSeconds: number; hotTableFileThreshold: number };
  findings: Array<{
    id: SequenceFindingId;
    name: string;
    severity: 'critical' | 'warning';
    message: string;
    files: string[];
    table?: string;
    detail?: string;
  }>;
  /** SQ005 — the blast-radius summary. */
  blastRadius: {
    totalEstimatedLockSeconds: number;
    estimateBasis: 'measured' | 'heuristic';
    tables: TableBlastRadius[];
  };
  summary: {
    totalFindings: number;
    criticalCount: number;
    warningCount: number;
    tablesTouched: number;
  };
  parseErrors: Array<{ file: string; error: string }>;
}

/**
 * Render the sequence report for the terminal.
 *
 * Returns an empty string when there is nothing worth saying — a single-file
 * run, or a clean sequence that touches nothing under a blocking lock.
 */
export function formatSequenceReport(analysis: SequenceAnalysis): string {
  if (analysis.fileCount < 2 && analysis.parseErrors.length === 0) return '';

  const lines: string[] = [];
  const criticals = analysis.findings.filter(f => f.severity === 'critical');
  const warnings = analysis.findings.filter(f => f.severity === 'warning');
  const statusIcon = criticals.length > 0 ? chalk.red('✗') : warnings.length > 0 ? chalk.yellow('⚠') : chalk.green('✓');

  lines.push('');
  lines.push(chalk.dim('  ═'.repeat(30)));
  lines.push(`  ${statusIcon} ${chalk.bold('Sequence Analysis')} ${chalk.dim(`— ${analysis.fileCount} file${analysis.fileCount !== 1 ? 's' : ''} applied in order`)}`);
  lines.push('');

  const tableCount = analysis.blastRadius.tables.length;
  const stats = [
    `${chalk.bold(String(analysis.statementCount))} statement${analysis.statementCount !== 1 ? 's' : ''}`,
    `${chalk.bold(String(tableCount))} table${tableCount !== 1 ? 's' : ''} touched`,
  ];
  if (criticals.length > 0) stats.push(`${chalk.red.bold(String(criticals.length))} critical`);
  if (warnings.length > 0) stats.push(`${chalk.yellow.bold(String(warnings.length))} warning${warnings.length !== 1 ? 's' : ''}`);
  if (analysis.findings.length === 0) stats.push(chalk.green('no cross-file findings'));
  lines.push(`  ${stats.join(chalk.dim(' · '))}`);
  lines.push('');

  for (const finding of analysis.findings) {
    lines.push(...formatFinding(finding));
  }

  if (analysis.blastRadius.tables.length > 0) {
    lines.push(...formatBlastRadius(analysis));
  }

  if (analysis.parseErrors.length > 0) {
    lines.push(`  ${chalk.yellow('Skipped — could not parse:')}`);
    for (const e of analysis.parseErrors) {
      lines.push(`    ${chalk.dim(`${e.file}: ${e.error}`)}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function formatFinding(finding: SequenceFinding): string[] {
  const lines: string[] = [];
  const icon = finding.severity === 'critical' ? chalk.red('  ✗') : chalk.yellow('  ⚠');
  const tag = finding.severity === 'critical'
    ? chalk.red.bold(` [${finding.id}] CRITICAL`)
    : chalk.yellow.bold(` [${finding.id}] WARNING`);

  lines.push(`${icon}${tag} ${chalk.dim(finding.name)}`);
  lines.push(`    ${finding.message}`);

  if (finding.detail) {
    for (const detailLine of finding.detail.split('\n')) {
      lines.push(chalk.dim(`      ${detailLine}`));
    }
  }

  lines.push('');
  return lines;
}

/** SQ005 — the table that answers "what does this deploy touch?". */
function formatBlastRadius(analysis: SequenceAnalysis): string[] {
  const lines: string[] = [];
  const { blastRadius } = analysis;

  lines.push(`  ${chalk.bold(`[SQ005] ${SEQUENCE_CHECKS.SQ005.name}`)}`);
  lines.push('');

  const table = new Table({
    head: ['Table', 'Files', 'Stmts', 'Worst Lock', 'Est. Lock Time'].map(h => chalk.dim(h)),
    style: { head: [], border: [] },
    colWidths: [26, 7, 7, 26, 16],
    wordWrap: true,
  });

  for (const t of blastRadius.tables) {
    table.push([
      t.table,
      String(t.files.length),
      String(t.statements),
      formatLock(t),
      t.estimatedLockSeconds > 0 ? formatSeconds(t.estimatedLockSeconds) : chalk.green('none'),
    ]);
  }

  lines.push(table.toString());
  lines.push('');
  lines.push(`  ${chalk.dim('Total blocking lock time:')} ${chalk.bold(formatSeconds(blastRadius.totalEstimatedLockSeconds))}`);
  lines.push(`  ${chalk.dim(blastRadius.estimateBasis === 'measured'
    ? 'Estimates calibrated to production row counts.'
    : 'Estimates are per-operation defaults — pass --database-url to calibrate them to real table sizes.')}`);
  lines.push('');

  return lines;
}

function formatLock(t: TableBlastRadius): string {
  const label = t.worstLockLongHeld ? `${t.worstLock} (long)` : t.worstLock;
  switch (t.worstLock) {
    case 'ACCESS EXCLUSIVE': return chalk.red(label);
    case 'SHARE':
    case 'SHARE ROW EXCLUSIVE': return chalk.yellow(label);
    case 'SHARE UPDATE EXCLUSIVE': return chalk.cyan(label);
    case 'ROW EXCLUSIVE': return chalk.blue(label);
    default: return chalk.green(label);
  }
}

/** Shape the analysis for the `--format json` report. */
export function buildSequenceJson(analysis: SequenceAnalysis): SequenceReportJson {
  return {
    fileCount: analysis.fileCount,
    files: analysis.files,
    statementCount: analysis.statementCount,
    thresholds: analysis.thresholds,
    findings: analysis.findings.map(f => ({
      id: f.id,
      name: f.name,
      severity: f.severity,
      message: f.message,
      files: f.files,
      ...(f.table && { table: f.table }),
      ...(f.detail && { detail: f.detail }),
    })),
    blastRadius: {
      totalEstimatedLockSeconds: analysis.blastRadius.totalEstimatedLockSeconds,
      estimateBasis: analysis.blastRadius.estimateBasis,
      tables: analysis.blastRadius.tables,
    },
    summary: {
      totalFindings: analysis.findings.length,
      criticalCount: analysis.findings.filter(f => f.severity === 'critical').length,
      warningCount: analysis.findings.filter(f => f.severity === 'warning').length,
      tablesTouched: analysis.blastRadius.tables.length,
    },
    parseErrors: analysis.parseErrors,
  };
}
