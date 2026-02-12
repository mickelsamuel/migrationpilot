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
import { fetchProductionContext } from './production/context.js';
import type { ProductionContext } from './production/context.js';
import type { StatementResult, AnalysisOutput } from './output/cli.js';

const program = new Command();

program
  .name('migrationpilot')
  .description('Know exactly what your PostgreSQL migration will do to production — before you merge.')
  .version('0.1.0');

program
  .command('analyze')
  .description('Analyze a SQL migration file for safety')
  .argument('<file>', 'Path to migration SQL file')
  .option('--pg-version <version>', 'Target PostgreSQL version', '17')
  .option('--format <format>', 'Output format: text, json', 'text')
  .option('--fail-on <severity>', 'Exit with code 1 on: critical, warning, never', 'critical')
  .option('--database-url <url>', 'PostgreSQL connection string for production context (Pro tier)')
  .action(async (file: string, opts: { pgVersion: string; format: string; failOn: string; databaseUrl?: string }) => {
    const pgVersion = parseInt(opts.pgVersion, 10);
    const filePath = resolve(file);

    let sql: string;
    try {
      sql = await readFile(filePath, 'utf-8');
    } catch {
      console.error(`Error: Cannot read file "${filePath}"`);
      process.exit(1);
    }

    const prodCtx = opts.databaseUrl
      ? await fetchContext(sql, opts.databaseUrl)
      : undefined;

    const analysis = await analyzeSQL(sql, filePath, pgVersion, prodCtx);

    if (opts.format === 'json') {
      console.log(JSON.stringify(analysis, null, 2));
    } else {
      console.log(formatCliOutput(analysis));
    }

    // Exit code based on violations
    if (opts.failOn !== 'never') {
      const hasCritical = analysis.violations.some(v => v.severity === 'critical');
      const hasWarning = analysis.violations.some(v => v.severity === 'warning');

      if (opts.failOn === 'critical' && hasCritical) process.exit(1);
      if (opts.failOn === 'warning' && (hasCritical || hasWarning)) process.exit(1);
    }
  });

program
  .command('check')
  .description('Check all migration files in a directory')
  .argument('<dir>', 'Path to migrations directory')
  .option('--pattern <glob>', 'Glob pattern for SQL files', '**/*.sql')
  .option('--pg-version <version>', 'Target PostgreSQL version', '17')
  .option('--format <format>', 'Output format: text, json', 'text')
  .option('--fail-on <severity>', 'Exit with code 1 on: critical, warning, never', 'critical')
  .option('--database-url <url>', 'PostgreSQL connection string for production context (Pro tier)')
  .action(async (dir: string, opts: { pattern: string; pgVersion: string; format: string; failOn: string; databaseUrl?: string }) => {
    const pgVersion = parseInt(opts.pgVersion, 10);
    const dirPath = resolve(dir);

    // Find SQL files
    const files: string[] = [];
    for await (const entry of glob(resolve(dirPath, opts.pattern))) {
      files.push(entry);
    }

    if (files.length === 0) {
      console.log(`No SQL files found in ${dirPath} matching "${opts.pattern}"`);
      process.exit(0);
    }

    let hasFailure = false;
    const results: AnalysisOutput[] = [];

    for (const file of files.sort()) {
      const sql = await readFile(file, 'utf-8');
      const prodCtx = opts.databaseUrl
        ? await fetchContext(sql, opts.databaseUrl)
        : undefined;
      const analysis = await analyzeSQL(sql, file, pgVersion, prodCtx);
      results.push(analysis);

      if (opts.format === 'text') {
        console.log(formatCliOutput(analysis));
      }

      const hasCritical = analysis.violations.some(v => v.severity === 'critical');
      const hasWarning = analysis.violations.some(v => v.severity === 'warning');

      if (opts.failOn === 'critical' && hasCritical) hasFailure = true;
      if (opts.failOn === 'warning' && (hasCritical || hasWarning)) hasFailure = true;
    }

    if (opts.format === 'json') {
      console.log(JSON.stringify(results, null, 2));
    }

    if (hasFailure) process.exit(1);
  });

/**
 * Extract all target table names from a SQL migration for production context lookup.
 */
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

async function analyzeSQL(sql: string, filePath: string, pgVersion: number, prodCtx?: ProductionContext): Promise<AnalysisOutput> {
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

  const violations = runRules(allRules, statementsWithLocks, pgVersion, prodCtx);

  const statementResults: StatementResult[] = statementsWithLocks.map(s => {
    const stmtViolations = violations.filter(v => v.line === s.line);
    // Feed production context into risk scoring
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

  // Overall risk = worst individual risk
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
