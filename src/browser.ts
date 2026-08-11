/**
 * MigrationPilot — browser entrypoint.
 *
 * Bundled by scripts/build-playground.js into site/public/playground/engine.js,
 * which is what the /playground page loads. It pulls in the pure analysis path
 * only — parser, lock classification, rules, scoring, JSON report — so the whole
 * rule set runs in the visitor's browser and the SQL never leaves the page.
 *
 * Keep this file free of anything that reaches for the filesystem, a config
 * file, a database, or the CLI formatters (chalk/cli-table3). Those drag in
 * Node built-ins that cannot be bundled for a browser.
 */

import { loadModule } from 'libpg-query';
import { analyzeSQL, AnalysisError } from './analysis/analyze.js';
import { allRules, PRO_RULE_IDS } from './rules/index.js';
import { formatJson } from './output/json.js';
import type { JsonReport } from './output/json.js';
import type { AnalysisOutput } from './output/cli.js';

/** Stand-in filename for the report — the playground has no file on disk. */
const FILE_LABEL = 'playground.sql';

/** Big enough for any real migration, small enough that a paste can't hang the tab. */
const MAX_SQL_BYTES = 100_000;

export interface PlaygroundReport extends JsonReport {
  /** Set when the SQL could not be parsed. Every other field is empty. */
  parseError?: string;
}

export interface ProductionRuleInfo {
  id: string;
  name: string;
  description: string;
  docsUrl: string;
}

/** How many rules ship in this bundle — the full built-in set. */
export const ruleCount: number = allRules.length;

/**
 * Rules that can only fire against a live database (`--database-url`). They score
 * table size, query traffic, and connection counts, none of which a browser can see,
 * so they stay silent here rather than being quietly missing.
 */
export const productionRules: ProductionRuleInfo[] = allRules
  .filter(r => PRO_RULE_IDS.has(r.id))
  .map(r => ({ id: r.id, name: r.name, description: r.description, docsUrl: r.docsUrl }));

/** Compile the PostgreSQL parser WASM up front so the first analysis is instant. */
export async function warmup(): Promise<void> {
  await loadModule();
}

/**
 * Analyze a migration entirely in the browser.
 *
 * @param sql - Raw migration SQL
 * @param pgVersion - Target PostgreSQL major version
 * @returns The same report shape `migrationpilot analyze --format json` prints,
 *          plus `parseError` when the SQL could not be parsed.
 */
export async function analyzeMigration(sql: string, pgVersion: number): Promise<PlaygroundReport> {
  if (!Number.isInteger(pgVersion) || pgVersion < 9 || pgVersion > 25) {
    return emptyReport('Unsupported PostgreSQL version.');
  }
  if (!sql.trim()) {
    return emptyReport();
  }
  if (new TextEncoder().encode(sql).length > MAX_SQL_BYTES) {
    return emptyReport(`Migration is over ${MAX_SQL_BYTES / 1000}KB. Split it up, or run the CLI on the file.`);
  }

  try {
    const analysis = await analyzeSQL(sql, FILE_LABEL, pgVersion, allRules);
    return toReport(analysis);
  } catch (err) {
    if (err instanceof AnalysisError) {
      return emptyReport(err.parseErrors.join('; '));
    }
    return emptyReport(err instanceof Error ? err.message : String(err));
  }
}

/**
 * Run the analysis through the CLI's own JSON formatter so the playground and
 * `--format json` can never drift apart, then hand back the parsed object.
 */
function toReport(analysis: AnalysisOutput): PlaygroundReport {
  return JSON.parse(formatJson(analysis, allRules)) as PlaygroundReport;
}

function emptyReport(parseError?: string): PlaygroundReport {
  const report = toReport({
    file: FILE_LABEL,
    statements: [],
    overallRisk: { level: 'GREEN', score: 0, factors: [] },
    violations: [],
  });
  return parseError ? { ...report, parseError } : report;
}
