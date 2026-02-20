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

// Core analysis
export { analyzeSQL, AnalysisError } from './analysis/analyze.js';

// Parser
export { parseMigration } from './parser/parse.js';
export { extractTargets } from './parser/extract.js';
export type { ExtractedTarget } from './parser/extract.js';

// Rules (public API exports free rules only — Pro rules require a license)
export { freeRules as allRules, freeRules, runRules } from './rules/index.js';
export type { Rule, RuleViolation, RuleContext, Severity } from './rules/engine.js';

// Lock classification
export { classifyLock } from './locks/classify.js';
export type { LockClassification, LockLevel } from './locks/classify.js';

// Risk scoring
export { calculateRisk } from './scoring/score.js';
export type { RiskScore, RiskLevel, RiskFactor, TableStats, AffectedQuery } from './scoring/score.js';

// Output formatters
export { formatCliOutput } from './output/cli.js';
export type { AnalysisOutput, StatementResult, FormatOptions } from './output/cli.js';
export { formatJson, formatJsonMulti } from './output/json.js';
export type { JsonReport, JsonMultiReport, JsonViolation } from './output/json.js';
export { formatSarif, buildSarifLog } from './output/sarif.js';
export { formatMarkdown } from './output/markdown.js';
export { buildPRComment } from './output/pr-comment.js';

// Auto-fix
export { autoFix, isFixable } from './fixer/fix.js';

// Rollback generation
export { generateRollback, formatRollbackSql } from './generator/rollback.js';
export type { RollbackResult, RollbackStatement } from './generator/rollback.js';

// Framework detection
export { detectFrameworks } from './frameworks/detect.js';

// Config
export { loadConfig, resolveRuleConfig } from './config/load.js';
export type { MigrationPilotConfig } from './config/load.js';

// Custom rules plugin system
export { loadPlugins } from './plugins/loader.js';
export type { Plugin, PluginRule, PluginLoadResult } from './plugins/loader.js';

// Schema simulation
export { simulateSchema, simulateSchemaAsync } from './schema/simulate.js';
export type { SchemaState, TableState, ColumnState, IndexState, ConstraintState, SequenceState } from './schema/simulate.js';

// Dependency graph
export { buildDependencyGraph } from './graph/dependencies.js';
export type { DependencyGraph, DependencyNode } from './graph/dependencies.js';

// Duration prediction
export { predictDuration } from './prediction/duration.js';
export type { DurationEstimate } from './prediction/duration.js';

// Lock queue simulation
export { simulateLockQueue } from './lockqueue/simulate.js';
export type { LockQueueResult } from './lockqueue/simulate.js';

// Expand-contract templates
export { generateTemplate } from './templates/expand-contract.js';
export type { MigrationTemplate } from './templates/expand-contract.js';

// Trigger cascade analysis
export { analyzeCascade } from './cascade/analyze.js';
export type { CascadeResult, TriggerInfo } from './cascade/analyze.js';

// Sequence overflow monitoring
export { analyzeSequenceFromSql } from './sequence/monitor.js';
export type { SequenceInfo } from './sequence/monitor.js';

// CLI output helpers
export { generateSuggestions, formatRichError } from './output/suggestions.js';

// Team management (enterprise)
export { getTeamStatus, registerTeamMember, formatTeamStatus, requiresApproval } from './team/manage.js';
export type { TeamConfig, TeamMember, TeamStatus, TeamActivity } from './team/manage.js';

// Policy enforcement (enterprise)
export { enforcePolicy, applyPolicy, checkBlockedPatterns, checkRequiredRules, formatPolicyViolations } from './policy/enforce.js';
export type { PolicyConfig, PolicyViolation } from './policy/enforce.js';

// SSO authentication (enterprise)
export { getAuthToken, isAuthenticated, getOrgInfo } from './auth/sso.js';
export type { AuthToken, SSOConfig } from './auth/sso.js';
