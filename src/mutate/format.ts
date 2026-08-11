/**
 * Output formatting for the Guardrail Mutation Tester (experimental).
 *
 * The text report leads with holes, because the holes are the point: a run that
 * catches everything is a one-line answer, a run that lets something through
 * needs to say exactly what and why.
 */

import chalk from 'chalk';
import { relative } from 'node:path';
import type { MutantResult, MutationReport } from './runner.js';

const SNIPPET_LIMIT = 96;

/** Show the shorter of the absolute path and one relative to the working directory. */
function displayPath(file: string): string {
  const rel = relative(process.cwd(), file);
  return rel && rel.length < file.length && !rel.startsWith('..') ? rel : file;
}

/** Collapse a statement to a single line. */
function flatten(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

/**
 * Truncate a before/after pair around the first difference. Chopping both at
 * character 96 would otherwise hide the edit on any long statement.
 */
function snippetPair(original: string, mutated: string): [string, string] {
  const before = flatten(original);
  const after = flatten(mutated);

  if (before.length <= SNIPPET_LIMIT && after.length <= SNIPPET_LIMIT) return [before, after];

  let common = 0;
  while (common < before.length && common < after.length && before[common] === after[common]) common++;

  const start = Math.max(0, common - 24);
  return [window(before, start), window(after, start)];
}

function window(text: string, start: number): string {
  const head = start > 0 ? '…' : '';
  const body = text.slice(start, start + SNIPPET_LIMIT);
  const tail = start + SNIPPET_LIMIT < text.length ? '…' : '';
  return `${head}${body}${tail}`;
}

interface HoleGroup {
  first: MutantResult;
  count: number;
}

/** Group repeats of the same operator in the same file — they are one hole, not five. */
function groupByOperatorAndFile(mutants: MutantResult[]): HoleGroup[] {
  const groups = new Map<string, HoleGroup>();
  for (const mutant of mutants) {
    const key = `${mutant.file} ${mutant.operatorId}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count++;
      continue;
    }
    groups.set(key, { first: mutant, count: 1 });
  }
  return [...groups.values()];
}

export function formatMutationReport(report: MutationReport): string {
  const lines: string[] = [];
  const holeGroups = groupByOperatorAndFile(report.holes);
  const uncoveredGroups = groupByOperatorAndFile(report.uncovered);

  const statusIcon = report.holes.length > 0 ? chalk.red('✗') : chalk.green('✓');

  lines.push('');
  lines.push(`  ${statusIcon} ${chalk.bold('MigrationPilot Mutation Test')} ${chalk.dim('— experimental')}`);
  lines.push(chalk.dim('  ─'.repeat(30)));

  const analysed = report.files.filter(f => !f.skipped).length;
  lines.push(`  ${chalk.bold(String(analysed))} file${analysed !== 1 ? 's' : ''} · ${chalk.bold(String(report.totalMutants))} dangerous mutant${report.totalMutants !== 1 ? 's' : ''} · ${report.ruleCount} rules · failOn: ${report.failOn}`);
  lines.push('');

  for (const file of report.files) {
    if (file.skipped) {
      lines.push(`  ${chalk.yellow('⚠')} Skipped ${displayPath(file.file)} — ${file.skipped}`);
    } else if (!file.baselineClean) {
      lines.push(`  ${chalk.yellow('⚠')} ${displayPath(file.file)} already fails your config (${file.baselineViolations.length} violation${file.baselineViolations.length !== 1 ? 's' : ''}) — fix it first, mutation results assume a passing baseline.`);
    }
  }
  if (report.files.some(f => f.skipped || !f.baselineClean)) lines.push('');

  if (holeGroups.length > 0) {
    lines.push(`  ${chalk.red.bold('Your config would ALLOW:')}`);
    lines.push('');
    for (const group of holeGroups) {
      lines.push(...formatHole(group, chalk.yellow('⚠')));
    }
  }

  if (uncoveredGroups.length > 0) {
    lines.push(`  ${chalk.dim.bold('Not covered by any rule')} ${chalk.dim('(no config change catches these)')}`);
    lines.push('');
    for (const group of uncoveredGroups) {
      lines.push(...formatHole(group, chalk.dim('·')));
    }
  }

  const caughtLine = `  Guardrail caught ${report.caught}/${report.totalMutants} dangerous mutants.`;
  lines.push(report.holes.length > 0 ? chalk.dim(caughtLine) : chalk.green(caughtLine));

  if (report.holes.length > 0) {
    lines.push(`  ${chalk.red.bold(`${report.holes.length} mutant${report.holes.length !== 1 ? 's' : ''} slipped through your config`)} ${chalk.dim(`(${holeGroups.length} distinct hole${holeGroups.length !== 1 ? 's' : ''})`)}`);
  } else if (report.totalMutants > 0) {
    lines.push(chalk.green('  No config holes found.'));
  } else {
    lines.push(chalk.dim('  No mutants could be generated — no operator applied to these migrations.'));
  }

  const timeStr = report.elapsedMs < 1000
    ? `${Math.round(report.elapsedMs)}ms`
    : `${(report.elapsedMs / 1000).toFixed(2)}s`;
  lines.push(chalk.dim(`  ${report.operatorCount} operators · ${timeStr}`));
  lines.push('');

  return lines.join('\n');
}

function formatHole(group: HoleGroup, icon: string): string[] {
  const { first, count } = group;
  const lines: string[] = [];
  const repeat = count > 1 ? chalk.dim(` (${count} occurrences in this file)`) : '';

  lines.push(`  ${icon} ${chalk.bold(`[${first.operatorId}]`)} in ${displayPath(first.file)}:${first.line}${repeat}`);
  lines.push(`      ${first.consequence}`);
  if (first.reason) {
    lines.push(`      ${chalk.dim(first.reason.detail)}`);
  }
  const [before, after] = snippetPair(first.originalStatement, first.mutatedStatement);
  lines.push(chalk.dim(`      - ${before}`));
  lines.push(chalk.dim(`      + ${after}`));
  lines.push('');
  return lines;
}

/** Machine-readable report for CI. */
export function formatMutationJson(report: MutationReport): string {
  return JSON.stringify(
    {
      version: 1,
      experimental: true,
      failOn: report.failOn,
      pgVersion: report.pgVersion,
      ruleCount: report.ruleCount,
      operatorCount: report.operatorCount,
      totalMutants: report.totalMutants,
      caught: report.caught,
      holeCount: report.holes.length,
      uncoveredCount: report.uncovered.length,
      files: report.files.map(f => ({
        file: f.file,
        skipped: f.skipped ?? null,
        baselineClean: f.baselineClean,
        baselineViolationCount: f.baselineViolations.length,
        mutantCount: f.mutants.length,
      })),
      holes: report.holes.map(serializeMutant),
      uncovered: report.uncovered.map(serializeMutant),
    },
    null,
    2,
  );
}

function serializeMutant(mutant: MutantResult) {
  return {
    operator: mutant.operatorId,
    operatorName: mutant.operatorName,
    file: mutant.file,
    line: mutant.line,
    consequence: mutant.consequence,
    targetRules: mutant.targetRules,
    reason: mutant.reason ?? null,
    original: mutant.originalStatement,
    mutated: mutant.mutatedStatement,
  };
}
