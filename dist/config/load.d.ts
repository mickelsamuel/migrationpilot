/**
 * Configuration file loader for MigrationPilot.
 *
 * Searches for config files in priority order:
 * 1. .migrationpilotrc.yml
 * 2. .migrationpilotrc.yaml
 * 3. migrationpilot.config.yml
 * 4. migrationpilot.config.yaml
 * 5. package.json "migrationpilot" key
 *
 * Config supports:
 * - rules: enable/disable rules, override severity, set thresholds
 * - pgVersion: default PostgreSQL version
 * - failOn: default fail threshold
 * - migrationPath: default migration file pattern
 * - thresholds: custom thresholds for production context rules
 */
import type { Severity } from '../rules/engine.js';
export interface RuleConfig {
    enabled?: boolean;
    severity?: Severity;
    /** Custom threshold for rules that support it (e.g., MP013 query count, MP014 row count) */
    threshold?: number;
}
export interface MigrationPilotConfig {
    /** Extend a built-in preset: recommended, strict, ci */
    extends?: string;
    /** Target PostgreSQL version (default: 17) */
    pgVersion?: number;
    /** Fail CI on severity level (default: critical) */
    failOn?: 'critical' | 'warning' | 'never';
    /** Default migration path pattern */
    migrationPath?: string;
    /** Per-rule configuration */
    rules?: Record<string, RuleConfig | boolean>;
    /** Production context thresholds */
    thresholds?: {
        /** Minimum query count to trigger MP013 (default: 10000) */
        highTrafficQueries?: number;
        /** Minimum row count to trigger MP014 (default: 1000000) */
        largeTableRows?: number;
        /** Risk score threshold for RED (default: 50) */
        redScore?: number;
        /** Risk score threshold for YELLOW (default: 25) */
        yellowScore?: number;
    };
    /** Files/patterns to ignore */
    ignore?: string[];
}
/**
 * Resolve a preset name to its config. Returns null if not a known preset.
 */
export declare function resolvePreset(name: string): MigrationPilotConfig | null;
/**
 * Load configuration from the nearest config file.
 * Starts from `startDir` and walks up to root looking for config files.
 *
 * Returns the merged config (defaults + file) and the config file path if found.
 */
export declare function loadConfig(startDir?: string): Promise<{
    config: MigrationPilotConfig;
    configPath?: string;
}>;
/**
 * Resolve whether a rule is enabled based on config.
 * Returns the effective severity if enabled, or null if disabled.
 */
export declare function resolveRuleConfig(ruleId: string, defaultSeverity: Severity, config: MigrationPilotConfig): {
    enabled: boolean;
    severity: Severity;
    threshold?: number;
};
/**
 * Generate a default config file content for `migrationpilot init`.
 */
export declare function generateDefaultConfig(): string;
//# sourceMappingURL=load.d.ts.map