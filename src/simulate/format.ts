/**
 * Output formatting for `migrationpilot simulate`.
 *
 * The report has two halves that answer different questions, and the format
 * keeps them visibly separate rather than blending them into one verdict.
 * Static analysis answers "what will this do to a busy production database" —
 * locks, contention, rewrite cost. Execution answers "does this actually run" —
 * the server's own yes or no. A migration can pass one and fail the other, and
 * the reader needs to see which is which.
 */

import chalk from 'chalk';
import Table from 'cli-table3';
import { relative } from 'node:path';
import type { SimulationReport, SimulationRun, SimulatedStatement, PgErrorInfo } from './run.js';
import type { SchemaDiff } from '../drift/compare.js';
import type { Rule, RuleViolation } from '../rules/engine.js';
import { buildJsonReport } from '../output/json.js';

/** Show the shorter of the absolute path and one relative to the working directory. */
function displayPath(file: string): string {
  const rel = relative(process.cwd(), file);
  return rel && rel.length < file.length && !rel.startsWith('..') ? rel : file;
}

function flatten(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

/**
 * One-line form of a statement for the summary table.
 *
 * Leading comments are dropped here and only here. A statement's span starts
 * where the previous one's semicolon ended, so the comment above it belongs to
 * it as far as the parser is concerned — accurate, but it means a 46-column
 * cell would show the comment and none of the SQL. The full text, comment
 * included, is still printed verbatim when a statement fails.
 */
function displaySql(sql: string): string {
  let text = sql;
  for (;;) {
    const stripped = text.replace(/^\s*(?:--[^\n]*\n|\/\*[\s\S]*?\*\/)/, '');
    if (stripped === text) break;
    text = stripped;
  }
  return flatten(text.trim().length > 0 ? text : sql);
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function ms(value: number): string {
  if (value < 1) return `${value.toFixed(2)}ms`;
  if (value < 1000) return `${value.toFixed(1)}ms`;
  return `${(value / 1000).toFixed(2)}s`;
}

/**
 * Line up static violations with executed statements.
 *
 * When both halves saw the same statement list — the normal case, since both
 * split on the same parse tree — index matching is exact. When they disagree
 * (the static parser rejected the file, so the raw splitter ran) we fall back
 * to line numbers, which is looser but never invents a pairing.
 */
function violationsByStatement(report: SimulationReport): Map<number, RuleViolation[]> {
  const byIndex = new Map<number, RuleViolation[]>();
  const analysis = report.static?.analysis;
  if (!analysis) return byIndex;

  const aligned = analysis.statements.length === report.statements.length;

  for (const violation of analysis.violations) {
    let index: number | null = null;

    if (aligned) {
      const position = analysis.statements.findIndex(s => s.violations.includes(violation));
      if (position >= 0) index = position + 1;
    }
    if (index === null) {
      index = report.statements.find(s => s.line === violation.line)?.index ?? null;
    }
    if (index === null) continue;

    const existing = byIndex.get(index) ?? [];
    existing.push(violation);
    byIndex.set(index, existing);
  }

  return byIndex;
}

function staticCell(violations: RuleViolation[] | undefined): string {
  if (!violations || violations.length === 0) return chalk.green('clean');
  const critical = violations.some(v => v.severity === 'critical');
  const ids = [...new Set(violations.map(v => v.ruleId))].join(' ');
  return critical ? chalk.red(ids) : chalk.yellow(ids);
}

function runtimeCell(statement: SimulatedStatement): string {
  switch (statement.status) {
    case 'ok': {
      const rows = statement.rowsAffected && statement.rowsAffected > 0
        ? chalk.dim(` ${statement.rowsAffected} row${statement.rowsAffected !== 1 ? 's' : ''}`)
        : statement.rowsReturned && statement.rowsReturned > 0
          ? chalk.dim(` ${statement.rowsReturned} returned`)
          : '';
      return `${chalk.green('ok')} ${chalk.dim(ms(statement.durationMs))}${rows}`;
    }
    case 'error':
      return chalk.red(`FAILED ${statement.error?.code ?? ''}`.trim());
    case 'not-run':
      return chalk.dim('not run');
  }
}

/**
 * Render a PostgreSQL error the way PostgreSQL renders it, including the caret
 * line when the server told us where in the statement it gave up.
 */
export function formatPgError(error: PgErrorInfo, sql: string): string[] {
  const lines: string[] = [];
  lines.push(chalk.red(`ERROR:  ${error.message}`));
  if (error.detail) lines.push(chalk.red(`DETAIL:  ${error.detail}`));
  if (error.hint) lines.push(chalk.cyan(`HINT:  ${error.hint}`));

  if (error.position !== null && error.position > 0 && error.position <= sql.length + 1) {
    const before = sql.slice(0, error.position - 1);
    const lineStart = before.lastIndexOf('\n') + 1;
    const lineEnd = sql.indexOf('\n', error.position - 1);
    const text = sql.slice(lineStart, lineEnd === -1 ? sql.length : lineEnd);
    const column = error.position - 1 - lineStart;
    const lineNumber = before.split('\n').length;
    const prefix = `LINE ${lineNumber}: `;
    lines.push(chalk.dim(`${prefix}${text}`));
    lines.push(chalk.dim(`${' '.repeat(prefix.length + column)}^`));
  }

  if (error.code) lines.push(chalk.dim(`SQLSTATE: ${error.code}`));
  return lines;
}

/** Compact renderer for the before/after catalog diff. */
function formatSchemaChanges(diff: SchemaDiff): string[] {
  const lines: string[] = [];

  for (const table of diff.tables.added) lines.push(`  ${chalk.green('+')} table ${chalk.bold(table)}`);
  for (const table of diff.tables.removed) lines.push(`  ${chalk.red('-')} table ${chalk.bold(table)}`);

  for (const mod of diff.tables.modified) {
    for (const col of mod.columns.added) {
      const nullable = col.nullable ? '' : ' NOT NULL';
      const dflt = col.defaultValue ? ` DEFAULT ${col.defaultValue}` : '';
      lines.push(`  ${chalk.green('+')} column ${chalk.bold(`${mod.table}.${col.name}`)} ${col.dataType}${nullable}${dflt}`);
    }
    for (const col of mod.columns.removed) {
      lines.push(`  ${chalk.red('-')} column ${chalk.bold(`${mod.table}.${col.name}`)} ${col.dataType}`);
    }
    for (const col of mod.columns.modified) {
      lines.push(`  ${chalk.yellow('~')} column ${chalk.bold(`${mod.table}.${col.name}`)} ${chalk.dim(col.changes.join(', '))}`);
    }
    for (const con of mod.constraints.added) {
      lines.push(`  ${chalk.green('+')} constraint ${chalk.bold(con.name)} on ${mod.table} ${chalk.dim(`(${con.type})`)}`);
    }
    for (const con of mod.constraints.removed) {
      lines.push(`  ${chalk.red('-')} constraint ${chalk.bold(con.name)} on ${mod.table} ${chalk.dim(`(${con.type})`)}`);
    }
  }

  for (const idx of diff.indexes.added) {
    lines.push(`  ${chalk.green('+')} index ${chalk.bold(idx.name)} on ${idx.table}`);
  }
  for (const idx of diff.indexes.removed) {
    lines.push(`  ${chalk.red('-')} index ${chalk.bold(idx.name)} on ${idx.table}`);
  }
  for (const seq of diff.sequences.added) lines.push(`  ${chalk.green('+')} sequence ${chalk.bold(seq)}`);
  for (const seq of diff.sequences.removed) lines.push(`  ${chalk.red('-')} sequence ${chalk.bold(seq)}`);

  return lines;
}

export interface SimulationFormatOptions {
  /** Rules, for docs links on static violations. */
  rules?: Rule[];
  /**
   * Print the caveats block. The multi-file report prints them once at the end
   * instead of repeating an identical block under every migration.
   */
  showLimits?: boolean;
}

export function formatSimulationReport(report: SimulationReport, options?: SimulationFormatOptions): string {
  const lines: string[] = [];
  const failed = report.failedIndex !== null;
  const icon = failed ? chalk.red('✗') : chalk.green('✓');

  lines.push('');
  lines.push(`  ${icon} ${chalk.bold('MigrationPilot Simulate')}`);
  lines.push(`  ${chalk.dim(displayPath(report.file))}`);
  lines.push(chalk.dim('  ─'.repeat(30)));
  lines.push(`  ${chalk.dim('Engine:')} PostgreSQL ${chalk.bold(report.engine.serverVersion)} ${chalk.dim(`(PGlite ${report.engine.pglite}, ephemeral in-process, booted in ${ms(report.bootMs)})`)}`);
  if (report.baselinePath) {
    lines.push(`  ${chalk.dim('Baseline:')} ${displayPath(report.baselinePath)}`);
  }

  const total = report.statements.length;
  const stats = [`${chalk.bold(String(total))} statement${total !== 1 ? 's' : ''}`];
  stats.push(`${chalk.bold(String(report.executed))} executed`);
  if (failed) stats.push(chalk.red.bold('1 failed'));
  stats.push(`${ms(report.totalDurationMs)} total`);
  lines.push(`  ${stats.join(chalk.dim(' · '))}`);
  lines.push('');

  if (report.splitFallback) {
    lines.push(`  ${chalk.yellow('⚠')} Static analysis could not parse this file:`);
    for (const err of report.parseErrors) lines.push(`      ${chalk.dim(err)}`);
    lines.push(`      ${chalk.dim('Execution continued — PostgreSQL itself parsed it. Static results are unavailable below.')}`);
    lines.push('');
  }

  if (total > 0) {
    const violations = violationsByStatement(report);
    const table = new Table({
      head: ['#', 'Statement', 'Static', 'Runtime'].map(h => chalk.dim(h)),
      style: { head: [], border: [] },
      colWidths: [5, 46, 16, 24],
      wordWrap: true,
    });

    for (const statement of report.statements) {
      table.push([
        String(statement.index),
        truncate(displaySql(statement.sql), 44),
        report.static?.analysis ? staticCell(violations.get(statement.index)) : chalk.dim('—'),
        runtimeCell(statement),
      ]);
    }

    lines.push(table.toString());
    lines.push('');
  } else {
    lines.push(chalk.dim('  No executable statements found.'));
    lines.push('');
  }

  if (failed) {
    const statement = report.statements.find(s => s.status === 'error');
    if (statement?.error) {
      lines.push(`  ${chalk.red.bold(`Statement ${statement.index} failed`)} ${chalk.dim(`(line ${statement.line})`)}`);
      lines.push('');
      for (const line of formatPgError(statement.error, statement.sql)) lines.push(`    ${line}`);
      lines.push('');
      lines.push(chalk.dim('    Statement:'));
      for (const line of statement.sql.split('\n')) lines.push(chalk.dim(`      ${line}`));
      lines.push('');

      const before = report.statements.filter(s => s.index < statement.index);
      lines.push(`  ${chalk.bold('Executed before it:')}`);
      if (before.length === 0) {
        lines.push(chalk.dim('    nothing — this was the first statement'));
      } else {
        for (const s of before) {
          lines.push(`    ${chalk.dim(String(s.index).padStart(2))}  ${truncate(displaySql(s.sql), 60).padEnd(60)} ${chalk.green('ok')} ${chalk.dim(ms(s.durationMs))}`);
        }
      }
      lines.push('');

      const after = report.statements.filter(s => s.status === 'not-run');
      if (after.length > 0) {
        lines.push(`  ${chalk.bold('Never ran:')}`);
        for (const s of after) {
          lines.push(chalk.dim(`    ${String(s.index).padStart(2)}  ${truncate(displaySql(s.sql), 60)}`));
        }
        lines.push('');
      }
    }
  }

  const changes = formatSchemaChanges(report.diff);
  lines.push(`  ${chalk.bold('Schema changes')} ${chalk.dim(`(schema "${report.schema}")`)}`);
  if (changes.length === 0) {
    lines.push(chalk.dim('    none — the catalog is unchanged'));
  } else {
    lines.push(...changes.map(l => `  ${l}`));
  }
  lines.push('');

  if (report.transactionState === 'open') {
    lines.push(`  ${chalk.yellow('⚠')} Migration ended inside an open transaction (BEGIN with no COMMIT).`);
    lines.push(chalk.dim('      The changes above are what it would commit; as written, they are discarded.'));
    lines.push('');
  } else if (report.transactionState === 'aborted') {
    lines.push(`  ${chalk.yellow('⚠')} The failure happened inside a transaction — everything in it was rolled back.`);
    lines.push('');
  }

  const analysis = report.static?.analysis;
  if (analysis) {
    const criticals = analysis.violations.filter(v => v.severity === 'critical');
    const warnings = analysis.violations.filter(v => v.severity === 'warning');
    lines.push(`  ${chalk.bold('Static analysis')} ${chalk.dim(`(PostgreSQL ${report.static?.pgVersion}, risk ${analysis.overallRisk.level} ${analysis.overallRisk.score}/100)`)}`);

    if (analysis.violations.length === 0) {
      lines.push(chalk.green('    ✓ No violations'));
    } else {
      const ruleMap = options?.rules ? new Map(options.rules.map(r => [r.id, r])) : undefined;
      // Anchor each violation to a statement number as well as a line. The two
      // halves number lines differently — a statement's span begins where the
      // previous semicolon ended — so the statement number is what lets a
      // reader match a violation to a row in the table above.
      const statementOf = new Map<RuleViolation, number>();
      for (const [index, violations] of violationsByStatement(report)) {
        for (const violation of violations) statementOf.set(violation, index);
      }

      lines.push(chalk.dim(`    ${criticals.length} critical · ${warnings.length} warning${warnings.length !== 1 ? 's' : ''}`));
      lines.push('');
      for (const v of analysis.violations) {
        const vIcon = v.severity === 'critical' ? chalk.red('✗') : chalk.yellow('⚠');
        const tag = v.severity === 'critical'
          ? chalk.red.bold(`[${v.ruleId}] CRITICAL`)
          : chalk.yellow.bold(`[${v.ruleId}] WARNING`);
        const statement = statementOf.get(v);
        const where = [statement ? `statement ${statement}` : null, v.line ? `line ${v.line}` : null]
          .filter(Boolean)
          .join(', ');
        lines.push(`    ${vIcon} ${tag}${where ? chalk.dim(` (${where})`) : ''}`);
        lines.push(`      ${v.message}`);
        const rule = ruleMap?.get(v.ruleId);
        if (rule?.docsUrl) lines.push(`      ${chalk.cyan('Docs:')} ${chalk.blue(rule.docsUrl)}`);
      }
    }
    lines.push('');
  } else if (report.static?.error) {
    lines.push(`  ${chalk.bold('Static analysis')}`);
    lines.push(`    ${chalk.yellow('⚠')} unavailable — ${chalk.dim(report.static.error)}`);
    lines.push('');
  }

  if (options?.showLimits !== false) {
    lines.push(...formatLimits(report.limits));
  }

  return lines.join('\n');
}

function formatLimits(limits: string[]): string[] {
  const lines = [`  ${chalk.bold('What this run cannot tell you')}`];
  for (const limit of limits) lines.push(chalk.dim(`    · ${limit}`));
  lines.push('');
  return lines;
}

/**
 * Text report for a run spanning several migrations.
 *
 * The migrations shared one database, in order, so the per-file sections read
 * as a sequence rather than as independent results — and a file listed under
 * "never ran" did not pass, it simply never got its turn.
 */
export function formatSimulationRun(run: SimulationRun, options?: SimulationFormatOptions): string {
  if (run.reports.length === 1 && run.notRun.length === 0) {
    const only = run.reports[0];
    if (only) return formatSimulationReport(only, options);
  }

  const lines: string[] = [];
  for (const report of run.reports) {
    lines.push(formatSimulationReport(report, { ...options, showLimits: false }));
  }

  const executed = run.reports.reduce((sum, r) => sum + r.executed, 0);
  const duration = run.reports.reduce((sum, r) => sum + r.totalDurationMs, 0);

  lines.push(chalk.dim('  ═'.repeat(30)));
  const icon = run.failed ? chalk.red('✗') : chalk.green('✓');
  lines.push(`  ${icon} ${chalk.bold('Simulation summary')}`);
  lines.push('');
  lines.push(`  ${chalk.bold(String(run.reports.length))} migration${run.reports.length !== 1 ? 's' : ''} run · ${chalk.bold(String(executed))} statements executed · ${ms(duration)}`);
  lines.push(chalk.dim(`  One PostgreSQL ${run.engine.serverVersion} instance, applied in order, discarded at exit.`));
  lines.push('');

  for (const report of run.reports) {
    const failed = report.failedIndex !== null;
    const mark = failed ? chalk.red('✗') : chalk.green('✓');
    const detail = failed
      ? chalk.red(`failed at statement ${report.failedIndex}`)
      : chalk.dim(`${report.executed} statement${report.executed !== 1 ? 's' : ''}, ${ms(report.totalDurationMs)}`);
    lines.push(`  ${mark} ${displayPath(report.file)} ${detail}`);
  }
  for (const file of run.notRun) {
    lines.push(`  ${chalk.dim('·')} ${chalk.dim(`${displayPath(file)} never ran — an earlier migration failed`)}`);
  }
  lines.push('');

  const limits = [...new Set(run.reports.flatMap(r => r.limits))];
  if (options?.showLimits !== false && limits.length > 0) lines.push(...formatLimits(limits));

  return lines.join('\n');
}

/**
 * Machine-readable report.
 *
 * The static half is the existing `analyze --format json` document, embedded
 * unchanged under `static`, so anything that already parses MigrationPilot
 * reports keeps working on this one.
 */
export function formatSimulationJson(report: SimulationReport, rules?: Rule[]): string {
  return JSON.stringify(
    {
      $schema: SCHEMA_URL,
      version: SCHEMA_VERSION,
      ...buildJsonSimulation(report, rules),
    },
    null,
    2,
  );
}

/**
 * Machine-readable report for a multi-migration run.
 *
 * Mirrors `analyze` vs `check`: one file gets the flat document above, several
 * get this one with a `files` array, so a consumer can tell the two apart by
 * shape alone.
 */
export function formatSimulationRunJson(run: SimulationRun, rules?: Rule[]): string {
  return JSON.stringify(
    {
      $schema: SCHEMA_URL,
      version: SCHEMA_VERSION,
      engine: engineJson(run.engine),
      baseline: run.baselinePath,
      schema: run.schema,
      bootMs: round(run.bootMs),
      failed: run.failed,
      files: run.reports.map(r => buildJsonSimulation(r, rules)),
      notRun: run.notRun,
      limits: [...new Set(run.reports.flatMap(r => r.limits))],
    },
    null,
    2,
  );
}

const SCHEMA_URL = 'https://migrationpilot.dev/schemas/simulate-v1.json';
const SCHEMA_VERSION = 1;

function engineJson(engine: SimulationReport['engine']) {
  return {
    pglite: engine.pglite,
    serverVersion: engine.serverVersion,
    serverMajor: engine.serverMajor,
    versionString: engine.versionString,
  };
}

function buildJsonSimulation(report: SimulationReport, rules?: Rule[]) {
  const analysis = report.static?.analysis;

  return {
    file: report.file,
    engine: engineJson(report.engine),
    baseline: report.baselinePath,
    schema: report.schema,
    execution: {
      statementCount: report.statements.length,
      executed: report.executed,
      failedIndex: report.failedIndex,
      totalDurationMs: round(report.totalDurationMs),
      bootMs: round(report.bootMs),
      transactionState: report.transactionState,
      statements: report.statements.map(s => ({
        index: s.index,
        line: s.line,
        sql: s.sql,
        status: s.status,
        durationMs: round(s.durationMs),
        rowsAffected: s.rowsAffected,
        rowsReturned: s.rowsReturned,
        error: s.error,
      })),
    },
    schemaChanges: report.diff,
    static: analysis ? buildJsonReport(analysis, rules) : null,
    staticError: report.static?.error ?? null,
    staticPgVersion: report.static?.pgVersion ?? null,
    splitFallback: report.splitFallback,
    parseErrors: report.parseErrors,
    limits: report.limits,
  };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
