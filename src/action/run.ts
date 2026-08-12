/**
 * The GitHub Action's pipeline: read the inputs, work out which migrations this
 * pull request touches, analyze them, report, and set the verdict.
 *
 * `index.ts` is the entry point that calls this; keeping the two apart is what
 * lets the pipeline be driven by a test without importing a module that runs
 * itself on load.
 */

import * as core from '@actions/core';
import * as github from '@actions/github';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseMigration } from '../parser/parse.js';
import { extractTargets } from '../parser/extract.js';
import { classifyLock } from '../locks/classify.js';
import { allRules, runRules, violationsOfStatement } from '../rules/index.js';
import { calculateRisk, calculateOverallRisk } from '../scoring/score.js';
import { buildPRComment } from '../output/pr-comment.js';
import { buildCombinedSarifLog } from '../output/sarif.js';
import { fetchProductionContext } from '../production/context.js';
import { loadConfig } from '../config/load.js';
import { applySeverityOverrides } from '../rules/engine.js';
import { gradeReversibility } from '../generator/grade.js';
import { resolveCompanionDown } from '../generator/down-file.js';
import { resolveMigrationFiles } from './migration-files.js';
import { upsertReportComment } from './comment.js';
import type { ProductionContext } from '../production/context.js';
import type { PRAnalysisResult } from '../output/pr-comment.js';
import type { RiskLevel } from '../scoring/score.js';
import type { Rule } from '../rules/engine.js';

const COMMENT_MARKER = '<!-- migrationpilot-report -->';

export async function run(): Promise<void> {
  try {
    // 1. Read inputs
    const migrationPath = core.getInput('migration-path', { required: true });
    const token = core.getInput('github-token', { required: true });
    const databaseUrl = core.getInput('database-url') || '';
    if (databaseUrl) core.setSecret(databaseUrl);
    const excludeInput = core.getInput('exclude') || '';
    const configFileInput = core.getInput('config-file') || '';

    // Load config file (if it exists)
    const { config, warnings: configWarnings } = await loadConfig(configFileInput || undefined);
    for (const w of configWarnings) core.warning(w);
    const pgVersion = parseInt(core.getInput('pg-version') || String(config.pgVersion ?? 17), 10);
    const failOn = core.getInput('fail-on') || config.failOn || 'critical';

    let rules: Rule[] = allRules;

    // Apply exclude filter from input and config
    const excludeRules = new Set(
      excludeInput ? excludeInput.split(',').map(r => r.trim()) : []
    );
    if (excludeRules.size > 0) {
      rules = rules.filter(r => !excludeRules.has(r.id));
      core.info(`Excluded rules: ${[...excludeRules].join(', ')}`);
    }

    const octokit = github.getOctokit(token);
    const { context } = github;
    const repo = context.repo;

    // 2. Ensure we're running on a PR
    const prNumber = context.payload.pull_request?.number;
    if (!prNumber) {
      core.warning('MigrationPilot: Not running on a pull request. Skipping analysis.');
      core.setOutput('risk-level', 'GREEN');
      core.setOutput('violations', '0');
      return;
    }

    // 3. Work out which migration files to analyze — the PR's changed files when
    //    the token can read them, the whole checked-out tree when it cannot.
    const fileSet = await resolveMigrationFiles({
      pulls: octokit.rest.pulls,
      repo,
      prNumber,
      pattern: migrationPath,
    });
    if (fileSet.warning) core.warning(fileSet.warning);
    const migrationFiles = fileSet.files;

    if (migrationFiles.length === 0) {
      core.info(
        fileSet.source === 'pr'
          ? 'No migration files changed in this PR. Skipping analysis.'
          : `No files matching "${migrationPath}" in the checked-out tree. Skipping analysis.`,
      );
      core.setOutput('risk-level', 'GREEN');
      core.setOutput('violations', '0');
      return;
    }

    core.info(`Found ${migrationFiles.length} migration file(s) to analyze`);

    // 4. Analyze each migration file
    const results: PRAnalysisResult[] = [];
    const ungatedIrreversible: string[] = [];
    let worstLevel: RiskLevel = 'GREEN';
    let totalViolations = 0;

    for (const file of migrationFiles) {
      const filePath = resolve(file);
      core.info(`Analyzing: ${file}`);

      let sql: string;
      try {
        sql = await readFile(filePath, 'utf-8');
      } catch {
        core.warning(`Cannot read file: ${filePath}. Skipping.`);
        continue;
      }

      if (sql.trim().length === 0) {
        core.info(`Empty file: ${file}. Skipping.`);
        continue;
      }

      const analysis = await analyzeFile(sql, file, pgVersion, databaseUrl, rules, config);
      results.push(analysis);

      // Only pay for the reversibility gate when it is switched on.
      if (failOn === 'irreversible' && await isUngatedIrreversible(filePath, sql)) {
        ungatedIrreversible.push(file);
      }

      totalViolations += analysis.violations.length;
      if (riskOrdinal(analysis.overallRisk.level) > riskOrdinal(worstLevel)) {
        worstLevel = analysis.overallRisk.level;
      }
    }

    // 4b. Emit inline annotations for each violation (appears in PR diff "Files changed" tab)
    for (const result of results) {
      for (const v of result.violations) {
        const annotation = {
          file: result.file,
          startLine: v.line,
        };
        if (v.severity === 'critical') {
          core.error(`[${v.ruleId}] ${v.message}`, annotation);
        } else {
          core.warning(`[${v.ruleId}] ${v.message}`, annotation);
        }
      }
    }

    // 5. Build and post the PR comment. A token that may not comment costs the
    //    comment, not the run — steps 6 through 8 are the verdict.
    const outcome = await upsertReportComment({
      issues: octokit.rest.issues,
      repo,
      prNumber,
      body: buildCombinedComment(results),
      marker: COMMENT_MARKER,
    });
    if (!outcome.posted) {
      core.warning(outcome.warning);
    } else if (outcome.action === 'updated') {
      core.info(`Updated existing comment #${outcome.id}`);
    } else {
      core.info('Created new PR comment');
    }

    // 6. Write SARIF output file for GitHub Code Scanning
    const sarifLog = buildCombinedSarifLog(
      results.map(r => ({ file: r.file, violations: r.violations })),
      rules,
    );
    const sarifPath = resolve('migrationpilot-results.sarif');
    await writeFile(sarifPath, JSON.stringify(sarifLog, null, 2));
    core.info(`SARIF report written to ${sarifPath}`);

    // 6b. Write GitHub Actions Job Summary
    await writeJobSummary(results, worstLevel, totalViolations);

    // 7. Set outputs
    core.setOutput('risk-level', worstLevel);
    core.setOutput('violations', String(totalViolations));
    core.setOutput('sarif-file', sarifPath);

    // 8. Fail CI based on threshold
    const hasCritical = results.some(r => r.violations.some(v => v.severity === 'critical'));
    const hasWarning = results.some(r => r.violations.some(v => v.severity === 'warning'));

    if (ungatedIrreversible.length > 0) {
      core.setFailed(
        `MigrationPilot: ${ungatedIrreversible.length} migration(s) destroy data with no down migration — ${ungatedIrreversible.join(', ')}`,
      );
    } else if ((failOn === 'critical' || failOn === 'irreversible') && hasCritical) {
      core.setFailed(`MigrationPilot found critical violations in ${totalViolations} issue(s)`);
    } else if (failOn === 'warning' && (hasCritical || hasWarning)) {
      core.setFailed(`MigrationPilot found violations in ${totalViolations} issue(s)`);
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(`MigrationPilot error: ${error.message}`);
    } else {
      core.setFailed('MigrationPilot encountered an unexpected error');
    }
  }
}

/**
 * Does this migration destroy data with no way back?
 *
 * The gate behind `fail-on: irreversible` — a RED grade is only a failure when
 * nobody wrote the down migration to go with it.
 */
async function isUngatedIrreversible(filePath: string, sql: string): Promise<boolean> {
  const { statements, errors } = await parseMigration(sql);
  if (errors.length > 0) return false;
  if (gradeReversibility(statements).grade !== 'RED') return false;
  return !(await resolveCompanionDown(filePath, sql)).present;
}

/**
 * Run the full analysis pipeline on a single migration file.
 */
async function analyzeFile(sql: string, file: string, pgVersion: number, databaseUrl: string, activeRules: Rule[], config: import('../config/load.js').MigrationPilotConfig): Promise<PRAnalysisResult> {
  const parsed = await parseMigration(sql);

  if (parsed.errors.length > 0) {
    core.warning(`Parse errors in ${file}: ${parsed.errors.map(e => e.message).join(', ')}`);
  }

  const statementsWithLocks = parsed.statements.map(s => ({
    ...s,
    lock: classifyLock(s.stmt, pgVersion),
  }));

  // Fetch production context if database URL is provided
  let prodCtx: ProductionContext | undefined;
  if (databaseUrl) {
    try {
      const tableNames = [...new Set(
        parsed.statements.flatMap(s => extractTargets(s.stmt).map(t => t.tableName))
      )];
      if (tableNames.length > 0) {
        prodCtx = await fetchProductionContext({ connectionString: databaseUrl }, tableNames);
        core.info(`Production context: fetched stats for ${prodCtx.tableStats.size} table(s)`);
      }
    } catch {
      core.warning('Could not fetch production context. Check your database-url input.');
    }
  }

  let violations = runRules(activeRules, statementsWithLocks, pgVersion, prodCtx, sql);

  // Apply severity overrides from config if present
  if (config.rules && Object.keys(config.rules).length > 0) {
    violations = applySeverityOverrides(violations, config.rules);
  }

  // Build statement results with production context for risk scoring
  const statements = statementsWithLocks.map((s, i) => {
    const targets = extractTargets(s.stmt);
    const tableName = targets[0]?.tableName;
    const tableStats = tableName ? prodCtx?.tableStats.get(tableName) : undefined;
    const affectedQueries = tableName ? prodCtx?.affectedQueries.get(tableName) : undefined;
    return {
      sql: s.originalSql,
      line: s.line,
      lock: s.lock,
      risk: calculateRisk(s.lock, tableStats, affectedQueries),
      violations: violationsOfStatement(violations, i, s.line),
    };
  });

  // Collect all affected queries for PR comment display
  const allAffectedQueries = prodCtx
    ? [...prodCtx.affectedQueries.values()].flat()
    : undefined;

  const overallRisk = calculateOverallRisk(statements.map(s => s.risk), violations);

  return { file, statements, overallRisk, violations, affectedQueries: allAffectedQueries };
}

/**
 * Build a combined PR comment for multiple migration files.
 */
function buildCombinedComment(results: PRAnalysisResult[]): string {
  if (results.length === 0) {
    return `${COMMENT_MARKER}\n## 🟢 MigrationPilot — No Migrations Detected\n\nNo migration files were found in this PR.\n`;
  }

  if (results.length === 1 && results[0]) {
    return `${COMMENT_MARKER}\n${buildPRComment(results[0])}`;
  }

  // Multiple files: build a summary + individual reports
  const lines: string[] = [COMMENT_MARKER];

  // Overall summary
  const worstLevel = results.reduce(
    (worst, r) => riskOrdinal(r.overallRisk.level) > riskOrdinal(worst) ? r.overallRisk.level : worst,
    'GREEN' as RiskLevel
  );
  const totalViolations = results.reduce((sum, r) => sum + r.violations.length, 0);
  const emoji = worstLevel === 'RED' ? '🔴' : worstLevel === 'YELLOW' ? '🟡' : '🟢';

  lines.push(`## ${emoji} MigrationPilot — Migration Safety Report`);
  lines.push('');
  lines.push(`**${results.length} migration files** analyzed · **${totalViolations} violation(s)** found · Overall risk: **${worstLevel}**`);
  lines.push('');

  // Individual file reports
  for (const result of results) {
    const fileEmoji = result.overallRisk.level === 'RED' ? '🔴'
      : result.overallRisk.level === 'YELLOW' ? '🟡' : '🟢';

    lines.push(`<details>`);
    lines.push(`<summary>${fileEmoji} <code>${result.file}</code> — ${result.overallRisk.level} (${result.violations.length} violation${result.violations.length !== 1 ? 's' : ''})</summary>`);
    lines.push('');
    lines.push(buildPRComment(result));
    lines.push('</details>');
    lines.push('');
  }

  // Footer
  lines.push('---');
  lines.push('<sub>Generated by <a href="https://migrationpilot.dev">MigrationPilot</a></sub>');

  return lines.join('\n');
}

/**
 * Write a rich markdown summary to the GitHub Actions Job Summary tab.
 */
async function writeJobSummary(results: PRAnalysisResult[], worstLevel: RiskLevel, totalViolations: number): Promise<void> {
  const emoji = worstLevel === 'RED' ? '🔴' : worstLevel === 'YELLOW' ? '🟡' : '🟢';
  const lines: string[] = [];

  lines.push(`## ${emoji} MigrationPilot — Migration Safety Report`);
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Files analyzed | ${results.length} |`);
  lines.push(`| Total violations | ${totalViolations} |`);
  lines.push(`| Overall risk | **${worstLevel}** |`);
  lines.push('');

  if (totalViolations > 0) {
    lines.push('### Violations');
    lines.push('');
    lines.push('| File | Rule | Severity | Message |');
    lines.push('|------|------|----------|---------|');
    for (const result of results) {
      for (const v of result.violations) {
        const sev = v.severity === 'critical' ? '🔴 critical' : '🟡 warning';
        lines.push(`| \`${result.file}\` | ${v.ruleId} | ${sev} | ${v.message.replace(/\|/g, '\\|')} |`);
      }
    }
    lines.push('');
  } else {
    lines.push('No violations found. All migrations are safe to apply.');
    lines.push('');
  }

  lines.push('---');
  lines.push('*Generated by [MigrationPilot](https://migrationpilot.dev)*');

  await core.summary.addRaw(lines.join('\n')).write();
}

function riskOrdinal(level: RiskLevel): number {
  return level === 'RED' ? 2 : level === 'YELLOW' ? 1 : 0;
}
