/**
 * Next-step suggestions for CLI output.
 *
 * After displaying violations, suggest concrete next steps
 * based on what was found. Inspired by Rust compiler messages.
 */

import chalk from 'chalk';
import type { RuleViolation } from '../rules/engine.js';

interface Suggestion {
  label: string;
  command?: string;
  hint?: string;
}

/**
 * Generate next-step suggestions based on violations found.
 */
export function generateSuggestions(violations: RuleViolation[], file?: string): string[] {
  const suggestions: Suggestion[] = [];
  const ruleIds = new Set(violations.map(v => v.ruleId));

  // Auto-fixable violations
  const fixableRules = new Set([
    'MP001', 'MP004', 'MP009', 'MP020', 'MP021', 'MP023',
    'MP030', 'MP033', 'MP037', 'MP040', 'MP041', 'MP046',
  ]);
  const fixable = violations.filter(v => fixableRules.has(v.ruleId));
  if (fixable.length > 0 && file) {
    suggestions.push({
      label: `${fixable.length} violation${fixable.length !== 1 ? 's' : ''} can be auto-fixed`,
      command: `migrationpilot analyze ${file} --fix`,
    });
  }

  // Preview fixes before applying
  if (fixable.length > 0 && file) {
    suggestions.push({
      label: 'Preview fixes without modifying the file',
      command: `migrationpilot analyze ${file} --fix --dry-run`,
    });
  }

  // Explain specific rules
  if (violations.length > 0) {
    const firstRule = violations[0]!.ruleId;
    suggestions.push({
      label: 'Learn more about a specific rule',
      command: `migrationpilot explain ${firstRule}`,
    });
  }

  // Disable specific rules
  if (violations.length > 0) {
    const ruleList = [...ruleIds].slice(0, 3).join(',');
    suggestions.push({
      label: 'Exclude rules from analysis',
      command: `migrationpilot analyze ${file ?? '<file>'} --exclude ${ruleList}`,
    });
  }

  // Inline disable
  if (violations.length > 0) {
    suggestions.push({
      label: 'Disable a rule for a specific statement',
      hint: `Add a comment above the SQL: -- migrationpilot-disable ${violations[0]!.ruleId}`,
    });
  }

  // Config file
  if (violations.length > 3) {
    suggestions.push({
      label: 'Create a config file to customize rules',
      command: 'migrationpilot init',
    });
  }

  return formatSuggestions(suggestions.slice(0, 4));
}

function formatSuggestions(suggestions: Suggestion[]): string[] {
  if (suggestions.length === 0) return [];

  const lines: string[] = [];
  lines.push('');
  lines.push(chalk.cyan.bold('Next steps:'));

  for (const s of suggestions) {
    if (s.command) {
      lines.push(`  ${chalk.dim('→')} ${s.label}: ${chalk.green(s.command)}`);
    } else if (s.hint) {
      lines.push(`  ${chalk.dim('→')} ${s.label}`);
      lines.push(`    ${chalk.dim(s.hint)}`);
    }
  }

  return lines;
}

/**
 * Format a Rust-style error box for a violation.
 */
export function formatRichError(violation: RuleViolation, sql?: string): string[] {
  const lines: string[] = [];
  const severity = violation.severity === 'critical' ? chalk.red.bold('error') : chalk.yellow.bold('warning');
  const ruleRef = chalk.dim(`[${violation.ruleId}]`);

  lines.push(`${severity}${ruleRef}: ${violation.message}`);

  if (sql) {
    // Show the relevant SQL line with a pointer
    const sqlLines = sql.split('\n');
    const lineIdx = Math.max(0, violation.line - 1);
    const targetLine = sqlLines[lineIdx];
    if (targetLine) {
      const lineNum = String(violation.line).padStart(4);
      lines.push(chalk.dim(`  ${' '.repeat(lineNum.length)} |`));
      lines.push(`  ${chalk.cyan(lineNum)} ${chalk.dim('|')} ${targetLine}`);
      lines.push(chalk.dim(`  ${' '.repeat(lineNum.length)} |`) + chalk.red(` ${'~'.repeat(Math.min(targetLine.length, 60))}`));
    }
  }

  if (violation.safeAlternative) {
    lines.push(`  ${chalk.dim('=')} ${chalk.green('help')}: ${violation.safeAlternative.split('\n')[0]}`);
  }

  return lines;
}
