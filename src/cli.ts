#!/usr/bin/env node

import { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { glob } from 'node:fs/promises';
import { parseMigration } from './parser/parse.js';
import { extractTargets } from './parser/extract.js';
import { classifyLock } from './locks/classify.js';
import { allRules, runRules } from './rules/index.js';
import { calculateRisk } from './scoring/score.js';
import { formatCliOutput, formatCheckSummary } from './output/cli.js';
import { formatSarif, buildCombinedSarifLog } from './output/sarif.js';
import { fetchProductionContext } from './production/context.js';
import { validateLicense, isProOrAbove } from './license/validate.js';
import { loadConfig, resolveRuleConfig, generateDefaultConfig } from './config/load.js';
import { autoFix, isFixable } from './fixer/fix.js';
import { detectFrameworks, getSuggestedPattern } from './frameworks/detect.js';
import { startWatch } from './watch/watcher.js';
import { installPreCommitHook, uninstallPreCommitHook } from './hooks/install.js';
import { analyzeTransactions, isInTransaction } from './analysis/transaction.js';
import { formatPlan, estimateDuration } from './output/plan.js';
import type { PlanStatement, ExecutionPlan } from './output/plan.js';
import type { MigrationPilotConfig } from './config/load.js';
import type { ProductionContext } from './production/context.js';
import type { StatementResult, AnalysisOutput } from './output/cli.js';
import type { Rule } from './rules/engine.js';

const PRO_RULE_IDS = new Set(['MP013', 'MP014', 'MP019']);

const program = new Command();

program
  .name('migrationpilot')
  .description('Know exactly what your PostgreSQL migration will do to production — before you merge.')
  .version('0.3.0');

program
  .command('init')
  .description('Generate a .migrationpilotrc.yml config file')
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
  .command('detect')
  .description('Auto-detect migration framework and suggest configuration')
  .argument('[dir]', 'Directory to scan', '.')
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
    process.on('SIGINT', () => {
      stop();
      console.log('\nWatch mode stopped.');
      process.exit(0);
    });
  });

program
  .command('hook')
  .description('Install or uninstall git pre-commit hook')
  .argument('<action>', '"install" or "uninstall"')
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
      console.error(`Error: Cannot read file "${filePath}"`);
      process.exit(1);
    }

    const prodCtx = (opts.databaseUrl && isPro)
      ? await fetchContext(sql, opts.databaseUrl)
      : undefined;

    const rules = filterRules(isPro, config);
    const parsed = await parseMigration(sql);

    if (parsed.errors.length > 0) {
      console.error(`Parse errors in ${filePath}:`);
      for (const err of parsed.errors) console.error(`  ${err.message}`);
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
  .argument('<file>', 'Path to migration SQL file')
  .option('--pg-version <version>', 'Target PostgreSQL version')
  .option('--format <format>', 'Output format: text, json, sarif', 'text')
  .option('--fail-on <severity>', 'Exit with code 1 on: critical, warning, never')
  .option('--database-url <url>', 'PostgreSQL connection string for production context (Pro tier)')
  .option('--license-key <key>', 'License key for Pro features')
  .option('--fix', 'Auto-fix safe violations and write the fixed file')
  .option('--no-config', 'Ignore config file')
  .action(async (file: string, opts: { pgVersion?: string; format: string; failOn?: string; databaseUrl?: string; licenseKey?: string; config: boolean; fix?: boolean }) => {
    const { config, configPath } = opts.config !== false ? await loadConfig() : { config: {} as MigrationPilotConfig, configPath: undefined };
    if (configPath) console.error(`Using config: ${configPath}`);

    const pgVersion = parseInt(opts.pgVersion || String(config.pgVersion || 17), 10);
    const failOn = opts.failOn || config.failOn || 'critical';
    const filePath = resolve(file);
    const license = validateLicense(opts.licenseKey);
    const isPro = isProOrAbove(license);

    if (opts.databaseUrl && !isPro) {
      console.error('Error: --database-url requires a Pro license key.');
      console.error('       Pass --license-key <key> or set MIGRATIONPILOT_LICENSE_KEY.');
      console.error('       Get a key at https://migrationpilot.dev/pricing');
      process.exit(1);
    }

    let sql: string;
    try {
      sql = await readFile(filePath, 'utf-8');
    } catch {
      console.error(`Error: Cannot read file "${filePath}"`);
      process.exit(1);
    }

    const prodCtx = (opts.databaseUrl && isPro)
      ? await fetchContext(sql, opts.databaseUrl)
      : undefined;

    const rules = filterRules(isPro, config);
    const analysis = await analyzeSQL(sql, filePath, pgVersion, rules, prodCtx);

    if (opts.fix && analysis.violations.length > 0) {
      const { writeFile } = await import('node:fs/promises');
      const result = autoFix(sql, analysis.violations);

      if (result.fixedCount > 0) {
        await writeFile(filePath, result.fixedSql);
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

    if (opts.format === 'sarif') {
      console.log(formatSarif(analysis.violations, filePath, rules));
    } else if (opts.format === 'json') {
      console.log(JSON.stringify(analysis, null, 2));
    } else {
      console.log(formatCliOutput(analysis));
    }

    if (failOn !== 'never') {
      const hasCritical = analysis.violations.some(v => v.severity === 'critical');
      const hasWarning = analysis.violations.some(v => v.severity === 'warning');

      if (failOn === 'critical' && hasCritical) process.exit(1);
      if (failOn === 'warning' && (hasCritical || hasWarning)) process.exit(1);
    }
  });

program
  .command('check')
  .description('Check all migration files in a directory')
  .argument('<dir>', 'Path to migrations directory')
  .option('--pattern <glob>', 'Glob pattern for SQL files')
  .option('--pg-version <version>', 'Target PostgreSQL version')
  .option('--format <format>', 'Output format: text, json, sarif', 'text')
  .option('--fail-on <severity>', 'Exit with code 1 on: critical, warning, never')
  .option('--database-url <url>', 'PostgreSQL connection string for production context (Pro tier)')
  .option('--license-key <key>', 'License key for Pro features')
  .option('--no-config', 'Ignore config file')
  .action(async (dir: string, opts: { pattern?: string; pgVersion?: string; format: string; failOn?: string; databaseUrl?: string; licenseKey?: string; config: boolean }) => {
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

    const rules = filterRules(isPro, config);
    let hasFailure = false;
    const results: AnalysisOutput[] = [];

    for (const file of files.sort()) {
      const sql = await readFile(file, 'utf-8');
      const prodCtx = (opts.databaseUrl && isPro)
        ? await fetchContext(sql, opts.databaseUrl)
        : undefined;
      const analysis = await analyzeSQL(sql, file, pgVersion, rules, prodCtx);
      results.push(analysis);

      if (opts.format === 'text') {
        console.log(formatCliOutput(analysis));
      }

      const hasCritical = analysis.violations.some(v => v.severity === 'critical');
      const hasWarning = analysis.violations.some(v => v.severity === 'warning');

      if (failOn === 'critical' && hasCritical) hasFailure = true;
      if (failOn === 'warning' && (hasCritical || hasWarning)) hasFailure = true;
    }

    if (opts.format === 'json') {
      console.log(JSON.stringify(results, null, 2));
    } else if (opts.format === 'sarif') {
      const sarifLog = buildCombinedSarifLog(
        results.map(r => ({ file: r.file, violations: r.violations })),
        rules,
      );
      console.log(JSON.stringify(sarifLog, null, 2));
    } else if (opts.format === 'text' && results.length > 1) {
      console.log(formatCheckSummary(results));
    }

    if (hasFailure) process.exit(1);
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
    console.error(`Warning: Could not fetch production context: ${err instanceof Error ? err.message : err}`);
    return undefined;
  }
}

async function analyzeSQL(sql: string, filePath: string, pgVersion: number, rules: Rule[], prodCtx?: ProductionContext): Promise<AnalysisOutput> {
  const parsed = await parseMigration(sql);

  if (parsed.errors.length > 0) {
    console.error(`Parse errors in ${filePath}:`);
    for (const err of parsed.errors) {
      console.error(`  ${err.message}`);
    }
    process.exit(1);
  }

  const statementsWithLocks = parsed.statements.map(s => {
    const lock = classifyLock(s.stmt, pgVersion);
    const line = sql.slice(0, s.stmtLocation).split('\n').length;
    return { ...s, lock, line };
  });

  const violations = runRules(rules, statementsWithLocks, pgVersion, prodCtx, sql);

  const statementResults: StatementResult[] = statementsWithLocks.map(s => {
    const stmtViolations = violations.filter(v => v.line === s.line);
    const targets = extractTargets(s.stmt);
    const tableName = targets[0]?.tableName;
    const tableStats = tableName ? prodCtx?.tableStats.get(tableName) : undefined;
    const affectedQueries = tableName ? prodCtx?.affectedQueries.get(tableName) : undefined;
    const risk = calculateRisk(s.lock, tableStats, affectedQueries);
    return {
      sql: s.originalSql,
      lock: s.lock,
      risk,
      violations: stmtViolations,
    };
  });

  const worstStatement = statementResults.reduce(
    (worst, s) => s.risk.score > worst.risk.score ? s : worst,
    statementResults[0] ?? { risk: calculateRisk({ lockType: 'ACCESS SHARE' as const, blocksReads: false, blocksWrites: false, longHeld: false }) }
  );

  return {
    file: filePath,
    statements: statementResults,
    overallRisk: worstStatement.risk,
    violations,
  };
}

program.parse();
