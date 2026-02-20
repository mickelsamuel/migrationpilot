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
  /** Custom rule plugin paths (ESLint-style) */
  plugins?: string[];
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
  /** Audit logging configuration (enterprise) */
  auditLog?: {
    enabled?: boolean;
    path?: string;
  };
  /** Team management configuration (enterprise/team tier) */
  team?: {
    org?: string;
    configUrl?: string;
    maxSeats?: number;
    requireApproval?: string[];
    adminEmail?: string;
  };
  /** Policy enforcement configuration (enterprise) */
  policy?: {
    requiredRules?: string[];
    severityFloor?: 'critical' | 'warning';
    blockedPatterns?: string[];
    requireReviewPatterns?: string[];
  };
}

const CONFIG_FILES = [
  '.migrationpilotrc.yml',
  '.migrationpilotrc.yaml',
  'migrationpilot.config.yml',
  'migrationpilot.config.yaml',
];

/** All rule IDs for preset generation */
const ALL_RULE_IDS = Array.from({ length: 80 }, (_, i) => `MP${String(i + 1).padStart(3, '0')}`);

/**
 * Built-in shareable presets.
 * Use `extends: "migrationpilot:recommended"` in config to inherit.
 */
const PRESETS: Record<string, MigrationPilotConfig> = {
  'migrationpilot:recommended': {
    failOn: 'critical',
    rules: {},
  },
  'migrationpilot:strict': {
    failOn: 'warning',
    rules: Object.fromEntries(
      ALL_RULE_IDS.map(id => [id, { severity: 'critical' as const }]),
    ),
  },
  'migrationpilot:ci': {
    failOn: 'critical',
    rules: {},
    ignore: [],
  },
  'migrationpilot:startup': {
    failOn: 'critical',
    rules: {
      MP037: false, MP038: false, MP039: false, MP040: false,
      MP041: false, MP042: false, MP045: false, MP048: false,
      MP061: false, MP068: false, MP074: false, MP075: false,
      MP076: false, MP077: false, MP078: false, MP079: false,
    },
  },
  'migrationpilot:enterprise': {
    failOn: 'warning',
    rules: {
      MP017: { severity: 'critical' as const }, MP022: { severity: 'critical' as const },
      MP028: { severity: 'critical' as const }, MP029: { severity: 'critical' as const },
      MP044: { severity: 'critical' as const }, MP052: { severity: 'critical' as const },
      MP067: { severity: 'critical' as const }, MP071: { severity: 'critical' as const },
      MP080: { severity: 'critical' as const },
    },
    thresholds: { highTrafficQueries: 5000, largeTableRows: 500000 },
    auditLog: { enabled: true },
  },
};

/**
 * Resolve a preset name to its config. Returns null if not a known preset.
 */
export function resolvePreset(name: string): MigrationPilotConfig | null {
  return PRESETS[name] ?? null;
}

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
export async function loadConfig(startDir?: string): Promise<{ config: MigrationPilotConfig; configPath?: string; warnings: string[] }> {
  const dir = startDir || process.cwd();
  const warnings: string[] = [];
  const result = await findAndLoadConfig(dir, warnings);

  if (!result) {
    return { config: { ...DEFAULT_CONFIG }, warnings };
  }

  // Resolve preset if extends is specified
  let base = DEFAULT_CONFIG;
  if (result.config.extends) {
    const preset = resolvePreset(result.config.extends);
    if (preset) {
      base = mergeConfig(DEFAULT_CONFIG, preset);
    }
  }

  return {
    config: mergeConfig(base, result.config),
    configPath: result.path,
    warnings,
  };
}

/**
 * Search for a config file starting from `dir` and walking up.
 */
async function findAndLoadConfig(dir: string, warnings: string[]): Promise<{ config: MigrationPilotConfig; path: string } | null> {
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
          return { config: validateConfig(parsed, warnings), path: filePath };
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
          config: validateConfig(pkg.migrationpilot as MigrationPilotConfig, warnings),
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

/** Known top-level config keys */
const KNOWN_KEYS = new Set([
  'extends', 'pgVersion', 'failOn', 'migrationPath',
  'rules', 'plugins', 'thresholds', 'ignore', 'auditLog',
  'team', 'policy',
]);

/**
 * Validate and normalize a raw config object.
 * Collects warnings for unknown keys (returned via loadConfig).
 */
function validateConfig(raw: MigrationPilotConfig, warnings?: string[]): MigrationPilotConfig {
  // Warn on unknown top-level keys
  if (warnings) {
    for (const key of Object.keys(raw)) {
      if (!KNOWN_KEYS.has(key)) {
        warnings.push(`Unknown config key "${key}" — will be ignored. Valid keys: ${[...KNOWN_KEYS].join(', ')}`);
      }
    }
  }

  const config: MigrationPilotConfig = {};

  if (typeof raw.extends === 'string' && raw.extends.length > 0) {
    const validPresets = ['migrationpilot:recommended', 'migrationpilot:strict', 'migrationpilot:ci', 'migrationpilot:startup', 'migrationpilot:enterprise'];
    if (validPresets.includes(raw.extends)) {
      config.extends = raw.extends;
    } else if (warnings) {
      warnings.push(`Unknown preset "${raw.extends}" — valid presets: ${validPresets.join(', ')}`);
    }
  }

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

  if (Array.isArray(raw.plugins)) {
    config.plugins = raw.plugins.filter((p): p is string => typeof p === 'string');
  }

  if (Array.isArray(raw.ignore)) {
    config.ignore = raw.ignore.filter((p): p is string => typeof p === 'string');
  }

  if (raw.auditLog && typeof raw.auditLog === 'object') {
    config.auditLog = {};
    if (typeof raw.auditLog.enabled === 'boolean') config.auditLog.enabled = raw.auditLog.enabled;
    if (typeof raw.auditLog.path === 'string') config.auditLog.path = raw.auditLog.path;
  }

  if (raw.team && typeof raw.team === 'object') {
    config.team = {};
    if (typeof raw.team.org === 'string') config.team.org = raw.team.org;
    if (typeof raw.team.configUrl === 'string') {
      if (raw.team.configUrl.startsWith('https://')) {
        config.team.configUrl = raw.team.configUrl;
      } else if (warnings) {
        warnings.push('team.configUrl must use HTTPS — ignoring insecure URL');
      }
    }
    if (typeof raw.team.maxSeats === 'number') config.team.maxSeats = raw.team.maxSeats;
    if (typeof raw.team.adminEmail === 'string') config.team.adminEmail = raw.team.adminEmail;
    if (Array.isArray(raw.team.requireApproval)) {
      config.team.requireApproval = raw.team.requireApproval.filter((p): p is string => typeof p === 'string');
    }
  }

  if (raw.policy && typeof raw.policy === 'object') {
    config.policy = {};
    if (Array.isArray(raw.policy.requiredRules)) {
      config.policy.requiredRules = raw.policy.requiredRules.filter((p): p is string => typeof p === 'string');
    }
    if (raw.policy.severityFloor === 'critical' || raw.policy.severityFloor === 'warning') {
      config.policy.severityFloor = raw.policy.severityFloor;
    }
    if (Array.isArray(raw.policy.blockedPatterns)) {
      config.policy.blockedPatterns = raw.policy.blockedPatterns.filter((p): p is string => typeof p === 'string');
    }
    if (Array.isArray(raw.policy.requireReviewPatterns)) {
      config.policy.requireReviewPatterns = raw.policy.requireReviewPatterns.filter((p): p is string => typeof p === 'string');
    }
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
    plugins: [...(base.plugins ?? []), ...(override.plugins ?? [])],
    thresholds: { ...base.thresholds, ...override.thresholds },
    ignore: override.ignore ?? base.ignore,
    auditLog: override.auditLog ?? base.auditLog,
    team: override.team ?? base.team,
    policy: override.policy ?? base.policy,
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

# Extend a built-in preset: recommended, strict, ci
# extends: "migrationpilot:recommended"

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
