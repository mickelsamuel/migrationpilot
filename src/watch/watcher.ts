/**
 * Watch mode for MigrationPilot.
 *
 * Watches migration SQL files for changes and re-analyzes on save.
 * Uses Node.js fs.watch with a debounce to avoid duplicate triggers.
 */

import { watch } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve, relative, extname } from 'node:path';
import { glob } from 'node:fs/promises';
import { parseMigration } from '../parser/parse.js';
import { classifyLock } from '../locks/classify.js';
import { runRules } from '../rules/index.js';
import { formatCliOutput } from '../output/cli.js';
import { calculateRisk } from '../scoring/score.js';
import { extractTargets } from '../parser/extract.js';
import type { Rule } from '../rules/engine.js';
import type { StatementResult, AnalysisOutput } from '../output/cli.js';

export interface WatchOptions {
  dir: string;
  pattern: string;
  pgVersion: number;
  rules: Rule[];
  onAnalysis?: (file: string, output: string, violations: number) => void;
  onError?: (file: string, error: string) => void;
}

/**
 * Start watching a directory for migration file changes.
 * Returns a cleanup function to stop watching.
 */
export async function startWatch(opts: WatchOptions): Promise<() => void> {
  const { dir, pattern, pgVersion, rules, onAnalysis, onError } = opts;
  const dirPath = resolve(dir);
  const abortController = new AbortController();

  // Track debounce timers per file
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  // Scan initial files
  const initialFiles: string[] = [];
  for await (const entry of glob(resolve(dirPath, pattern))) {
    initialFiles.push(entry);
  }

  if (onAnalysis) {
    onAnalysis('', `Watching ${initialFiles.length} file(s) in ${dirPath} (pattern: ${pattern})`, 0);
  }

  // Analyze a single file
  async function analyzeFile(filePath: string): Promise<void> {
    const relPath = relative(dirPath, filePath);

    try {
      const sql = await readFile(filePath, 'utf-8');
      if (sql.trim().length === 0) return;

      const parsed = await parseMigration(sql);
      if (parsed.errors.length > 0) {
        if (onError) onError(relPath, `Parse errors: ${parsed.errors.map(e => e.message).join(', ')}`);
        return;
      }

      const statementsWithLocks = parsed.statements.map(s => {
        const lock = classifyLock(s.stmt, pgVersion);
        const line = sql.slice(0, s.stmtLocation).split('\n').length;
        return { ...s, lock, line };
      });

      const violations = runRules(rules, statementsWithLocks, pgVersion, undefined, sql);

      const statementResults: StatementResult[] = statementsWithLocks.map(s => {
        const stmtViolations = violations.filter(v => v.line === s.line);
        const risk = calculateRisk(s.lock);
        return { sql: s.originalSql, lock: s.lock, risk, violations: stmtViolations };
      });

      const worstStatement = statementResults.reduce(
        (worst, s) => s.risk.score > worst.risk.score ? s : worst,
        statementResults[0] ?? { risk: calculateRisk({ lockType: 'ACCESS SHARE' as const, blocksReads: false, blocksWrites: false, longHeld: false }) }
      );

      const analysis: AnalysisOutput = {
        file: filePath,
        statements: statementResults,
        overallRisk: worstStatement.risk,
        violations,
      };

      const output = formatCliOutput(analysis);
      if (onAnalysis) onAnalysis(relPath, output, violations.length);
    } catch (err) {
      if (onError) onError(relPath, err instanceof Error ? err.message : String(err));
    }
  }

  // Watch the directory
  try {
    const watcher = watch(dirPath, { recursive: true, signal: abortController.signal });

    watcher.on('change', (_eventType, filename) => {
      if (!filename) return;
      const fname = String(filename);

      // Only process SQL files
      if (extname(fname).toLowerCase() !== '.sql') return;

      const fullPath = resolve(dirPath, fname);

      // Debounce: wait 200ms after last change
      const existing = timers.get(fullPath);
      if (existing) clearTimeout(existing);

      timers.set(fullPath, setTimeout(() => {
        timers.delete(fullPath);
        analyzeFile(fullPath);
      }, 200));
    });

    watcher.on('error', (err) => {
      if (onError) onError('watcher', err.message);
    });
  } catch (err) {
    if (onError) onError('watcher', `Could not start watcher: ${err instanceof Error ? err.message : err}`);
  }

  // Run initial analysis on all existing files
  for (const file of initialFiles) {
    await analyzeFile(file);
  }

  // Return cleanup function
  return () => {
    abortController.abort();
    for (const timer of timers.values()) {
      clearTimeout(timer);
    }
    timers.clear();
  };
}
