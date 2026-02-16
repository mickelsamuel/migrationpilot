/**
 * MigrationPilot — Programmatic API
 *
 * @example
 * ```typescript
 * import { analyzeSQL, allRules, formatJson } from 'migrationpilot';
 *
 * const result = await analyzeSQL(
 *   'CREATE INDEX idx ON users (email);',
 *   'migration.sql',
 *   17,
 *   allRules,
 * );
 *
 * console.log(result.overallRisk.level); // 'RED'
 * console.log(formatJson(result, allRules));
 * ```
 */
export { analyzeSQL, AnalysisError } from './analysis/analyze.js';
export { parseMigration } from './parser/parse.js';
export { extractTargets } from './parser/extract.js';
export type { ExtractedTarget } from './parser/extract.js';
export { allRules, runRules } from './rules/index.js';
export type { Rule, RuleViolation, RuleContext, Severity } from './rules/engine.js';
export { classifyLock } from './locks/classify.js';
export type { LockClassification, LockLevel } from './locks/classify.js';
export { calculateRisk } from './scoring/score.js';
export type { RiskScore, RiskLevel, RiskFactor, TableStats, AffectedQuery } from './scoring/score.js';
export { formatCliOutput } from './output/cli.js';
export type { AnalysisOutput, StatementResult, FormatOptions } from './output/cli.js';
export { formatJson, formatJsonMulti } from './output/json.js';
export type { JsonReport, JsonMultiReport, JsonViolation } from './output/json.js';
export { formatSarif, buildSarifLog } from './output/sarif.js';
export { formatMarkdown } from './output/markdown.js';
export { buildPRComment } from './output/pr-comment.js';
export { loadConfig, resolveRuleConfig } from './config/load.js';
export type { MigrationPilotConfig } from './config/load.js';
//# sourceMappingURL=index.d.ts.map