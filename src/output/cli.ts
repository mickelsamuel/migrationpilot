import chalk from 'chalk';
import Table from 'cli-table3';
import type { RiskLevel, RiskScore } from '../scoring/score.js';
import type { RuleViolation } from '../rules/engine.js';
import type { LockClassification } from '../locks/classify.js';

export interface StatementResult {
  sql: string;
  lock: LockClassification;
  risk: RiskScore;
  violations: RuleViolation[];
}

export interface AnalysisOutput {
  file: string;
  statements: StatementResult[];
  overallRisk: RiskScore;
  violations: RuleViolation[];
}

export function formatCliOutput(analysis: AnalysisOutput): string {
  const lines: string[] = [];
  const criticals = analysis.violations.filter(v => v.severity === 'critical');
  const warnings = analysis.violations.filter(v => v.severity === 'warning');

  // Header banner
  lines.push('');
  const riskBadge = formatRiskBadge(analysis.overallRisk.level);
  const statusIcon = criticals.length > 0 ? chalk.red('✗') : warnings.length > 0 ? chalk.yellow('⚠') : chalk.green('✓');
  lines.push(`  ${statusIcon} ${chalk.bold('MigrationPilot')} ${chalk.dim('—')} ${riskBadge} ${chalk.dim(`Score: ${analysis.overallRisk.score}/100`)}`);
  lines.push(`  ${chalk.dim(analysis.file)}`);
  lines.push(chalk.dim('  ─'.repeat(30)));

  // Quick stats
  const statsLine = [
    `${chalk.bold(String(analysis.statements.length))} statement${analysis.statements.length !== 1 ? 's' : ''}`,
  ];

  if (criticals.length > 0) {
    statsLine.push(`${chalk.red.bold(String(criticals.length))} critical`);
  }
  if (warnings.length > 0) {
    statsLine.push(`${chalk.yellow.bold(String(warnings.length))} warning${warnings.length !== 1 ? 's' : ''}`);
  }
  if (criticals.length === 0 && warnings.length === 0) {
    statsLine.push(chalk.green('0 violations'));
  }

  lines.push(`  ${statsLine.join(chalk.dim(' · '))}`);
  lines.push('');

  // Statements table
  if (analysis.statements.length > 0) {
    const table = new Table({
      head: ['#', 'Statement', 'Lock Type', 'Risk', 'Long?'].map(h => chalk.dim(h)),
      style: { head: [], border: [] },
      colWidths: [5, 50, 25, 8, 7],
      wordWrap: true,
    });

    for (let i = 0; i < analysis.statements.length; i++) {
      const s = analysis.statements[i];
      const sqlPreview = truncate(s.sql.replace(/\s+/g, ' ').trim(), 45);
      table.push([
        String(i + 1),
        sqlPreview,
        formatLockType(s.lock.lockType),
        formatRiskBadge(s.risk.level),
        s.lock.longHeld ? chalk.red('YES') : chalk.green('no'),
      ]);
    }

    lines.push(table.toString());
    lines.push('');
  }

  // Violations
  if (analysis.violations.length > 0) {
    lines.push(chalk.bold('  Violations:'));
    lines.push('');

    for (const v of analysis.violations) {
      const icon = v.severity === 'critical' ? chalk.red('  ✗') : chalk.yellow('  ⚠');
      const tag = v.severity === 'critical'
        ? chalk.red.bold(` [${v.ruleId}] CRITICAL`)
        : chalk.yellow.bold(` [${v.ruleId}] WARNING`);

      lines.push(`${icon}${tag}${v.line ? chalk.dim(` (line ${v.line})`) : ''}`);
      lines.push(`    ${v.message}`);

      if (v.safeAlternative) {
        lines.push('');
        lines.push(chalk.green('    Safe alternative:'));
        for (const altLine of v.safeAlternative.split('\n')) {
          lines.push(chalk.dim(`    ${altLine}`));
        }
      }

      lines.push('');
    }
  } else {
    lines.push(chalk.green('  ✓ No violations found — migration is safe'));
    lines.push('');
  }

  // Risk factors
  if (analysis.overallRisk.factors.length > 0) {
    lines.push(chalk.dim('  Risk Factors:'));
    for (const f of analysis.overallRisk.factors) {
      const bar = formatBar(f.value, f.weight);
      lines.push(chalk.dim(`    ${f.name.padEnd(20)} ${bar} ${f.value}/${f.weight} — ${f.detail}`));
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format a summary for the `check` command when scanning multiple files.
 */
export function formatCheckSummary(results: AnalysisOutput[]): string {
  const lines: string[] = [];
  const totalViolations = results.reduce((sum, r) => sum + r.violations.length, 0);
  const totalCritical = results.reduce((sum, r) => sum + r.violations.filter(v => v.severity === 'critical').length, 0);
  const totalWarning = results.reduce((sum, r) => sum + r.violations.filter(v => v.severity === 'warning').length, 0);
  const worstLevel = results.reduce((worst, r) =>
    riskOrdinal(r.overallRisk.level) > riskOrdinal(worst) ? r.overallRisk.level : worst,
    'GREEN' as RiskLevel
  );

  lines.push('');
  lines.push(chalk.dim('  ═'.repeat(30)));

  const statusIcon = totalCritical > 0 ? chalk.red('✗') : totalWarning > 0 ? chalk.yellow('⚠') : chalk.green('✓');
  lines.push(`  ${statusIcon} ${chalk.bold('MigrationPilot Summary')} — ${formatRiskBadge(worstLevel)}`);
  lines.push('');

  lines.push(`  ${chalk.bold(String(results.length))} file${results.length !== 1 ? 's' : ''} scanned`);

  if (totalViolations === 0) {
    lines.push(`  ${chalk.green.bold('All migrations passed')}`);
  } else {
    if (totalCritical > 0) lines.push(`  ${chalk.red.bold(`${totalCritical} critical violation${totalCritical !== 1 ? 's' : ''}`)}  — must fix before deploying`);
    if (totalWarning > 0) lines.push(`  ${chalk.yellow.bold(`${totalWarning} warning${totalWarning !== 1 ? 's' : ''}`)} — review recommended`);
  }

  // Per-file summary
  lines.push('');
  for (const r of results) {
    const icon = r.violations.some(v => v.severity === 'critical') ? chalk.red('✗')
      : r.violations.some(v => v.severity === 'warning') ? chalk.yellow('⚠')
      : chalk.green('✓');
    const vCount = r.violations.length > 0 ? chalk.dim(`(${r.violations.length} violation${r.violations.length !== 1 ? 's' : ''})`) : '';
    lines.push(`  ${icon} ${r.file} ${vCount}`);
  }

  lines.push('');

  return lines.join('\n');
}

function formatRiskBadge(level: RiskLevel): string {
  switch (level) {
    case 'RED': return chalk.bgRed.white.bold(' RED ');
    case 'YELLOW': return chalk.bgYellow.black.bold(' YELLOW ');
    case 'GREEN': return chalk.bgGreen.black.bold(' GREEN ');
  }
}

function formatLockType(lockType: string): string {
  switch (lockType) {
    case 'ACCESS EXCLUSIVE': return chalk.red(lockType);
    case 'SHARE': return chalk.yellow(lockType);
    case 'SHARE UPDATE EXCLUSIVE': return chalk.cyan('SHARE UPD EXCL');
    case 'ROW EXCLUSIVE': return chalk.blue(lockType);
    case 'ACCESS SHARE': return chalk.green(lockType);
    default: return lockType;
  }
}

function formatBar(value: number, max: number): string {
  const filled = Math.round((value / max) * 10);
  const empty = 10 - filled;
  const color = value / max > 0.7 ? chalk.red : value / max > 0.4 ? chalk.yellow : chalk.green;
  return color('█'.repeat(filled)) + chalk.dim('░'.repeat(empty));
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 3) + '...' : str;
}

function riskOrdinal(level: RiskLevel): number {
  return level === 'RED' ? 2 : level === 'YELLOW' ? 1 : 0;
}
