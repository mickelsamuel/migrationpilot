/**
 * Renderers for `migrationpilot plan-fix`.
 *
 * The text form is meant to be read top to bottom and copied step by step;
 * the JSON form is the same data for tooling.
 */

import chalk from 'chalk';
import type { FixPlan, PlanFixReport, PlanFixStep } from './plan-fix.js';

const RULE = '─'.repeat(66);

/** Format a plan-fix report for the terminal. */
export function formatPlanFix(report: PlanFixReport): string {
  const out: string[] = [];

  out.push('');
  out.push(`  ${chalk.bold('MigrationPilot — expand-contract plan')}`);
  out.push('');
  out.push(`  ${chalk.dim('File:')}       ${report.file}`);
  out.push(`  ${chalk.dim('Target:')}     PostgreSQL ${report.pgVersion}`);
  out.push(`  ${chalk.dim('Plans:')}      ${report.plans.length}`);
  out.push('');

  if (report.plans.length === 0) {
    out.push(`  ${chalk.green('Nothing here needs a multi-step plan.')}`);
    out.push('');
    out.push(...formatUnplanned(report));
    return out.join('\n');
  }

  for (const plan of report.plans) {
    out.push(...formatPlan(plan));
  }

  out.push(...formatUnplanned(report));
  return out.join('\n');
}

function formatPlan(plan: FixPlan): string[] {
  const out: string[] = [];
  const deploys = new Set(plan.steps.map(s => s.deploy)).size;

  const ids = [plan.ruleId, ...plan.alsoResolves].join('+');

  out.push(`  ${chalk.dim(RULE)}`);
  out.push(`  ${chalk.bold.white(ids)} ${chalk.dim(`line ${plan.line}`)}  ${chalk.bold(plan.title)}`);
  out.push(`  ${chalk.dim(`pattern ${plan.pattern} · ${plan.steps.length} step${plan.steps.length === 1 ? '' : 's'} · ${deploys} deploy${deploys === 1 ? '' : 's'}`)}`);
  out.push(`  ${chalk.dim(RULE)}`);
  out.push('');
  out.push(...wrap(plan.summary, 72).map(l => `  ${l}`));
  out.push('');

  let boundaryNo = 0;
  for (const step of plan.steps) {
    out.push(...formatStep(step));
    for (const boundary of plan.boundaries.filter(b => b.afterStep === step.number)) {
      boundaryNo++;
      out.push(...formatBoundary(boundary.reason, boundaryNo, plan.boundaries.length));
    }
  }

  if (plan.notes.length > 0) {
    out.push(`  ${chalk.bold('Notes')}`);
    for (const note of plan.notes) {
      const lines = wrap(note, 70);
      out.push(`    ${chalk.dim('•')} ${lines[0]}`);
      for (const line of lines.slice(1)) out.push(`      ${line}`);
    }
    out.push('');
  }

  return out;
}

function formatStep(step: PlanFixStep): string[] {
  const out: string[] = [];
  out.push(`  ${chalk.bold.cyan(`STEP ${step.number}`)}  ${chalk.bold(step.title)}`);
  out.push(`    ${chalk.dim('Lock:')} ${lockColor(step.lock)}  ${chalk.dim('Runs for:')} ${step.duration}`);
  out.push(`    ${chalk.dim(step.lockNote)}`);
  if (!step.transactional) {
    out.push(`    ${chalk.yellow('Must run outside a transaction block.')}`);
  }
  out.push('');
  for (const line of step.sql.split('\n')) {
    out.push(line.length > 0 ? `      ${line}` : '');
  }
  out.push('');
  return out;
}

function formatBoundary(reason: string, number: number, total: number): string[] {
  const label = total > 1 ? `DEPLOY BOUNDARY ${number} of ${total}` : 'DEPLOY BOUNDARY';
  const head = `══ ${label} `;
  const out: string[] = [];
  out.push(`  ${chalk.bold.yellow(head + '═'.repeat(Math.max(2, 66 - head.length)))}`);
  for (const line of wrap(reason, 64)) {
    out.push(`  ${chalk.yellow('║')} ${line}`);
  }
  out.push(`  ${chalk.bold.yellow('═'.repeat(66))}`);
  out.push('');
  return out;
}

function formatUnplanned(report: PlanFixReport): string[] {
  if (report.unplanned.length === 0) return [];
  const out: string[] = [];
  const mechanical = report.unplanned.filter(u => u.fixClass === 'mechanical');
  const manual = report.unplanned.filter(u => u.fixClass !== 'mechanical');

  out.push(`  ${chalk.dim(RULE)}`);
  if (mechanical.length > 0) {
    out.push(`  ${chalk.bold(`${mechanical.length} violation(s) need no plan — run`)} ${chalk.cyan('migrationpilot analyze --fix')}`);
    for (const u of mechanical) {
      out.push(`    ${chalk.dim(`line ${u.line}`)}  ${u.ruleId}`);
    }
    out.push('');
  }
  if (manual.length > 0) {
    out.push(`  ${chalk.bold(`${manual.length} violation(s) have no automatic fix:`)}`);
    for (const u of manual) {
      out.push(`    ${chalk.dim(`line ${u.line}`)}  ${u.ruleId} — ${truncate(u.message, 90)}`);
    }
    out.push('');
  }
  return out;
}

function lockColor(lock: string): string {
  if (lock === 'ACCESS EXCLUSIVE') return chalk.red(lock);
  if (lock === 'SHARE UPDATE EXCLUSIVE') return chalk.cyan(lock);
  if (lock === 'ROW EXCLUSIVE') return chalk.yellow(lock);
  return chalk.green(lock);
}

function truncate(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function wrap(text: string, width: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (current.length === 0) current = word;
    else if (current.length + 1 + word.length <= width) current += ` ${word}`;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

/** Format a plan-fix report as JSON. */
export function formatPlanFixJson(report: PlanFixReport): string {
  return JSON.stringify(
    {
      file: report.file,
      pgVersion: report.pgVersion,
      plans: report.plans.map(plan => ({
        ruleId: plan.ruleId,
        ruleName: plan.ruleName,
        alsoResolves: plan.alsoResolves,
        line: plan.line,
        pattern: plan.pattern,
        title: plan.title,
        summary: plan.summary,
        deploys: new Set(plan.steps.map(s => s.deploy)).size,
        steps: plan.steps,
        boundaries: plan.boundaries,
        notes: plan.notes,
      })),
      unplanned: report.unplanned,
    },
    null,
    2,
  );
}
