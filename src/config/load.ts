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

import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { Severity } from '../rules/engine.js';

export interface RuleConfig {
  enabled?: boolean;
  severity?: Severity;
  /** Custom threshold for rules that support it (e.g., MP013 query count, MP014 row count) */
  threshold?: number;
}

export interface MigrationPilotConfig {
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

const CONFIG_FILES = [
  '.migrationpilotrc.yml',
  '.migrationpilotrc.yaml',
  'migrationpilot.config.yml',
  'migrationpilot.config.yaml',
];

const DEFAULT_CONFIG: MigrationPilotConfig = {
  pgVersion: 17,
  failOn: 'critical',
  rules: {},
  thresholds: {
    highTrafficQueries: 10000,
    largeTableRows: 1000000,
    redScore: 50,
    yellowScore: 25,
  },
  ignore: [],
};

/**
 * Load configuration from the nearest config file.
 * Starts from `startDir` and walks up to root looking for config files.
 *
 * Returns the merged config (defaults + file) and the config file path if found.
 */
export async function loadConfig(startDir?: string): Promise<{ config: MigrationPilotConfig; configPath?: string }> {
  const dir = startDir || process.cwd();
  const result = await findAndLoadConfig(dir);

  if (!result) {
    return { config: { ...DEFAULT_CONFIG } };
  }

  return {
    config: mergeConfig(DEFAULT_CONFIG, result.config),
    configPath: result.path,
  };
}

/**
 * Search for a config file starting from `dir` and walking up.
 */
async function findAndLoadConfig(dir: string): Promise<{ config: MigrationPilotConfig; path: string } | null> {
  let current = resolve(dir);
  const root = dirname(current) === current ? current : undefined;

  for (let i = 0; i < 20; i++) { // Max 20 levels up
    // Check YAML config files
    for (const filename of CONFIG_FILES) {
      const filePath = resolve(current, filename);
      try {
        const content = await readFile(filePath, 'utf-8');
        const parsed = parseYaml(content) as MigrationPilotConfig;
        if (parsed && typeof parsed === 'object') {
          return { config: validateConfig(parsed), path: filePath };
        }
      } catch {
        // File doesn't exist or isn't valid YAML — continue
      }
    }

    // Check package.json
    try {
      const pkgPath = resolve(current, 'package.json');
      const content = await readFile(pkgPath, 'utf-8');
      const pkg = JSON.parse(content) as Record<string, unknown>;
      if (pkg.migrationpilot && typeof pkg.migrationpilot === 'object') {
        return {
          config: validateConfig(pkg.migrationpilot as MigrationPilotConfig),
          path: pkgPath,
        };
      }
    } catch {
      // No package.json or no migrationpilot key — continue
    }

    // Walk up
    const parent = dirname(current);
    if (parent === current || parent === root) break;
    current = parent;
  }

  return null;
}

/**
 * Validate and normalize a raw config object.
 */
function validateConfig(raw: MigrationPilotConfig): MigrationPilotConfig {
  const config: MigrationPilotConfig = {};

  if (typeof raw.pgVersion === 'number' && raw.pgVersion >= 9 && raw.pgVersion <= 20) {
    config.pgVersion = raw.pgVersion;
  }

  if (raw.failOn && ['critical', 'warning', 'never'].includes(raw.failOn)) {
    config.failOn = raw.failOn;
  }

  if (typeof raw.migrationPath === 'string') {
    config.migrationPath = raw.migrationPath;
  }

  if (raw.rules && typeof raw.rules === 'object') {
    config.rules = {};
    for (const [ruleId, ruleConfig] of Object.entries(raw.rules)) {
      if (typeof ruleConfig === 'boolean') {
        config.rules[ruleId] = ruleConfig;
      } else if (typeof ruleConfig === 'object' && ruleConfig !== null) {
        const rc: RuleConfig = {};
        if (typeof ruleConfig.enabled === 'boolean') rc.enabled = ruleConfig.enabled;
        if (ruleConfig.severity === 'critical' || ruleConfig.severity === 'warning') rc.severity = ruleConfig.severity;
        if (typeof ruleConfig.threshold === 'number') rc.threshold = ruleConfig.threshold;
        config.rules[ruleId] = rc;
      }
    }
  }

  if (raw.thresholds && typeof raw.thresholds === 'object') {
    config.thresholds = {};
    const t = raw.thresholds;
    if (typeof t.highTrafficQueries === 'number') config.thresholds.highTrafficQueries = t.highTrafficQueries;
    if (typeof t.largeTableRows === 'number') config.thresholds.largeTableRows = t.largeTableRows;
    if (typeof t.redScore === 'number') config.thresholds.redScore = t.redScore;
    if (typeof t.yellowScore === 'number') config.thresholds.yellowScore = t.yellowScore;
  }

  if (Array.isArray(raw.ignore)) {
    config.ignore = raw.ignore.filter((p): p is string => typeof p === 'string');
  }

  return config;
}

/**
 * Deep merge two configs. `override` values take precedence.
 */
function mergeConfig(base: MigrationPilotConfig, override: MigrationPilotConfig): MigrationPilotConfig {
  return {
    pgVersion: override.pgVersion ?? base.pgVersion,
    failOn: override.failOn ?? base.failOn,
    migrationPath: override.migrationPath ?? base.migrationPath,
    rules: { ...base.rules, ...override.rules },
    thresholds: { ...base.thresholds, ...override.thresholds },
    ignore: override.ignore ?? base.ignore,
  };
}

/**
 * Resolve whether a rule is enabled based on config.
 * Returns the effective severity if enabled, or null if disabled.
 */
export function resolveRuleConfig(
  ruleId: string,
  defaultSeverity: Severity,
  config: MigrationPilotConfig,
): { enabled: boolean; severity: Severity; threshold?: number } {
  const ruleConfig = config.rules?.[ruleId];

  if (ruleConfig === false) {
    return { enabled: false, severity: defaultSeverity };
  }

  if (ruleConfig === true || ruleConfig === undefined) {
    return { enabled: true, severity: defaultSeverity };
  }

  return {
    enabled: ruleConfig.enabled !== false,
    severity: ruleConfig.severity ?? defaultSeverity,
    threshold: ruleConfig.threshold,
  };
}

/**
 * Generate a default config file content for `migrationpilot init`.
 */
export function generateDefaultConfig(): string {
  return `# MigrationPilot Configuration
# https://migrationpilot.dev/docs/configuration

# Target PostgreSQL version
pgVersion: 17

# Fail CI on severity level: critical, warning, never
failOn: critical

# Default migration file pattern
# migrationPath: "migrations/**/*.sql"

# Per-rule configuration
# Set to false to disable, or customize severity/thresholds
rules:
  # MP001: true                    # require-concurrent-index (default: enabled)
  # MP004:
  #   severity: warning            # downgrade from critical to warning
  # MP013:
  #   threshold: 5000              # lower traffic threshold (default: 10000)
  # MP014:
  #   threshold: 500000            # lower row count threshold (default: 1000000)

# Production context thresholds
thresholds:
  highTrafficQueries: 10000        # MP013: min query count
  largeTableRows: 1000000          # MP014: min row count
  redScore: 50                     # Risk score threshold for RED
  yellowScore: 25                  # Risk score threshold for YELLOW

# Files to ignore (glob patterns)
# ignore:
#   - "migrations/seed_*.sql"
#   - "migrations/test_*.sql"
`;
}
