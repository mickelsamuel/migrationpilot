/**
 * GitHub Action entry point for MigrationPilot.
 * Analyzes migration files changed in a PR and posts safety reports as PR comments.
 *
 * Bundled with esbuild into dist/action/index.js
 */

import * as core from '@actions/core';
import * as github from '@actions/github';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseMigration } from '../parser/parse.js';
import { extractTargets } from '../parser/extract.js';
import { classifyLock } from '../locks/classify.js';
import { allRules, PRO_RULE_IDS, runRules } from '../rules/index.js';
import { calculateRisk } from '../scoring/score.js';
import { buildPRComment } from '../output/pr-comment.js';
import { buildCombinedSarifLog } from '../output/sarif.js';
import { fetchProductionContext } from '../production/context.js';
import { validateLicense, isProOrAbove } from '../license/validate.js';
import type { ProductionContext } from '../production/context.js';
import type { PRAnalysisResult } from '../output/pr-comment.js';
import type { RiskLevel } from '../scoring/score.js';
import type { Rule } from '../rules/engine.js';

const COMMENT_MARKER = '<!-- migrationpilot-report -->';

async function run(): Promise<void> {
  try {
    // 1. Read inputs
    const migrationPath = core.getInput('migration-path', { required: true });
    const token = core.getInput('github-token', { required: true });
    const pgVersion = parseInt(core.getInput('pg-version') || '17', 10);
    const failOn = core.getInput('fail-on') || 'critical';
    const databaseUrl = core.getInput('database-url') || '';
    const licenseKey = core.getInput('license-key') || '';

    // Validate license
    const license = validateLicense(licenseKey || undefined);
    const isPro = isProOrAbove(license);
    const rules: Rule[] = isPro ? allRules : allRules.filter(r => !PRO_RULE_IDS.has(r.id));

    if (databaseUrl && !isPro) {
      core.warning('database-url input requires a Pro license key. Skipping production context. Get a key at https://migrationpilot.dev/pricing');
    }

    if (isPro) {
      core.info(`License: ${license.tier} tier (expires ${license.expiresAt?.toISOString().slice(0, 10)})`);
    }

    const octokit = github.getOctokit(token);
    const { context } = github;

    // 2. Ensure we're running on a PR
    const prNumber = context.payload.pull_request?.number;
    if (!prNumber) {
      core.warning('MigrationPilot: Not running on a pull request. Skipping analysis.');
      core.setOutput('risk-level', 'GREEN');
      core.setOutput('violations', '0');
      return;
    }

    // 3. Get changed files from the PR
    const changedFiles = await getChangedFiles(octokit, context, prNumber);

    // 4. Filter to migration files matching the path pattern
    const migrationFiles = filterMigrationFiles(changedFiles, migrationPath);

    if (migrationFiles.length === 0) {
      core.info('No migration files changed in this PR. Skipping analysis.');
      core.setOutput('risk-level', 'GREEN');
      core.setOutput('violations', '0');
      return;
    }

    core.info(`Found ${migrationFiles.length} migration file(s) to analyze`);

    // 5. Analyze each migration file
    const results: PRAnalysisResult[] = [];
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

      const analysis = await analyzeFile(sql, file, pgVersion, isPro ? databaseUrl : '', rules);
      results.push(analysis);

      totalViolations += analysis.violations.length;
      if (riskOrdinal(analysis.overallRisk.level) > riskOrdinal(worstLevel)) {
        worstLevel = analysis.overallRisk.level;
      }
    }

    // 6. Build combined PR comment
    const comment = buildCombinedComment(results);

    // 7. Post or update PR comment
    await upsertComment(octokit, context, prNumber, comment);
    core.info('PR comment posted successfully');

    // 8. Write SARIF output file for GitHub Code Scanning
    const sarifLog = buildCombinedSarifLog(
      results.map(r => ({ file: r.file, violations: r.violations })),
      rules,
    );
    const sarifPath = resolve('migrationpilot-results.sarif');
    await writeFile(sarifPath, JSON.stringify(sarifLog, null, 2));
    core.info(`SARIF report written to ${sarifPath}`);

    // 9. Set outputs
    core.setOutput('risk-level', worstLevel);
    core.setOutput('violations', String(totalViolations));
    core.setOutput('sarif-file', sarifPath);

    // 10. Fail CI based on threshold
    const hasCritical = results.some(r => r.violations.some(v => v.severity === 'critical'));
    const hasWarning = results.some(r => r.violations.some(v => v.severity === 'warning'));

    if (failOn === 'critical' && hasCritical) {
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
 * Get all changed files from a PR using pagination.
 */
async function getChangedFiles(
  octokit: ReturnType<typeof github.getOctokit>,
  context: typeof github.context,
  prNumber: number
): Promise<string[]> {
  const files: string[] = [];
  let page = 1;

  while (true) {
    const response = await octokit.rest.pulls.listFiles({
      owner: context.repo.owner,
      repo: context.repo.repo,
      pull_number: prNumber,
      per_page: 100,
      page,
    });

    for (const file of response.data) {
      // Only include added or modified files (not deleted)
      if (file.status !== 'removed') {
        files.push(file.filename);
      }
    }

    if (response.data.length < 100) break;
    page++;
  }

  return files;
}

// Filter files to only those matching the migration path pattern.
// Supports simple glob patterns like migrations/*.sql
function filterMigrationFiles(files: string[], pattern: string): string[] {
  // Convert simple glob pattern to regex
  const regexStr = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/{{GLOBSTAR}}/g, '.*');

  const regex = new RegExp(`^${regexStr}$`);

  return files.filter(f => regex.test(f));
}

/**
 * Run the full analysis pipeline on a single migration file.
 */
async function analyzeFile(sql: string, file: string, pgVersion: number, databaseUrl: string, activeRules: Rule[]): Promise<PRAnalysisResult> {
  const parsed = await parseMigration(sql);

  if (parsed.errors.length > 0) {
    core.warning(`Parse errors in ${file}: ${parsed.errors.map(e => e.message).join(', ')}`);
  }

  const statementsWithLocks = parsed.statements.map(s => {
    const lock = classifyLock(s.stmt, pgVersion);
    const line = sql.slice(0, s.stmtLocation).split('\n').length;
    return { ...s, lock, line };
  });

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
    } catch (err) {
      core.warning(`Could not fetch production context: ${err instanceof Error ? err.message : err}`);
    }
  }

  const violations = runRules(activeRules, statementsWithLocks, pgVersion, prodCtx, sql);

  // Build statement results with production context for risk scoring
  const statements = statementsWithLocks.map(s => {
    const targets = extractTargets(s.stmt);
    const tableName = targets[0]?.tableName;
    const tableStats = tableName ? prodCtx?.tableStats.get(tableName) : undefined;
    const affectedQueries = tableName ? prodCtx?.affectedQueries.get(tableName) : undefined;
    return {
      sql: s.originalSql,
      lock: s.lock,
      risk: calculateRisk(s.lock, tableStats, affectedQueries),
    };
  });

  // Collect all affected queries for PR comment display
  const allAffectedQueries = prodCtx
    ? [...prodCtx.affectedQueries.values()].flat()
    : undefined;

  // Overall risk = worst individual statement risk
  const firstStmt = statements[0];
  const overallRisk = firstStmt
    ? statements.reduce((worst, s) =>
        s.risk.score > worst.score ? s.risk : worst,
        firstStmt.risk
      )
    : calculateRisk({ lockType: 'ACCESS SHARE', blocksReads: false, blocksWrites: false, longHeld: false });

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
 * Create or update the MigrationPilot comment on the PR.
 * Uses a hidden marker to find existing comments.
 */
async function upsertComment(
  octokit: ReturnType<typeof github.getOctokit>,
  context: typeof github.context,
  prNumber: number,
  body: string
): Promise<void> {
  // Find existing MigrationPilot comment
  const { data: comments } = await octokit.rest.issues.listComments({
    owner: context.repo.owner,
    repo: context.repo.repo,
    issue_number: prNumber,
    per_page: 100,
  });

  const existingComment = comments.find(c => c.body?.includes(COMMENT_MARKER));

  if (existingComment) {
    await octokit.rest.issues.updateComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      comment_id: existingComment.id,
      body,
    });
    core.info(`Updated existing comment #${existingComment.id}`);
  } else {
    await octokit.rest.issues.createComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: prNumber,
      body,
    });
    core.info('Created new PR comment');
  }
}

function riskOrdinal(level: RiskLevel): number {
  return level === 'RED' ? 2 : level === 'YELLOW' ? 1 : 0;
}

// Run the action
run();
