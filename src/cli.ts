#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { glob } from 'node:fs/promises';
import { parseMigration } from './parser/parse.js';
import { extractTargets } from './parser/extract.js';
import { classifyLock } from './locks/classify.js';
import { allRules, PRO_RULE_IDS, runRules } from './rules/index.js';
import { applySeverityOverrides, checkStaleDirectives } from './rules/engine.js';
import { calculateRisk } from './scoring/score.js';
import { formatCliOutput, formatCheckSummary } from './output/cli.js';
import { formatSarif, buildCombinedSarifLog } from './output/sarif.js';
import { formatJson, formatJsonMulti } from './output/json.js';
import { formatFileError, formatParseError, formatConnectionError } from './output/errors.js';
import { fetchProductionContext } from './production/context.js';
import { validateLicense, isProOrAbove } from './license/validate.js';
import type { LicenseStatus } from './license/validate.js';
import { loadConfig, resolveRuleConfig, resolvePreset, generateDefaultConfig } from './config/load.js';
import { autoFix, isFixable } from './fixer/fix.js';
import { detectFrameworks, getSuggestedPattern } from './frameworks/detect.js';
import { analyzeSQL, AnalysisError } from './analysis/analyze.js';
import { startWatch } from './watch/watcher.js';
import { installPreCommitHook, uninstallPreCommitHook } from './hooks/install.js';
import { analyzeTransactions, isInTransaction } from './analysis/transaction.js';
import { runDiagnostics } from './doctor/check.js';
import { checkForUpdate } from './update/check.js';
import { maybeShowStarPrompt } from './prompts/star.js';
import { generateBashCompletion, generateZshCompletion, generateFishCompletion } from './completion/scripts.js';
import { checkFreeUsage, recordFreeUsage } from './usage/track.js';
import { compareSchemas, formatDriftReport } from './drift/compare.js';
import { recordAnalysis, computeTrends, formatTrends } from './history/store.js';
import type { HistoryEntry } from './history/store.js';
import { configureAudit, auditLog } from './audit/log.js';
import { formatPlan, estimateDuration } from './output/plan.js';
import { generateSuggestions } from './output/suggestions.js';
import type { PlanStatement, ExecutionPlan } from './output/plan.js';
import type { MigrationPilotConfig } from './config/load.js';
import type { ProductionContext } from './production/context.js';
import type { AnalysisOutput } from './output/cli.js';
import type { Rule } from './rules/engine.js';

const program = new Command();

program
  .name('migrationpilot')
  .description('Know exactly what your PostgreSQL migration will do to production — before you merge.')
  .version(`1.4.0\nnode ${process.version}\nplatform ${process.platform}-${process.arch}\nrules: ${allRules.length} (${allRules.length - 3} free, 3 pro)`, '-V, --version')
  .option('--no-color', 'Disable colored output');

program.hook('preAction', () => {
  if (program.opts().color === false || process.env.NO_COLOR !== undefined || process.env.TERM === 'dumb') {
    chalk.level = 0;
  }
});

/** Print config warnings to stderr */
function printConfigWarnings(warnings: string[]): void {
  for (const w of warnings) {
    console.error(chalk.yellow(`Warning: ${w}`));
  }
}

program
  .command('init')
  .description('Generate a .migrationpilotrc.yml config file')
  .option('--preset <name>', 'Use a built-in preset: recommended, strict, ci')
  .option('--force', 'Overwrite existing config file')
  .addHelpText('after', `
Examples:
  $ migrationpilot init
  $ migrationpilot init --preset strict
  $ migrationpilot init --preset ci --force`)
  .action(async (opts: { preset?: string; force?: boolean }) => {
    const { writeFile } = await import('node:fs/promises');
    const configPath = resolve('.migrationpilotrc.yml');
    if (!opts.force) {
      try {
        await readFile(configPath, 'utf-8');
        console.error('Config file already exists: .migrationpilotrc.yml (use --force to overwrite)');
        process.exit(1);
      } catch {
        // File doesn't exist — good
      }
    }
    let content: string;
    if (opts.preset) {
      const presetName = `migrationpilot:${opts.preset}`;
      const preset = resolvePreset(presetName);
      if (!preset) {
        console.error(`Unknown preset: ${opts.preset}. Available presets: recommended, strict, ci, startup, enterprise`);
        process.exit(1);
      }
      content = `# MigrationPilot Configuration\n# https://migrationpilot.dev/docs/configuration\n\nextends: "${presetName}"\n\n# Target PostgreSQL version\npgVersion: 17\n`;
    } else {
      content = generateDefaultConfig();
    }
    await writeFile(configPath, content);
    console.log(`Created .migrationpilotrc.yml${opts.preset ? ` (preset: ${opts.preset})` : ''}`);
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
  .command('rollback')
  .description('Generate reverse (rollback) SQL for a migration file')
  .argument('<file>', 'Migration SQL file to generate rollback for')
  .option('--output <file>', 'Write rollback SQL to file instead of stdout')
  .addHelpText('after', `
Examples:
  $ migrationpilot rollback migrations/001_add_users.sql
  $ migrationpilot rollback migrations/001.sql --output migrations/001_rollback.sql`)
  .action(async (filePath: string, opts: { output?: string }) => {
    const { generateRollback, formatRollbackSql } = await import('./generator/rollback.js');
    const absPath = resolve(filePath);
    let sql: string;
    try {
      sql = await readFile(absPath, 'utf-8');
    } catch {
      console.error(formatFileError(filePath));
      process.exit(1);
    }

    const { statements, errors } = await parseMigration(sql);
    if (errors.length > 0) {
      console.error(formatParseError({ file: filePath, error: errors[0]?.message ?? 'Unknown error', sql }));
      process.exit(1);
    }

    const result = generateRollback(statements);
    const output = formatRollbackSql(result);

    if (opts.output) {
      const { writeFile } = await import('node:fs/promises');
      await writeFile(resolve(opts.output), output, 'utf-8');
      console.log(chalk.green(`Rollback SQL written to ${opts.output}`));
      console.log(`  ${chalk.dim(`${result.statements.length} reversible statements`)}`);
      if (result.warnings.length > 0) {
        console.log(`  ${chalk.yellow(`${result.warnings.length} statements could not be auto-reversed`)}`);
      }
    } else {
      console.log(output);
    }

    if (result.warnings.length > 0 && !opts.output) {
      console.error(chalk.yellow(`\n${result.warnings.length} statement(s) could not be auto-reversed (see WARNING comments above).`));
    }
  });

program
  .command('explain')
  .description('Show detailed information about a specific rule')
  .argument('<rule-id>', 'Rule ID (e.g. MP001)')
  .addHelpText('after', `
Examples:
  $ migrationpilot explain MP001
  $ migrationpilot explain mp037`)
  .action((ruleId: string) => {
    const id = ruleId.toUpperCase();
    const rule = allRules.find(r => r.id === id);

    if (!rule) {
      console.error(chalk.red(`Unknown rule: ${ruleId}`));
      console.error(`Run ${chalk.cyan('migrationpilot list-rules')} to see all available rules.`);
      process.exit(1);
    }

    const tier = PRO_RULE_IDS.has(rule.id) ? chalk.magenta('Pro') : chalk.green('Free');
    const sev = rule.severity === 'critical' ? chalk.red(rule.severity) : chalk.yellow(rule.severity);
    const fix = isFixable(rule.id) ? chalk.cyan('Yes') : chalk.dim('No');

    console.log();
    console.log(`  ${chalk.bold.white(rule.id)} — ${rule.name}`);
    console.log();
    console.log(`  ${chalk.dim('Severity:')}  ${sev}`);
    console.log(`  ${chalk.dim('Tier:')}      ${tier}`);
    console.log(`  ${chalk.dim('Auto-fix:')}  ${fix}`);
    console.log(`  ${chalk.dim('Docs:')}      ${chalk.blue(rule.docsUrl)}`);
    console.log();
    console.log(`  ${chalk.dim('Description:')}`);
    console.log(`  ${rule.description}`);
    console.log();
    console.log(`  ${chalk.dim('Why it matters:')}`);
    console.log(`  ${rule.whyItMatters}`);
    console.log();
  });

program
  .command('doctor')
  .description('Check your environment and MigrationPilot installation')
  .addHelpText('after', `
Examples:
  $ migrationpilot doctor`)
  .action(async () => {
    const results = await runDiagnostics({
      currentVersion: '1.4.0',
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      ruleCount: allRules.length,
    });

    console.log(`\nMigrationPilot Doctor\n`);

    for (const r of results) {
      const icon = r.status === 'ok' ? chalk.green('✓')
        : r.status === 'warn' ? chalk.yellow('!')
        : chalk.red('✗');
      console.log(`  ${icon} ${chalk.bold(r.label)}: ${r.message}`);
    }

    const errors = results.filter(r => r.status === 'error');
    const warns = results.filter(r => r.status === 'warn');
    console.log();

    if (errors.length > 0) {
      console.log(chalk.red(`${errors.length} error(s) found. Fix these before using MigrationPilot.`));
      process.exit(1);
    } else if (warns.length > 0) {
      console.log(chalk.yellow(`${warns.length} warning(s). MigrationPilot will work but some features may be limited.`));
    } else {
      console.log(chalk.green('All checks passed.'));
    }
  });

program
  .command('completion')
  .description('Generate shell completion script')
  .argument('<shell>', 'Shell type: bash, zsh, or fish')
  .addHelpText('after', `
Examples:
  $ migrationpilot completion bash >> ~/.bashrc
  $ migrationpilot completion zsh >> ~/.zshrc
  $ migrationpilot completion fish > ~/.config/fish/completions/migrationpilot.fish
  $ eval "$(migrationpilot completion bash)"`)
  .action((shell: string) => {
    switch (shell) {
      case 'bash':
        console.log(generateBashCompletion());
        break;
      case 'zsh':
        console.log(generateZshCompletion());
        break;
      case 'fish':
        console.log(generateFishCompletion());
        break;
      default:
        console.error(`Unknown shell: ${shell}. Supported: bash, zsh, fish`);
        process.exit(1);
    }
  });

program
  .command('drift')
  .description('Compare two database schemas and report differences')
  .requiredOption('--source <url>', 'Source database connection string')
  .requiredOption('--target <url>', 'Target database connection string')
  .option('--schema <name>', 'Schema to compare', 'public')
  .option('--format <format>', 'Output format: text, json', 'text')
  .addHelpText('after', `
Examples:
  $ migrationpilot drift --source postgresql://localhost/staging --target postgresql://localhost/production
  $ migrationpilot drift --source $STAGING_URL --target $PROD_URL --format json`)
  .action(async (opts: { source: string; target: string; schema: string; format: string }) => {
    try {
      console.error(chalk.dim('Comparing schemas...'));
      const diff = await compareSchemas(opts.source, opts.target, opts.schema);

      if (opts.format === 'json') {
        console.log(JSON.stringify(diff, null, 2));
      } else {
        console.log(formatDriftReport(diff));
      }

      const hasChanges = diff.tables.added.length > 0 || diff.tables.removed.length > 0 ||
        diff.tables.modified.length > 0 || diff.indexes.added.length > 0 ||
        diff.indexes.removed.length > 0 || diff.sequences.added.length > 0 ||
        diff.sequences.removed.length > 0;

      if (hasChanges) process.exit(1);
    } catch (err) {
      console.error(chalk.red(`Drift detection failed: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    }
  });

program
  .command('trends')
  .description('Show historical analysis trends and statistics')
  .option('--format <format>', 'Output format: text, json', 'text')
  .addHelpText('after', `
Examples:
  $ migrationpilot trends
  $ migrationpilot trends --format json`)
  .action(async (opts: { format: string }) => {
    const trends = await computeTrends();

    if (opts.format === 'json') {
      console.log(JSON.stringify(trends, null, 2));
    } else {
      console.log(formatTrends(trends));
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
  .option('--license-key <key>', 'License key for Pro features')
  .option('--no-config', 'Ignore config file')
  .addHelpText('after', `
Examples:
  $ migrationpilot watch ./migrations
  $ migrationpilot watch ./db --pattern "V*.sql"`)
  .action(async (dir: string, opts: { pattern: string; pgVersion: string; licenseKey?: string; config: boolean }) => {
    const { config, warnings: configWarnings } = opts.config !== false ? await loadConfig() : { config: {} as MigrationPilotConfig, warnings: [] as string[] };
    printConfigWarnings(configWarnings);
    const pgVersion = parseInt(opts.pgVersion || String(config.pgVersion || 17), 10);
    const pattern = opts.pattern || config.migrationPath || '**/*.sql';
    const license = validateLicense(opts.licenseKey);
    const isPro = isProOrAbove(license);
    warnIfExpired(license);
    const rules = filterRules(isPro, config);

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
    const { config, warnings: configWarnings } = opts.config !== false ? await loadConfig() : { config: {} as MigrationPilotConfig, warnings: [] as string[] };
    printConfigWarnings(configWarnings);
    const pgVersion = parseInt(opts.pgVersion || String(config.pgVersion || 17), 10);
    const filePath = resolve(file);
    const license = validateLicense(opts.licenseKey);
    const isPro = isProOrAbove(license);
    warnIfExpired(license);

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
  .command('template')
  .description('Generate expand-contract migration templates for safe schema changes')
  .argument('<operation>', 'Operation: rename-column, change-type, split-table, add-not-null, remove-column')
  .requiredOption('--table <name>', 'Target table name')
  .option('--column <name>', 'Column name to operate on')
  .option('--new-name <name>', 'New column name (for rename)')
  .option('--new-type <type>', 'New column type (for type change)')
  .option('--phase <phase>', 'Output only a specific phase: expand, migrate, contract')
  .addHelpText('after', `
Examples:
  $ migrationpilot template rename-column --table users --column email --new-name email_address
  $ migrationpilot template change-type --table orders --column amount --new-type numeric(12,2)
  $ migrationpilot template add-not-null --table users --column name
  $ migrationpilot template remove-column --table users --column legacy_field
  $ migrationpilot template split-table --table users --column profile_data
  $ migrationpilot template add-not-null --table users --column name --phase expand`)
  .action(async (operation: string, opts: { table: string; column?: string; newName?: string; newType?: string; phase?: string }) => {
    const { generateTemplate } = await import('./templates/expand-contract.js');
    const validOps = ['rename-column', 'change-type', 'split-table', 'add-not-null', 'remove-column'] as const;
    if (!validOps.includes(operation as typeof validOps[number])) {
      console.error(chalk.red(`Unknown operation: ${operation}`));
      console.error(`Valid operations: ${validOps.join(', ')}`);
      process.exit(1);
    }

    const template = generateTemplate(operation as typeof validOps[number], {
      table: opts.table,
      column: opts.column,
      newName: opts.newName,
      newType: opts.newType,
    });

    if (opts.phase) {
      const phase = opts.phase as 'expand' | 'migrate' | 'contract';
      if (!['expand', 'migrate', 'contract'].includes(phase)) {
        console.error(chalk.red(`Unknown phase: ${opts.phase}. Valid: expand, migrate, contract`));
        process.exit(1);
      }
      console.log(template[phase]);
      return;
    }

    console.log(chalk.bold.cyan(`\n${template.name}\n`));
    console.log(chalk.dim(template.description));

    console.log(chalk.bold.green('\n── Phase 1: Expand ──\n'));
    console.log(template.expand);
    console.log(chalk.bold.yellow('\n── Phase 2: Migrate ──\n'));
    console.log(template.migrate);
    console.log(chalk.bold.red('\n── Phase 3: Contract ──\n'));
    console.log(template.contract);
  });

program
  .command('predict')
  .description('Predict migration duration based on operation type and optional table stats')
  .argument('<file>', 'Migration SQL file')
  .option('--row-count <count>', 'Table row count for calibration')
  .option('--size <bytes>', 'Table size in bytes')
  .option('--index-count <count>', 'Number of existing indexes')
  .option('--format <format>', 'Output format: text, json', 'text')
  .addHelpText('after', `
Examples:
  $ migrationpilot predict migration.sql
  $ migrationpilot predict migration.sql --row-count 5000000 --size 2147483648
  $ migrationpilot predict migration.sql --format json`)
  .action(async (file: string, opts: { rowCount?: string; size?: string; indexCount?: string; format: string }) => {
    const { predictDuration } = await import('./prediction/duration.js');
    const filePath = resolve(file);
    let sql: string;
    try {
      sql = await readFile(filePath, 'utf-8');
    } catch {
      console.error(formatFileError(filePath));
      process.exit(1);
    }

    const stats = (opts.rowCount || opts.size || opts.indexCount) ? {
      rowCount: parseInt(opts.rowCount ?? '0', 10),
      sizeBytes: parseInt(opts.size ?? '0', 10),
      indexCount: parseInt(opts.indexCount ?? '0', 10),
    } : undefined;

    const estimates = predictDuration(sql, stats);

    if (opts.format === 'json') {
      console.log(JSON.stringify(estimates, null, 2));
      return;
    }

    if (estimates.length === 0) {
      console.log('No DDL statements found to estimate.');
      return;
    }

    console.log(chalk.bold.cyan('\nMigration Duration Estimates\n'));
    for (const est of estimates) {
      const conf = est.confidence === 'high' ? chalk.green(est.confidence)
        : est.confidence === 'medium' ? chalk.yellow(est.confidence)
        : chalk.red(est.confidence);
      console.log(`  ${chalk.bold(est.operation)}: ${chalk.white(est.estimatedDuration)} (${conf} confidence)`);
      for (const factor of est.factors) {
        console.log(`    ${chalk.dim('•')} ${factor}`);
      }
      console.log();
    }
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
  .option('--offline', 'Air-gapped mode: skip update checks and network access')
  .option('--output <file>', 'Write report to file instead of stdout')
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
  $ migrationpilot analyze migration.sql --database-url postgresql://localhost/mydb
  $ migrationpilot analyze migration.sql --offline
  $ migrationpilot analyze migration.sql --format sarif --output report.sarif`)
  .action(async (file: string | undefined, opts: { pgVersion?: string; format: string; failOn?: string; databaseUrl?: string; licenseKey?: string; config: boolean; fix?: boolean; dryRun?: boolean; stdin?: boolean; quiet?: boolean; verbose?: boolean; exclude?: string; offline?: boolean; output?: string }) => {
    const { config, configPath, warnings: configWarnings } = opts.config !== false ? await loadConfig() : { config: {} as MigrationPilotConfig, configPath: undefined, warnings: [] as string[] };
    printConfigWarnings(configWarnings);
    if (configPath) console.error(`Using config: ${configPath}`);
    configureAudit(config.auditLog);

    const pgVersion = parseInt(opts.pgVersion || String(config.pgVersion || 17), 10);
    const failOn = opts.failOn || config.failOn || 'critical';
    const license = validateLicense(opts.licenseKey);
    const isPro = isProOrAbove(license);
    warnIfExpired(license);

    if (opts.offline && opts.databaseUrl) {
      console.error(chalk.yellow('Warning: --offline skips production context (--database-url ignored)'));
    }

    let usedFreeAnalysis = false;
    if (opts.databaseUrl && !opts.offline && !isPro) {
      const usage = await checkFreeUsage();
      if (!usage.allowed) {
        console.error(`You've used all ${usage.limit} free production analyses this month.`);
        console.error('Upgrade to Pro for unlimited production context: https://migrationpilot.dev/pricing');
        process.exit(1);
      }
      console.error(chalk.dim(`Free production analysis (${usage.used + 1}/${usage.limit} this month)`));
      usedFreeAnalysis = true;
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

    const prodCtx = (opts.databaseUrl && !opts.offline && (isPro || usedFreeAnalysis))
      ? await fetchContext(sql, opts.databaseUrl)
      : undefined;
    if (usedFreeAnalysis && prodCtx) await recordFreeUsage();

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

    // Check for stale disable directives — compute statement start lines from SQL
    const stmtLines: number[] = [];
    let searchFrom = 0;
    for (const s of analysis.statements) {
      const idx = sql.indexOf(s.sql.trim(), searchFrom);
      if (idx >= 0) {
        stmtLines.push(sql.slice(0, idx).split('\n').length);
        searchFrom = idx + 1;
      }
    }
    const staleDirectives = checkStaleDirectives(sql, analysis.violations, stmtLines);
    if (staleDirectives.length > 0 && !opts.quiet && opts.format === 'text') {
      for (const sd of staleDirectives) {
        console.error(chalk.yellow(`Warning: Stale disable comment on line ${sd.line} — ${sd.ruleIds.join(', ')} ${sd.reason.toLowerCase()}`));
      }
    }

    let outputStr: string;
    if (opts.quiet) {
      const { formatQuietOutput } = await import('./output/cli.js');
      outputStr = formatQuietOutput(analysis) || '';
    } else if (opts.format === 'sarif') {
      outputStr = formatSarif(analysis.violations, filePath!, rules);
    } else if (opts.format === 'json') {
      outputStr = formatJson(analysis, rules);
    } else if (opts.format === 'markdown') {
      const { formatMarkdown } = await import('./output/markdown.js');
      outputStr = formatMarkdown(analysis, rules);
    } else if (opts.verbose) {
      const { formatVerboseOutput } = await import('./output/cli.js');
      outputStr = formatVerboseOutput(analysis, rules);
    } else {
      outputStr = formatCliOutput(analysis, { rules, timing });
    }

    if (opts.output) {
      const { writeFile: writeOutputFile } = await import('node:fs/promises');
      await writeOutputFile(resolve(opts.output), outputStr);
      console.log(`Report written to ${opts.output} (${analysis.violations.length} violation(s), risk: ${analysis.overallRisk.level})`);
    } else {
      if (outputStr) console.log(outputStr);
    }

    // Show next-step suggestions for text output
    if (opts.format === 'text' && !opts.quiet && analysis.violations.length > 0) {
      const suggestionLines = generateSuggestions(analysis.violations, file ?? undefined);
      if (suggestionLines.length > 0) {
        for (const line of suggestionLines) {
          console.error(line);
        }
      }
    }

    // Record analysis in history (best-effort)
    recordHistory(analysis, filePath!, rules.length).catch(() => {});

    // Audit log (best-effort)
    const analyzeExitCode = getExitCode(failOn, analysis.violations);
    auditLog({
      event: 'analysis_complete',
      command: 'analyze',
      file: filePath!,
      riskLevel: analysis.overallRisk.level,
      riskScore: analysis.overallRisk.score,
      violationCount: analysis.violations.length,
      exitCode: analyzeExitCode,
    }).catch(() => {});

    await showPostAnalysisMessages(analysis.violations.length > 0, opts.offline);
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
  .option('--offline', 'Air-gapped mode: skip update checks and network access')
  .option('--output <file>', 'Write report to file instead of stdout')
  .addHelpText('after', `
Examples:
  $ migrationpilot check ./migrations
  $ migrationpilot check ./db --pattern "V*.sql"
  $ migrationpilot check ./migrations --format sarif --fail-on warning
  $ migrationpilot check ./migrations --exclude MP037,MP041
  $ migrationpilot check ./migrations --offline
  $ migrationpilot check ./migrations --format json --output report.json`)
  .action(async (dir: string, opts: { pattern?: string; pgVersion?: string; format: string; failOn?: string; databaseUrl?: string; licenseKey?: string; config: boolean; exclude?: string; offline?: boolean; output?: string }) => {
    const { config, configPath, warnings: configWarnings } = opts.config !== false ? await loadConfig() : { config: {} as MigrationPilotConfig, configPath: undefined, warnings: [] as string[] };
    printConfigWarnings(configWarnings);
    if (configPath) console.error(`Using config: ${configPath}`);
    configureAudit(config.auditLog);

    const pgVersion = parseInt(opts.pgVersion || String(config.pgVersion || 17), 10);
    const failOn = opts.failOn || config.failOn || 'critical';
    const pattern = opts.pattern || config.migrationPath || '**/*.sql';
    const dirPath = resolve(dir);
    const license = validateLicense(opts.licenseKey);
    const isPro = isProOrAbove(license);
    warnIfExpired(license);

    if (opts.offline && opts.databaseUrl) {
      console.error(chalk.yellow('Warning: --offline skips production context (--database-url ignored)'));
    }

    let usedFreeAnalysis = false;
    if (opts.databaseUrl && !opts.offline && !isPro) {
      const usage = await checkFreeUsage();
      if (!usage.allowed) {
        console.error(`You've used all ${usage.limit} free production analyses this month.`);
        console.error('Upgrade to Pro for unlimited production context: https://migrationpilot.dev/pricing');
        process.exit(1);
      }
      console.error(chalk.dim(`Free production analysis (${usage.used + 1}/${usage.limit} this month)`));
      usedFreeAnalysis = true;
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

    let freeUsageRecorded = false;
    for (const file of files.sort()) {
      const sql = await readFile(file, 'utf-8');
      const prodCtx = (opts.databaseUrl && !opts.offline && (isPro || usedFreeAnalysis))
        ? await fetchContext(sql, opts.databaseUrl)
        : undefined;
      if (usedFreeAnalysis && prodCtx && !freeUsageRecorded) {
        await recordFreeUsage();
        freeUsageRecorded = true;
      }
      const analysis = await analyzeSQLWithErrorHandling(sql, file, pgVersion, rules, prodCtx);
      analysis.violations = applySeverityOverrides(analysis.violations, config.rules);
      results.push(analysis);
      allViolations.push(...analysis.violations);

      if (opts.format === 'text') {
        console.log(formatCliOutput(analysis, { rules }));
      }
    }

    const checkElapsed = performance.now() - t0;

    let checkOutputStr: string | undefined;
    if (opts.format === 'json') {
      checkOutputStr = formatJsonMulti(results, rules);
    } else if (opts.format === 'sarif') {
      const sarifLog = buildCombinedSarifLog(
        results.map(r => ({ file: r.file, violations: r.violations })),
        rules,
      );
      checkOutputStr = JSON.stringify(sarifLog, null, 2);
    } else if (opts.format === 'text' && results.length > 1) {
      checkOutputStr = formatCheckSummary(results, { ruleCount: rules.length, elapsedMs: checkElapsed });
    }

    if (opts.output && checkOutputStr) {
      const { writeFile: writeOutputFile } = await import('node:fs/promises');
      await writeOutputFile(resolve(opts.output), checkOutputStr);
      console.log(`Report written to ${opts.output} (${allViolations.length} violation(s) across ${files.length} file(s))`);
    } else if (checkOutputStr) {
      console.log(checkOutputStr);
    }

    // Audit log (best-effort)
    const checkExitCode = getExitCode(failOn, allViolations);
    auditLog({
      event: 'check_complete',
      command: 'check',
      file: dirPath,
      violationCount: allViolations.length,
      exitCode: checkExitCode,
      metadata: { fileCount: files.length },
    }).catch(() => {});

    await showPostAnalysisMessages(allViolations.length > 0, opts.offline);
    exitWithCode(failOn, allViolations);
  });

/**
 * Warn the user if their license key is expired.
 */
function warnIfExpired(license: LicenseStatus): void {
  if (license.error === 'License expired') {
    console.error(chalk.yellow(`Warning: Your license expired on ${license.expiresAt?.toISOString().slice(0, 10)}.`));
    console.error(chalk.yellow('         Running with free tier rules. Renew at https://migrationpilot.dev/billing'));
  }
}

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
 * Compute exit code based on violation severities.
 * 0 = clean, 1 = warnings (when --fail-on warning), 2 = critical violations
 */
function getExitCode(failOn: string, violations: import('./rules/engine.js').RuleViolation[]): number {
  if (failOn === 'never') return 0;
  const hasCritical = violations.some(v => v.severity === 'critical');
  if (hasCritical) return 2;
  const hasWarning = violations.some(v => v.severity === 'warning');
  if (failOn === 'warning' && hasWarning) return 1;
  return 0;
}

function exitWithCode(failOn: string, violations: import('./rules/engine.js').RuleViolation[]): void {
  const code = getExitCode(failOn, violations);
  if (code > 0) process.exit(code);
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

/**
 * Show non-intrusive messages after analysis: star prompt, update check.
 */
async function showPostAnalysisMessages(hasViolations: boolean, offline?: boolean): Promise<void> {
  const [starMsg, updateMsg] = await Promise.all([
    maybeShowStarPrompt(hasViolations),
    offline ? Promise.resolve(null) : checkForUpdate('1.4.0'),
  ]);

  if (starMsg) console.error(chalk.dim(`\n${starMsg}`));
  if (updateMsg) console.error(chalk.yellow(`\n${updateMsg}`));
}

/**
 * Record analysis in history (best-effort, non-blocking).
 */
async function recordHistory(analysis: AnalysisOutput, file: string, ruleCount: number): Promise<void> {
  const entry: HistoryEntry = {
    timestamp: new Date().toISOString(),
    file,
    riskLevel: analysis.overallRisk.level,
    riskScore: analysis.overallRisk.score,
    violationCount: analysis.violations.length,
    criticalCount: analysis.violations.filter(v => v.severity === 'critical').length,
    warningCount: analysis.violations.filter(v => v.severity === 'warning').length,
    statementCount: analysis.statements.length,
    ruleCount,
  };
  await recordAnalysis(entry);
}

program
  .command('team')
  .description('Show team status, members, and seat usage (Enterprise/Team tier)')
  .option('--json', 'Output as JSON')
  .addHelpText('after', `
Examples:
  $ migrationpilot team
  $ migrationpilot team --json`)
  .action(async (opts: { json?: boolean }) => {
    const { config } = await loadConfig();

    if (!config.team?.org) {
      console.error(chalk.yellow('No team configuration found.'));
      console.error('Add a "team" section to your .migrationpilotrc.yml:');
      console.error(chalk.dim(`
team:
  org: "your-org"
  maxSeats: 25`));
      process.exit(1);
    }

    const { getTeamStatus, formatTeamStatus } = await import('./team/manage.js');
    const teamConfig = { ...config.team, org: config.team.org };
    const status = await getTeamStatus(teamConfig);

    if (opts.json) {
      console.log(JSON.stringify(status, null, 2));
    } else {
      console.log(chalk.bold.cyan('\nMigrationPilot Team Status\n'));
      console.log(formatTeamStatus(status));
    }
  });

program
  .command('login')
  .description('Authenticate with MigrationPilot (SSO/API key)')
  .option('--api-key <key>', 'Authenticate with an API key instead of SSO')
  .addHelpText('after', `
Examples:
  $ migrationpilot login
  $ migrationpilot login --api-key mp_live_xxxxx`)
  .action(async (opts: { apiKey?: string }) => {
    const { getAuthToken, saveAuthToken, validateApiKey, initiateDeviceFlow, pollDeviceCode } = await import('./auth/sso.js');

    const existing = await getAuthToken();
    if (existing) {
      console.log(chalk.green(`Already authenticated as ${existing.email}`));
      if (existing.orgName) console.log(chalk.dim(`Organization: ${existing.orgName}`));
      return;
    }

    if (opts.apiKey) {
      console.log('Validating API key...');
      const token = await validateApiKey(opts.apiKey);
      if (token) {
        await saveAuthToken(token);
        console.log(chalk.green(`Authenticated as ${token.email}`));
        if (token.orgName) console.log(chalk.dim(`Organization: ${token.orgName}`));
      } else {
        console.error(chalk.red('Invalid API key.'));
        process.exit(1);
      }
      return;
    }

    // Device code flow
    console.log('Initiating SSO login...');
    const deviceCode = await initiateDeviceFlow();

    console.log(`\nOpen this URL in your browser:\n  ${chalk.bold.cyan(deviceCode.verificationUrl)}\n`);
    console.log(`Enter code: ${chalk.bold.yellow(deviceCode.userCode)}\n`);
    console.log(chalk.dim('Waiting for authentication...'));

    const expiresAt = new Date(deviceCode.expiresAt).getTime();
    while (Date.now() < expiresAt) {
      await new Promise(resolve => setTimeout(resolve, deviceCode.interval * 1000));
      const token = await pollDeviceCode(deviceCode.deviceCode);
      if (token) {
        await saveAuthToken(token);
        console.log(chalk.green(`\nAuthenticated as ${token.email}`));
        if (token.orgName) console.log(chalk.dim(`Organization: ${token.orgName}`));
        return;
      }
    }

    console.error(chalk.red('\nAuthentication timed out. Please try again.'));
    process.exit(1);
  });

program
  .command('logout')
  .description('Remove stored authentication credentials')
  .action(async () => {
    const { clearAuthToken } = await import('./auth/sso.js');
    await clearAuthToken();
    console.log(chalk.green('Logged out successfully.'));
  });

program
  .command('policy')
  .description('Check organization policy compliance')
  .argument('<file>', 'Migration SQL file to check')
  .addHelpText('after', `
Examples:
  $ migrationpilot policy migration.sql`)
  .action(async (file: string) => {
    const { config } = await loadConfig();

    if (!config.policy) {
      console.error(chalk.yellow('No policy configuration found.'));
      console.error('Add a "policy" section to your .migrationpilotrc.yml:');
      console.error(chalk.dim(`
policy:
  requiredRules:
    - MP001
    - MP004
  severityFloor: warning
  blockedPatterns:
    - "DROP TABLE"
    - "TRUNCATE"`));
      process.exit(1);
    }

    const filePath = resolve(file);
    let sql: string;
    try {
      sql = await readFile(filePath, 'utf-8');
    } catch {
      console.error(formatFileError(filePath));
      process.exit(1);
    }

    const { enforcePolicy, formatPolicyViolations } = await import('./policy/enforce.js');
    const violations = enforcePolicy(config.policy, sql, config.rules ?? {});

    if (violations.length === 0) {
      console.log(chalk.green('All organization policies satisfied.'));
      return;
    }

    const lines = formatPolicyViolations(violations);
    for (const line of lines) {
      console.error(chalk.red(line));
    }

    const blocked = violations.filter(v => v.type === 'blocked_pattern');
    process.exit(blocked.length > 0 ? 2 : 1);
  });

program.parse();
