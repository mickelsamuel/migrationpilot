#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { glob } from 'node:fs/promises';
import { parseMigration } from './parser/parse.js';
import { extractTargets } from './parser/extract.js';
import { classifyLock } from './locks/classify.js';
import { allRules, runRules } from './rules/index.js';
import { applySeverityOverrides } from './rules/engine.js';
import { calculateRisk } from './scoring/score.js';
import { formatCliOutput, formatCheckSummary } from './output/cli.js';
import { formatSarif, buildCombinedSarifLog } from './output/sarif.js';
import { formatJson, formatJsonMulti } from './output/json.js';
import { formatFileError, formatParseError, formatConnectionError } from './output/errors.js';
import { fetchProductionContext } from './production/context.js';
import { validateLicense, isProOrAbove } from './license/validate.js';
import { loadConfig, resolveRuleConfig, generateDefaultConfig } from './config/load.js';
import { autoFix, isFixable } from './fixer/fix.js';
import { detectFrameworks, getSuggestedPattern } from './frameworks/detect.js';
import { analyzeSQL, AnalysisError } from './analysis/analyze.js';
import { startWatch } from './watch/watcher.js';
import { installPreCommitHook, uninstallPreCommitHook } from './hooks/install.js';
import { analyzeTransactions, isInTransaction } from './analysis/transaction.js';
import { formatPlan, estimateDuration } from './output/plan.js';
import type { PlanStatement, ExecutionPlan } from './output/plan.js';
import type { MigrationPilotConfig } from './config/load.js';
import type { ProductionContext } from './production/context.js';
import type { AnalysisOutput } from './output/cli.js';
import type { Rule } from './rules/engine.js';

const PRO_RULE_IDS = new Set(['MP013', 'MP014', 'MP019']);

const program = new Command();

program
  .name('migrationpilot')
  .description('Know exactly what your PostgreSQL migration will do to production — before you merge.')
  .version(`1.1.0\nnode ${process.version}\nplatform ${process.platform}-${process.arch}\nrules: ${allRules.length} (${allRules.length - 3} free, 3 pro)`, '-V, --version')
  .option('--no-color', 'Disable colored output');

program.hook('preAction', () => {
  if (program.opts().color === false || process.env.NO_COLOR !== undefined || process.env.TERM === 'dumb') {
    chalk.level = 0;
  }
});

program
  .command('init')
  .description('Generate a .migrationpilotrc.yml config file')
  .addHelpText('after', `
Examples:
  $ migrationpilot init`)
  .action(async () => {
    const { writeFile } = await import('node:fs/promises');
    const configPath = resolve('.migrationpilotrc.yml');
    try {
      await readFile(configPath, 'utf-8');
      console.error('Config file already exists: .migrationpilotrc.yml');
      process.exit(1);
    } catch {
      // File doesn't exist — good
    }
    await writeFile(configPath, generateDefaultConfig());
    console.log('Created .migrationpilotrc.yml');
  });

program
  .command('list-rules')
  .description('List all available safety rules')
  .option('--json', 'Output as JSON')
  .addHelpText('after', `
Examples:
  $ migrationpilot list-rules
  $ migrationpilot list-rules --json`)
  .action((opts: { json?: boolean }) => {
    if (opts.json) {
      const rules = allRules.map(r => ({
        id: r.id,
        name: r.name,
        severity: r.severity,
        description: r.description,
        tier: PRO_RULE_IDS.has(r.id) ? 'pro' : 'free',
        fixable: isFixable(r.id),
        docsUrl: r.docsUrl,
      }));
      console.log(JSON.stringify(rules, null, 2));
      return;
    }

    console.log(`MigrationPilot — ${allRules.length} safety rules (${allRules.length - PRO_RULE_IDS.size} free, ${PRO_RULE_IDS.size} pro)\n`);
    for (const r of allRules) {
      const tier = PRO_RULE_IDS.has(r.id) ? chalk.magenta('[PRO]') : chalk.green('[FREE]');
      const sev = r.severity === 'critical' ? chalk.red(r.severity) : chalk.yellow(r.severity);
      const fix = isFixable(r.id) ? chalk.cyan(' [auto-fix]') : '';
      console.log(`  ${chalk.bold(r.id)} ${r.name} ${tier} ${sev}${fix}`);
      console.log(`    ${r.description}`);
    }
  });

program
  .command('detect')
  .description('Auto-detect migration framework and suggest configuration')
  .argument('[dir]', 'Directory to scan', '.')
  .addHelpText('after', `
Examples:
  $ migrationpilot detect
  $ migrationpilot detect ./backend`)
  .action(async (dir: string) => {
    const fullDir = resolve(dir);
    const frameworks = await detectFrameworks(fullDir);

    if (frameworks.length === 0) {
      console.log('No migration framework detected.');
      console.log('Supported frameworks: Flyway, Liquibase, Alembic, Django, Knex, Prisma,');
      console.log('TypeORM, Drizzle, Sequelize, goose, dbmate, Sqitch, Rails, Ecto');
      return;
    }

    console.log(`Detected ${frameworks.length} framework(s):\n`);

    for (const fw of frameworks) {
      const confidence = fw.confidence === 'high' ? '***' : fw.confidence === 'medium' ? '**' : '*';
      console.log(`  ${fw.name} [${confidence}]`);
      console.log(`    Evidence: ${fw.evidence}`);
      if (fw.migrationPath) console.log(`    Migration path: ${fw.migrationPath}`);
      if (fw.filePattern) console.log(`    File pattern: ${fw.filePattern}`);
      console.log(`    Suggested: migrationpilot check ${fw.migrationPath || '.'} --pattern "${getSuggestedPattern(fw)}"`);
      console.log();
    }
  });

program
  .command('watch')
  .description('Watch migration files and re-analyze on change')
  .argument('<dir>', 'Directory to watch')
  .option('--pattern <glob>', 'Glob pattern for SQL files', '**/*.sql')
  .option('--pg-version <version>', 'Target PostgreSQL version', '17')
  .option('--no-config', 'Ignore config file')
  .addHelpText('after', `
Examples:
  $ migrationpilot watch ./migrations
  $ migrationpilot watch ./db --pattern "V*.sql"`)
  .action(async (dir: string, opts: { pattern: string; pgVersion: string; config: boolean }) => {
    const { config } = opts.config !== false ? await loadConfig() : { config: {} as MigrationPilotConfig };
    const pgVersion = parseInt(opts.pgVersion || String(config.pgVersion || 17), 10);
    const pattern = opts.pattern || config.migrationPath || '**/*.sql';
    const rules = filterRules(false, config);

    console.log(`MigrationPilot watch mode — press Ctrl+C to stop\n`);

    const stop = await startWatch({
      dir: resolve(dir),
      pattern,
      pgVersion,
      rules,
      onAnalysis: (file, output, violationCount) => {
        if (!file) {
          console.log(output);
          return;
        }
        console.log(`\n--- ${file} (${violationCount} violation${violationCount !== 1 ? 's' : ''}) ---`);
        console.log(output);
      },
      onError: (file, error) => {
        console.error(`Error in ${file}: ${error}`);
      },
    });

    // Handle graceful shutdown
    const shutdown = () => { stop(); console.log('\nWatch mode stopped.'); process.exit(0); };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });

program
  .command('hook')
  .description('Install or uninstall git pre-commit hook')
  .argument('<action>', '"install" or "uninstall"')
  .addHelpText('after', `
Examples:
  $ migrationpilot hook install
  $ migrationpilot hook uninstall`)
  .action(async (action: string) => {
    if (action === 'install') {
      const result = await installPreCommitHook();
      console.log(result.message);
      if (!result.success) process.exit(1);
    } else if (action === 'uninstall') {
      const result = await uninstallPreCommitHook();
      console.log(result.message);
      if (!result.success) process.exit(1);
    } else {
      console.error('Usage: migrationpilot hook <install|uninstall>');
      process.exit(1);
    }
  });

program
  .command('plan')
  .description('Show a visual execution plan for a migration file')
  .argument('<file>', 'Path to migration SQL file')
  .option('--pg-version <version>', 'Target PostgreSQL version', '17')
  .option('--database-url <url>', 'PostgreSQL connection string for row count estimates (Pro)')
  .option('--license-key <key>', 'License key for Pro features')
  .option('--no-config', 'Ignore config file')
  .addHelpText('after', `
Examples:
  $ migrationpilot plan migrations/V001__add_users.sql
  $ migrationpilot plan migration.sql --database-url postgresql://localhost/mydb`)
  .action(async (file: string, opts: { pgVersion: string; databaseUrl?: string; licenseKey?: string; config: boolean }) => {
    const { config } = opts.config !== false ? await loadConfig() : { config: {} as MigrationPilotConfig };
    const pgVersion = parseInt(opts.pgVersion || String(config.pgVersion || 17), 10);
    const filePath = resolve(file);
    const license = validateLicense(opts.licenseKey);
    const isPro = isProOrAbove(license);

    let sql: string;
    try {
      sql = await readFile(filePath, 'utf-8');
    } catch {
      console.error(formatFileError(filePath));
      process.exit(1);
    }

    const prodCtx = (opts.databaseUrl && isPro)
      ? await fetchContext(sql, opts.databaseUrl)
      : undefined;

    const rules = filterRules(isPro, config);
    const parsed = await parseMigration(sql);

    if (parsed.errors.length > 0) {
      console.error(formatParseError({ file: filePath, error: parsed.errors.map(e => e.message).join('; '), sql }));
      process.exit(1);
    }

    const statementsWithLocks = parsed.statements.map(s => {
      const lock = classifyLock(s.stmt, pgVersion);
      const line = sql.slice(0, s.stmtLocation).split('\n').length;
      return { ...s, lock, line };
    });

    const violations = runRules(rules, statementsWithLocks, pgVersion, prodCtx, sql);
    const txContext = analyzeTransactions(statementsWithLocks);

    const planStatements: PlanStatement[] = statementsWithLocks.map((s, i) => {
      const targets = extractTargets(s.stmt).map(t => t.tableName);
      const tableName = targets[0];
      const rowCount = tableName ? prodCtx?.tableStats.get(tableName)?.rowCount : undefined;

      return {
        index: i,
        sql: s.originalSql,
        line: s.line,
        lock: s.lock,
        risk: calculateRisk(s.lock),
        violations: violations.filter(v => v.line === s.line),
        targets,
        durationClass: estimateDuration(s.stmt, s.lock, rowCount),
        inTransaction: isInTransaction(i, txContext),
      };
    });

    const worstRisk = planStatements.reduce(
      (worst, s) => s.risk.score > worst.score ? s.risk : worst,
      planStatements[0]?.risk ?? calculateRisk({ lockType: 'ACCESS SHARE' as const, blocksReads: false, blocksWrites: false, longHeld: false })
    );

    const plan: ExecutionPlan = {
      file: filePath,
      statements: planStatements,
      txContext,
      totalViolations: violations.length,
      overallRisk: worstRisk,
    };

    console.log(formatPlan(plan));
  });

program
  .command('analyze')
  .description('Analyze a SQL migration file for safety')
  .argument('[file]', 'Path to migration SQL file')
  .option('--pg-version <version>', 'Target PostgreSQL version')
  .option('--format <format>', 'Output format: text, json, sarif, markdown', 'text')
  .option('--fail-on <severity>', 'Exit with code 2 on critical, 1 on warning: critical, warning, never')
  .option('--database-url <url>', 'PostgreSQL connection string for production context (Pro tier)')
  .option('--license-key <key>', 'License key for Pro features')
  .option('--fix', 'Auto-fix safe violations and write the fixed file')
  .option('--dry-run', 'Show what --fix would change without writing (use with --fix)')
  .option('--stdin', 'Read SQL from stdin instead of a file')
  .option('--quiet', 'Only show violations, one per line')
  .option('--verbose', 'Show all checks including passing rules')
  .option('--exclude <rules>', 'Comma-separated rule IDs to exclude (e.g., MP037,MP041)')
  .option('--no-config', 'Ignore config file')
  .addHelpText('after', `
Examples:
  $ migrationpilot analyze migration.sql
  $ migrationpilot analyze migration.sql --fix
  $ migrationpilot analyze migration.sql --fix --dry-run
  $ migrationpilot analyze migration.sql --format json
  $ migrationpilot analyze migration.sql --format sarif
  $ migrationpilot analyze migration.sql --quiet
  $ migrationpilot analyze migration.sql --exclude MP037,MP041
  $ cat migration.sql | migrationpilot analyze --stdin
  $ migrationpilot analyze migration.sql --database-url postgresql://localhost/mydb`)
  .action(async (file: string | undefined, opts: { pgVersion?: string; format: string; failOn?: string; databaseUrl?: string; licenseKey?: string; config: boolean; fix?: boolean; dryRun?: boolean; stdin?: boolean; quiet?: boolean; verbose?: boolean; exclude?: string }) => {
    const { config, configPath } = opts.config !== false ? await loadConfig() : { config: {} as MigrationPilotConfig, configPath: undefined };
    if (configPath) console.error(`Using config: ${configPath}`);

    const pgVersion = parseInt(opts.pgVersion || String(config.pgVersion || 17), 10);
    const failOn = opts.failOn || config.failOn || 'critical';
    const license = validateLicense(opts.licenseKey);
    const isPro = isProOrAbove(license);

    if (opts.databaseUrl && !isPro) {
      console.error('Error: --database-url requires a Pro license key.');
      console.error('       Pass --license-key <key> or set MIGRATIONPILOT_LICENSE_KEY.');
      console.error('       Get a key at https://migrationpilot.dev/pricing');
      process.exit(1);
    }

    let sql: string;
    let filePath: string;

    if (opts.stdin) {
      sql = await readStdin();
      filePath = '<stdin>';
    } else if (file) {
      filePath = resolve(file);
      try {
        sql = await readFile(filePath, 'utf-8');
      } catch {
        console.error(formatFileError(filePath));
        process.exit(1);
      }
    } else {
      console.error('Error: Provide a file path or use --stdin');
      process.exit(1);
    }

    const prodCtx = (opts.databaseUrl && isPro)
      ? await fetchContext(sql, opts.databaseUrl)
      : undefined;

    let rules = filterRules(isPro, config);
    if (opts.exclude) {
      const excluded = new Set(opts.exclude.split(',').map(s => s.trim()));
      rules = rules.filter(r => !excluded.has(r.id));
    }
    const t0 = performance.now();
    const analysis = await analyzeSQLWithErrorHandling(sql, filePath!, pgVersion, rules, prodCtx);
    analysis.violations = applySeverityOverrides(analysis.violations, config.rules);
    const elapsedMs = performance.now() - t0;
    const timing = { ruleCount: rules.length, elapsedMs };

    if (opts.fix && analysis.violations.length > 0) {
      const result = autoFix(sql, analysis.violations);

      if (opts.dryRun) {
        if (result.fixedCount > 0) {
          console.log(`Dry run: ${result.fixedCount} fix(es) would be applied:\n`);
          showDiff(sql, result.fixedSql);
        } else {
          console.log('Dry run: No auto-fixable violations found.');
        }
        if (result.unfixable.length > 0) {
          console.log(`\n${result.unfixable.length} violation(s) require manual fixes:`);
          for (const v of result.unfixable) {
            console.log(`  - ${v.ruleId}: ${v.message}`);
          }
        }
        return;
      }

      const { writeFile } = await import('node:fs/promises');

      if (result.fixedCount > 0) {
        await writeFile(filePath!, result.fixedSql);
        console.log(`Fixed ${result.fixedCount} violation(s) in ${file}`);

        if (result.unfixable.length > 0) {
          console.log(`${result.unfixable.length} violation(s) require manual fixes:`);
          for (const v of result.unfixable) {
            console.log(`  - ${v.ruleId}: ${v.message}`);
          }
        }
      } else {
        console.log(`No auto-fixable violations found. ${analysis.violations.length} violation(s) require manual fixes.`);
      }
      return;
    }

    if (opts.quiet) {
      const { formatQuietOutput } = await import('./output/cli.js');
      const output = formatQuietOutput(analysis);
      if (output) console.log(output);
    } else if (opts.format === 'sarif') {
      console.log(formatSarif(analysis.violations, filePath!, rules));
    } else if (opts.format === 'json') {
      console.log(formatJson(analysis, rules));
    } else if (opts.format === 'markdown') {
      const { formatMarkdown } = await import('./output/markdown.js');
      console.log(formatMarkdown(analysis, rules));
    } else if (opts.verbose) {
      const { formatVerboseOutput } = await import('./output/cli.js');
      console.log(formatVerboseOutput(analysis, rules));
    } else {
      console.log(formatCliOutput(analysis, { rules, timing }));
    }

    exitWithCode(failOn, analysis.violations);
  });

program
  .command('check')
  .description('Check all migration files in a directory')
  .argument('<dir>', 'Path to migrations directory')
  .option('--pattern <glob>', 'Glob pattern for SQL files')
  .option('--pg-version <version>', 'Target PostgreSQL version')
  .option('--format <format>', 'Output format: text, json, sarif, markdown', 'text')
  .option('--fail-on <severity>', 'Exit with code 2 on critical, 1 on warning: critical, warning, never')
  .option('--database-url <url>', 'PostgreSQL connection string for production context (Pro tier)')
  .option('--license-key <key>', 'License key for Pro features')
  .option('--exclude <rules>', 'Comma-separated rule IDs to exclude (e.g., MP037,MP041)')
  .option('--no-config', 'Ignore config file')
  .addHelpText('after', `
Examples:
  $ migrationpilot check ./migrations
  $ migrationpilot check ./db --pattern "V*.sql"
  $ migrationpilot check ./migrations --format sarif --fail-on warning
  $ migrationpilot check ./migrations --exclude MP037,MP041`)
  .action(async (dir: string, opts: { pattern?: string; pgVersion?: string; format: string; failOn?: string; databaseUrl?: string; licenseKey?: string; config: boolean; exclude?: string }) => {
    const { config, configPath } = opts.config !== false ? await loadConfig() : { config: {} as MigrationPilotConfig, configPath: undefined };
    if (configPath) console.error(`Using config: ${configPath}`);

    const pgVersion = parseInt(opts.pgVersion || String(config.pgVersion || 17), 10);
    const failOn = opts.failOn || config.failOn || 'critical';
    const pattern = opts.pattern || config.migrationPath || '**/*.sql';
    const dirPath = resolve(dir);
    const license = validateLicense(opts.licenseKey);
    const isPro = isProOrAbove(license);

    if (opts.databaseUrl && !isPro) {
      console.error('Error: --database-url requires a Pro license key.');
      console.error('       Pass --license-key <key> or set MIGRATIONPILOT_LICENSE_KEY.');
      console.error('       Get a key at https://migrationpilot.dev/pricing');
      process.exit(1);
    }

    const files: string[] = [];
    for await (const entry of glob(resolve(dirPath, pattern))) {
      // Check ignore patterns
      if (config.ignore && config.ignore.length > 0) {
        const relative = entry.replace(dirPath + '/', '').replace(dirPath + '\\', '');
        if (config.ignore.some(ig => relative.includes(ig.replace(/\*/g, '')))) continue;
      }
      files.push(entry);
    }

    if (files.length === 0) {
      console.log(`No SQL files found in ${dirPath} matching "${pattern}"`);
      process.exit(0);
    }

    let rules = filterRules(isPro, config);
    if (opts.exclude) {
      const excluded = new Set(opts.exclude.split(',').map(s => s.trim()));
      rules = rules.filter(r => !excluded.has(r.id));
    }
    const results: AnalysisOutput[] = [];
    const allViolations: import('./rules/engine.js').RuleViolation[] = [];
    const t0 = performance.now();

    for (const file of files.sort()) {
      const sql = await readFile(file, 'utf-8');
      const prodCtx = (opts.databaseUrl && isPro)
        ? await fetchContext(sql, opts.databaseUrl)
        : undefined;
      const analysis = await analyzeSQLWithErrorHandling(sql, file, pgVersion, rules, prodCtx);
      analysis.violations = applySeverityOverrides(analysis.violations, config.rules);
      results.push(analysis);
      allViolations.push(...analysis.violations);

      if (opts.format === 'text') {
        console.log(formatCliOutput(analysis, { rules }));
      }
    }

    const checkElapsed = performance.now() - t0;

    if (opts.format === 'json') {
      console.log(formatJsonMulti(results, rules));
    } else if (opts.format === 'sarif') {
      const sarifLog = buildCombinedSarifLog(
        results.map(r => ({ file: r.file, violations: r.violations })),
        rules,
      );
      console.log(JSON.stringify(sarifLog, null, 2));
    } else if (opts.format === 'text' && results.length > 1) {
      console.log(formatCheckSummary(results, { ruleCount: rules.length, elapsedMs: checkElapsed }));
    }

    exitWithCode(failOn, allViolations);
  });

function filterRules(isPro: boolean, config: MigrationPilotConfig): Rule[] {
  const baseRules = isPro ? allRules : allRules.filter(r => !PRO_RULE_IDS.has(r.id));
  return baseRules.filter(r => {
    const rc = resolveRuleConfig(r.id, r.severity, config);
    return rc.enabled;
  });
}

async function fetchContext(sql: string, databaseUrl: string): Promise<ProductionContext | undefined> {
  try {
    const parsed = await parseMigration(sql);
    const tableNames = [...new Set(
      parsed.statements.flatMap(s => extractTargets(s.stmt).map(t => t.tableName))
    )];
    if (tableNames.length === 0) return undefined;
    return await fetchProductionContext({ connectionString: databaseUrl }, tableNames);
  } catch (err) {
    console.error(formatConnectionError(err instanceof Error ? err.message : String(err)));
    return undefined;
  }
}

async function analyzeSQLWithErrorHandling(sql: string, filePath: string, pgVersion: number, rules: Rule[], prodCtx?: ProductionContext): Promise<AnalysisOutput> {
  try {
    return await analyzeSQL(sql, filePath, pgVersion, rules, prodCtx);
  } catch (err) {
    if (err instanceof AnalysisError) {
      console.error(formatParseError({ file: err.file, error: err.parseErrors.join('; '), sql }));
      process.exit(1);
    }
    throw err;
  }
}

/**
 * Exit with appropriate code based on violation severities.
 * 0 = clean, 1 = warnings (when --fail-on warning), 2 = critical violations
 */
function exitWithCode(failOn: string, violations: import('./rules/engine.js').RuleViolation[]): void {
  if (failOn === 'never') return;

  const hasCritical = violations.some(v => v.severity === 'critical');
  const hasWarning = violations.some(v => v.severity === 'warning');

  if (hasCritical) process.exit(2);
  if (failOn === 'warning' && hasWarning) process.exit(1);
}

/**
 * Read all data from stdin.
 */
async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  }
  return Buffer.concat(chunks).toString('utf-8');
}

/**
 * Show a simple diff between original and fixed SQL.
 */
function showDiff(original: string, fixed: string): void {
  const origLines = original.split('\n');
  const fixedLines = fixed.split('\n');

  console.log(`--- original`);
  console.log(`+++ fixed`);

  let i = 0;
  let j = 0;
  while (i < origLines.length || j < fixedLines.length) {
    if (i < origLines.length && j < fixedLines.length && origLines[i] === fixedLines[j]) {
      console.log(`  ${origLines[i]}`);
      i++;
      j++;
    } else if (i < origLines.length && (j >= fixedLines.length || origLines[i] !== fixedLines[j])) {
      // Check if this line was replaced or removed
      if (j < fixedLines.length && origLines[i] !== fixedLines[j]) {
        // Line changed — show both
        console.log(`- ${origLines[i]}`);
        console.log(`+ ${fixedLines[j]}`);
        i++;
        j++;
      } else {
        console.log(`- ${origLines[i]}`);
        i++;
      }
    } else {
      console.log(`+ ${fixedLines[j]}`);
      j++;
    }
  }
}

program.parse();
