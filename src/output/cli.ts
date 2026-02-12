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

  // Header
  lines.push('');
  lines.push(chalk.bold(`  MigrationPilot — ${analysis.file}`));
  lines.push(chalk.dim('  ─'.repeat(30)));
  lines.push('');

  // Overall risk
  const riskBadge = formatRiskBadge(analysis.overallRisk.level);
  lines.push(`  Risk: ${riskBadge}  Score: ${analysis.overallRisk.score}/100`);
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
      const sqlPreview = s.sql.length > 45 ? s.sql.slice(0, 42) + '...' : s.sql;
      table.push([
        String(i + 1),
        sqlPreview,
        s.lock.lockType,
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

      lines.push(`${icon}${tag}`);
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
    lines.push(chalk.green('  ✓ No violations found'));
    lines.push('');
  }

  // Risk factors
  if (analysis.overallRisk.factors.length > 0) {
    lines.push(chalk.dim('  Risk Factors:'));
    for (const f of analysis.overallRisk.factors) {
      lines.push(chalk.dim(`    ${f.name}: ${f.value}/${f.weight} — ${f.detail}`));
    }
    lines.push('');
  }

  return lines.join('\n');
}

function formatRiskBadge(level: RiskLevel): string {
  switch (level) {
    case 'RED': return chalk.bgRed.white.bold(' RED ');
    case 'YELLOW': return chalk.bgYellow.black.bold(' YELLOW ');
    case 'GREEN': return chalk.bgGreen.black.bold(' GREEN ');
  }
}
