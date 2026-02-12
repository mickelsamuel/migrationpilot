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
import { formatCliOutput } from './output/cli.js';
import { formatSarif, buildCombinedSarifLog } from './output/sarif.js';
import { fetchProductionContext } from './production/context.js';
import { validateLicense, isProOrAbove } from './license/validate.js';
import { loadConfig, resolveRuleConfig, generateDefaultConfig } from './config/load.js';
import type { MigrationPilotConfig } from './config/load.js';
import type { ProductionContext } from './production/context.js';
import type { StatementResult, AnalysisOutput } from './output/cli.js';
import type { Rule } from './rules/engine.js';

const PRO_RULE_IDS = new Set(['MP013', 'MP014']);

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
  .command('analyze')
  .description('Analyze a SQL migration file for safety')
  .argument('<file>', 'Path to migration SQL file')
  .option('--pg-version <version>', 'Target PostgreSQL version')
  .option('--format <format>', 'Output format: text, json, sarif', 'text')
  .option('--fail-on <severity>', 'Exit with code 1 on: critical, warning, never')
  .option('--database-url <url>', 'PostgreSQL connection string for production context (Pro tier)')
  .option('--license-key <key>', 'License key for Pro features')
  .option('--no-config', 'Ignore config file')
  .action(async (file: string, opts: { pgVersion?: string; format: string; failOn?: string; databaseUrl?: string; licenseKey?: string; config: boolean }) => {
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
