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
import { isIgnoredPath, loadConfigFrom, resolveRuleConfig } from '../config/load.js';
import { applySeverityOverrides } from '../rules/engine.js';
import { gradeReversibility } from '../generator/grade.js';
import { resolveCompanionDown } from '../generator/down-file.js';
import { migrationGlob, resolveMigrationFiles } from './migration-files.js';
import { upsertReportComment } from './comment.js';
import { configureAudit, auditLog } from '../audit/log.js';
import {
  blockedMessage,
  blockedStatements,
  excludeRules,
  keptByPolicyNote,
  overriddenDisableNotes,
  resolveOrgPolicy,
  reviewMessage,
  reviewStatements,
} from '../policy/org.js';
import type { OrgPolicy } from '../policy/org.js';
import type { PolicyFindings } from '../output/cli.js';
import type { ProductionContext } from '../production/context.js';
import type { ParsedStatement } from '../parser/parse.js';
import type { PRAnalysisResult } from '../output/pr-comment.js';
import type { RiskLevel } from '../scoring/score.js';
import type { Rule } from '../rules/engine.js';

const COMMENT_MARKER = '<!-- migrationpilot-report -->';
const LICENSE_KEY_HINT = 'the license-key input, or MIGRATIONPILOT_LICENSE_KEY in the environment';

/** A migration in scope that the run could not analyze, and why. */
interface UncheckedFile {
  file: string;
  kind: 'parse' | 'missing' | 'unreadable';
  reason: string;
}

/** One file's analysis, with what the Org policy found in it when the policy is on. */
type FileResult = PRAnalysisResult & { policy?: PolicyFindings };

export async function run(): Promise<void> {
  try {
    // 1. Read inputs
    const migrationPath = core.getInput('migration-path', { required: true });
    const token = core.getInput('github-token', { required: true });
    const databaseUrl = core.getInput('database-url') || '';
    if (databaseUrl) core.setSecret(databaseUrl);
    const excludeInput = core.getInput('exclude') || '';
    const configFileInput = core.getInput('config-file') || '';
    const licenseKey = core.getInput('license-key') || process.env.MIGRATIONPILOT_LICENSE_KEY || '';
    if (licenseKey) core.setSecret(licenseKey);

    // Load config: the file the input names, or the nearest one to the workspace.
    // A named file that isn't there is an error, not a quiet fall back to defaults.
    const { config: fileConfig, warnings: configWarnings } = await loadConfigFrom(configFileInput || undefined);
    for (const w of configWarnings) core.warning(w);

    // The policy block and the audit log apply only with an Org key. Without
    // one the run says so, rather than quietly doing less than the config asks.
    const org = resolveOrgPolicy(fileConfig, licenseKey || undefined, LICENSE_KEY_HINT);
    for (const w of org.warnings) core.warning(w);
    for (const n of org.notes) core.info(n);
    configureAudit(org.auditLog);
    const config = org.config;

    const pgVersion = parseInt(core.getInput('pg-version') || String(config.pgVersion ?? 17), 10);
    const failOn = core.getInput('fail-on') || config.failOn || 'critical';

    // Rules the config turns off (`MP037: false`, or a preset like startup) don't run.
    const enabled: Rule[] = allRules.filter(r => resolveRuleConfig(r.id, r.severity, config).enabled);
    if (enabled.length < allRules.length) {
      core.info(`Disabled by config: ${allRules.filter(r => !enabled.includes(r)).map(r => r.id).join(', ')}`);
    }

    // Apply the exclude input on top, except to the rules the policy requires
    const excludeIds = excludeInput ? excludeInput.split(',').map(r => r.trim()).filter(Boolean) : [];
    const { rules, kept } = excludeRules(enabled, excludeIds, org);
    if (excludeIds.length > 0) {
      core.info(`Excluded rules: ${excludeIds.filter(id => !kept.includes(id)).join(', ') || 'none'}`);
    }
    const keptNote = keptByPolicyNote(kept, 'the exclude input');
    if (keptNote) core.info(keptNote);

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
    const pattern = migrationGlob(migrationPath);
    if (!migrationPath.includes('*') && pattern.endsWith('**/*.sql')) {
      core.info(`migration-path "${migrationPath}" is a directory: analyzing ${pattern}`);
    }
    const fileSet = await resolveMigrationFiles({
      pulls: octokit.rest.pulls,
      repo,
      prNumber,
      pattern,
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

    // 4. Analyze each migration file. One the run can't read or parse goes on
    //    the unchecked list instead of being skipped: step 8 fails on it, since
    //    a pass has to mean every migration in scope was analyzed.
    const results: FileResult[] = [];
    const unchecked: UncheckedFile[] = [];
    const ignored: string[] = [];
    const ungatedIrreversible: string[] = [];
    let worstLevel: RiskLevel = 'GREEN';
    let totalViolations = 0;

    for (const file of migrationFiles) {
      if (isIgnoredPath(file, config.ignore ?? [])) {
        core.info(`Ignored by config: ${file}`);
        ignored.push(file);
        continue;
      }

      const filePath = resolve(file);
      core.info(`Analyzing: ${file}`);

      let sql: string;
      try {
        sql = await readFile(filePath, 'utf-8');
      } catch (error) {
        unchecked.push(readFailure(file, error));
        continue;
      }

      if (sql.trim().length === 0) {
        core.info(`Empty file: ${file}. Skipping.`);
        continue;
      }

      const parsed = await parseMigration(sql);
      if (parsed.errors.length > 0) {
        unchecked.push({
          file,
          kind: 'parse',
          reason: `parse error: ${parsed.errors.map(e => e.message).join('; ')}`,
        });
        continue;
      }

      const analysis = await analyzeFile(sql, parsed.statements, file, pgVersion, databaseUrl, rules, org);
      results.push(analysis);

      // Only pay for the reversibility gate when it is switched on.
      const irreversible = failOn === 'irreversible' && await isUngatedIrreversible(filePath, sql);
      if (irreversible) ungatedIrreversible.push(file);

      auditLog({
        event: 'analysis_complete',
        command: 'action',
        file,
        riskLevel: analysis.overallRisk.level,
        riskScore: analysis.overallRisk.score,
        violationCount: analysis.violations.length,
        metadata: {
          pullRequest: prNumber,
          criticalCount: analysis.violations.filter(v => v.severity === 'critical').length,
          policyBlocked: analysis.policy?.blocked.length ?? 0,
          ungatedIrreversible: irreversible,
        },
      }).catch(() => {});

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
    for (const u of unchecked) {
      core.error(`MigrationPilot could not check this file (${u.reason}).`, { file: u.file });
    }
    for (const result of results) {
      const p = result.policy;
      if (!p) continue;
      for (const m of p.blocked) {
        core.error(blockedMessage(m), { file: result.file, startLine: m.line });
      }
      for (const m of p.review) {
        core.warning(reviewMessage(m), { file: result.file, startLine: m.line });
      }
      for (const n of p.notes) core.info(`${result.file}: ${n}`);
    }
    const blocked = results.flatMap(r => (r.policy?.blocked ?? []).map(m => ({ file: r.file, ...m })));

    // 5. Build and post the PR comment. A token that may not comment costs the
    //    comment, not the run — steps 6 through 8 are the verdict.
    const outcome = await upsertReportComment({
      issues: octokit.rest.issues,
      repo,
      prNumber,
      body: buildCombinedComment(results, unchecked, ignored),
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
    await writeJobSummary(results, worstLevel, totalViolations, unchecked, ignored);

    auditLog({
      event: 'action_complete',
      command: 'action',
      violationCount: totalViolations,
      metadata: {
        pullRequest: prNumber,
        fileCount: results.length,
        notChecked: unchecked.length,
        policyBlocked: blocked.length,
        riskLevel: worstLevel,
      },
    }).catch(() => {});

    // 7. Set outputs
    core.setOutput('risk-level', worstLevel);
    core.setOutput('violations', String(totalViolations));
    core.setOutput('sarif-file', sarifPath);

    // 8. Fail CI based on threshold. A migration that couldn't be checked fails
    //    every threshold but "never", on top of whatever the others found.
    if (unchecked.length > 0 && failOn !== 'never') {
      core.setFailed(uncheckedFailure(unchecked));
    }

    // The organization policy is not a threshold: a blocked statement fails
    // the run whatever fail-on says, "never" included.
    if (blocked.length > 0) {
      core.setFailed([
        `MigrationPilot: the organization policy blocks ${blocked.length} statement(s):`,
        ...blocked.map(b => `  ${b.file}:${b.line}: ${b.pattern}`),
      ].join('\n'));
    }

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

function readFailure(file: string, error: unknown): UncheckedFile {
  if ((error as NodeJS.ErrnoException | null)?.code === 'ENOENT') {
    return { file, kind: 'missing', reason: 'not found in the workspace' };
  }
  const detail = error instanceof Error ? error.message : String(error);
  return { file, kind: 'unreadable', reason: `could not be read: ${detail}` };
}

/** The failure message for migrations the run could not check, with the fix for each cause. */
function uncheckedFailure(unchecked: UncheckedFile[]): string {
  const lines = [
    `MigrationPilot could not check ${unchecked.length === 1 ? '1 migration' : `${unchecked.length} migrations`}, so it can't pass ${unchecked.length === 1 ? 'it' : 'them'}:`,
    ...unchecked.map(u => `  ${u.file}: ${u.reason}`),
  ];
  if (unchecked.some(u => u.kind === 'missing')) {
    lines.push(
      "The Action reads each file the pull request changed from the workspace, so check out the pull request's commit at the workspace root (actions/checkout with no `path:`).",
    );
  }
  if (unchecked.some(u => u.kind === 'parse')) {
    lines.push(
      "A file that isn't plain SQL (psql meta-commands, template placeholders) can't be checked. List it under `ignore` in .migrationpilotrc.yml to skip it on purpose.",
    );
  }
  return lines.join('\n');
}

/**
 * Run the full analysis pipeline on a single migration file.
 */
async function analyzeFile(sql: string, parsedStatements: ParsedStatement[], file: string, pgVersion: number, databaseUrl: string, activeRules: Rule[], org: OrgPolicy): Promise<FileResult> {
  const config = org.config;
  const statementsWithLocks = parsedStatements.map(s => ({
    ...s,
    lock: classifyLock(s.stmt, pgVersion),
  }));

  // Fetch production context if database URL is provided
  let prodCtx: ProductionContext | undefined;
  if (databaseUrl) {
    try {
      const tableNames = [...new Set(
        parsedStatements.flatMap(s => extractTargets(s.stmt).map(t => t.tableName))
      )];
      if (tableNames.length > 0) {
        prodCtx = await fetchProductionContext({ connectionString: databaseUrl }, tableNames);
        core.info(`Production context: fetched stats for ${prodCtx.tableStats.size} table(s)`);
      }
    } catch {
      core.warning('Could not fetch production context. Check your database-url input.');
    }
  }

  let violations = runRules(activeRules, statementsWithLocks, pgVersion, prodCtx, sql, { requiredRules: org.requiredRules });

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

  // What the policy block finds, when an Org key turned it on
  let policy: PolicyFindings | undefined;
  if (org.entitled && config.policy) {
    const located = statements.map(s => ({ sql: s.sql, line: s.line }));
    policy = {
      blocked: blockedStatements(located, org),
      review: reviewStatements(located, org),
      notes: overriddenDisableNotes(sql, violations, statements.map(s => s.line), org),
    };
  }

  return { file, statements, overallRisk, violations, affectedQueries: allAffectedQueries, ...(policy && { policy }) };
}

/**
 * Build a combined PR comment for multiple migration files. Files that could
 * not be checked lead the comment, so it never reads as a clean pass.
 */
function buildCombinedComment(results: FileResult[], unchecked: UncheckedFile[], ignored: string[]): string {
  const notices = policyNotice(results) + uncheckedNotice(unchecked) + ignoredNotice(ignored);

  if (results.length === 0) {
    if (unchecked.length > 0) {
      return `${COMMENT_MARKER}\n## ⚠️ MigrationPilot — Migrations Not Checked\n\n${notices}`;
    }
    if (ignored.length > 0) {
      return `${COMMENT_MARKER}\n## 🟢 MigrationPilot — No Migrations to Check\n\n${notices}`;
    }
    return `${COMMENT_MARKER}\n## 🟢 MigrationPilot — No Migrations Detected\n\nNo migration files were found in this PR.\n`;
  }

  if (results.length === 1 && results[0]) {
    return `${COMMENT_MARKER}\n${notices}${buildPRComment(results[0])}`;
  }

  // Multiple files: build a summary + individual reports
  const lines: string[] = [COMMENT_MARKER];
  if (notices) lines.push(notices);

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

/** A GitHub alert naming each migration the run could not check, and why. */
function uncheckedNotice(unchecked: UncheckedFile[]): string {
  if (unchecked.length === 0) return '';
  const one = unchecked.length === 1;
  return [
    '> [!WARNING]',
    `> **${one ? '1 migration was' : `${unchecked.length} migrations were`} not checked**, so nothing in this report covers ${one ? 'it' : 'them'}.`,
    '>',
    ...unchecked.map(u => `> - <code>${u.file}</code>: ${markdownText(u.reason)}`),
  ].join('\n') + '\n\n';
}

/**
 * GitHub alerts for what the organization policy found: statements it blocks,
 * which fail the run, and statements it sends for team review.
 */
function policyNotice(results: FileResult[]): string {
  const blocked = results.flatMap(r => (r.policy?.blocked ?? []).map(m => ({ file: r.file, ...m })));
  const review = results.flatMap(r => (r.policy?.review ?? []).map(m => ({ file: r.file, ...m })));
  let out = '';
  if (blocked.length > 0) {
    out += [
      '> [!CAUTION]',
      `> **The organization policy blocks ${blocked.length === 1 ? '1 statement' : `${blocked.length} statements`}**, so this check fails whatever \`fail-on\` says.`,
      '>',
      ...blocked.map(b => `> - <code>${b.file}</code> line ${b.line}: ${markdownText(b.pattern)}`),
    ].join('\n') + '\n\n';
  }
  if (review.length > 0) {
    out += [
      '> [!NOTE]',
      `> **The organization policy asks for team review** of ${review.length === 1 ? '1 statement' : `${review.length} statements`}.`,
      '>',
      ...review.map(r => `> - <code>${r.file}</code> line ${r.line}: ${markdownText(r.pattern)}`),
    ].join('\n') + '\n\n';
  }
  return out;
}

function ignoredNotice(ignored: string[]): string {
  if (ignored.length === 0) return '';
  return `Ignored by your MigrationPilot config: ${ignored.map(f => `<code>${f}</code>`).join(', ')}\n\n`;
}

/** Text from the parser or the file system, made safe to drop into markdown. */
function markdownText(text: string): string {
  return text.replace(/\s+/g, ' ').replace(/[\\`*_[\]<>|]/g, '\\$&');
}

/**
 * Write a rich markdown summary to the GitHub Actions Job Summary tab.
 */
async function writeJobSummary(
  results: FileResult[],
  worstLevel: RiskLevel,
  totalViolations: number,
  unchecked: UncheckedFile[],
  ignored: string[],
): Promise<void> {
  const blocked = results.flatMap(r => (r.policy?.blocked ?? []).map(m => ({ file: r.file, ...m })));
  const review = results.flatMap(r => (r.policy?.review ?? []).map(m => ({ file: r.file, ...m })));
  const emoji = worstLevel === 'RED' || blocked.length > 0 ? '🔴'
    : unchecked.length > 0 ? '⚠️'
      : worstLevel === 'YELLOW' ? '🟡' : '🟢';
  const lines: string[] = [];

  lines.push(`## ${emoji} MigrationPilot — Migration Safety Report`);
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Files analyzed | ${results.length} |`);
  if (unchecked.length > 0) lines.push(`| Not checked | ${unchecked.length} |`);
  if (ignored.length > 0) lines.push(`| Ignored by config | ${ignored.length} |`);
  if (blocked.length > 0) lines.push(`| Blocked by policy | ${blocked.length} |`);
  if (review.length > 0) lines.push(`| Needs team review | ${review.length} |`);
  lines.push(`| Total violations | ${totalViolations} |`);
  lines.push(`| Overall risk | **${worstLevel}** |`);
  lines.push('');

  if (blocked.length > 0 || review.length > 0) {
    lines.push('### Organization policy');
    lines.push('');
    lines.push('| File | Line | Pattern | Outcome |');
    lines.push('|------|------|---------|---------|');
    for (const b of blocked) {
      lines.push(`| \`${b.file}\` | ${b.line} | ${markdownText(b.pattern)} | 🔴 blocked |`);
    }
    for (const r of review) {
      lines.push(`| \`${r.file}\` | ${r.line} | ${markdownText(r.pattern)} | 🟡 team review |`);
    }
    lines.push('');
  }

  if (unchecked.length > 0) {
    lines.push('### Not checked');
    lines.push('');
    lines.push('| File | Reason |');
    lines.push('|------|--------|');
    for (const u of unchecked) {
      lines.push(`| \`${u.file}\` | ${markdownText(u.reason)} |`);
    }
    lines.push('');
  }

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
  } else if (unchecked.length > 0) {
    lines.push('No violations in the files that were checked.');
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
