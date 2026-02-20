/**
 * Custom rules plugin loader for MigrationPilot.
 *
 * Supports ESLint-style rule plugins loaded from config:
 *
 * ```yaml
 * plugins:
 *   - "./rules/my-custom-rule.js"
 *   - "migrationpilot-plugin-company"
 *
 * customRules:
 *   MY001:
 *     severity: critical
 * ```
 *
 * Plugin format:
 * ```typescript
 * export default {
 *   rules: [
 *     {
 *       id: 'MY001',
 *       name: 'my-custom-rule',
 *       severity: 'warning',
 *       description: 'What this rule checks',
 *       check(stmt, context) { return null; }
 *     }
 *   ]
 * };
 * ```
 */

import { resolve, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Rule, Severity, RuleViolation, RuleContext } from '../rules/engine.js';

export interface PluginRule {
  id: string;
  name: string;
  severity?: Severity;
  description?: string;
  whyItMatters?: string;
  docsUrl?: string;
  check: (stmt: Record<string, unknown>, context: RuleContext) => RuleViolation | null;
}

export interface Plugin {
  rules: PluginRule[];
}

export interface PluginLoadResult {
  rules: Rule[];
  errors: string[];
}

/**
 * Load custom rule plugins from the given paths.
 *
 * @param pluginPaths - Array of plugin module paths (relative to cwd or npm package names)
 * @param cwd - Working directory for resolving relative paths
 * @returns Loaded rules and any errors encountered
 */
export async function loadPlugins(pluginPaths: string[], cwd?: string): Promise<PluginLoadResult> {
  const rules: Rule[] = [];
  const errors: string[] = [];
  const workDir = cwd ?? process.cwd();

  for (const pluginPath of pluginPaths) {
    try {
      const resolved = resolvePluginPath(pluginPath, workDir);
      const mod = await importPlugin(resolved);

      if (!mod || !Array.isArray(mod.rules)) {
        errors.push(`Plugin "${pluginPath}" does not export a valid { rules: [...] } object`);
        continue;
      }

      for (const rule of mod.rules) {
        const validated = validatePluginRule(rule, pluginPath);
        if (validated.error) {
          errors.push(validated.error);
          continue;
        }
        if (validated.rule) {
          rules.push(validated.rule);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Failed to load plugin "${pluginPath}": ${msg}`);
    }
  }

  return { rules, errors };
}

/**
 * Resolve a plugin path to an absolute path or module name.
 */
function resolvePluginPath(pluginPath: string, cwd: string): string {
  // Relative paths
  if (pluginPath.startsWith('./') || pluginPath.startsWith('../')) {
    return resolve(cwd, pluginPath);
  }

  // Absolute paths
  if (isAbsolute(pluginPath)) {
    return pluginPath;
  }

  // npm package name — resolve from cwd's node_modules
  return resolve(cwd, 'node_modules', pluginPath);
}

/**
 * Import a plugin module. Handles both ESM and CJS.
 */
async function importPlugin(resolvedPath: string): Promise<Plugin | null> {
  try {
    // Use dynamic import with file URL for cross-platform support
    const fileUrl = pathToFileURL(resolvedPath).href;
    const mod = await import(fileUrl);
    return (mod.default ?? mod) as Plugin;
  } catch {
    // Fallback: try require for CJS modules
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require(resolvedPath);
      return (mod.default ?? mod) as Plugin;
    } catch {
      throw new Error(`Could not import module (tried ESM and CJS)`);
    }
  }
}

/**
 * Validate a single rule from a plugin.
 */
function validatePluginRule(
  raw: unknown,
  pluginPath: string,
): { rule?: Rule; error?: string } {
  if (!raw || typeof raw !== 'object') {
    return { error: `Plugin "${pluginPath}" contains an invalid rule entry` };
  }

  const r = raw as Record<string, unknown>;

  if (typeof r.id !== 'string' || r.id.length === 0) {
    return { error: `Plugin "${pluginPath}" contains a rule without an id` };
  }

  // Custom rules must not use the MP prefix (reserved for built-in rules)
  if (r.id.startsWith('MP') && /^MP\d{3}$/.test(r.id)) {
    return { error: `Plugin "${pluginPath}" rule "${r.id}" uses reserved MP prefix` };
  }

  if (typeof r.check !== 'function') {
    return { error: `Plugin "${pluginPath}" rule "${r.id}" is missing a check() function` };
  }

  const severity = (r.severity === 'critical' || r.severity === 'warning') ? r.severity : 'warning';

  const rule: Rule = {
    id: r.id,
    name: typeof r.name === 'string' ? r.name : r.id,
    severity,
    description: typeof r.description === 'string' ? r.description : '',
    whyItMatters: typeof r.whyItMatters === 'string' ? r.whyItMatters : '',
    docsUrl: typeof r.docsUrl === 'string' ? r.docsUrl : '',
    check: r.check as Rule['check'],
  };

  return { rule };
}
