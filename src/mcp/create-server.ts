/**
 * MigrationPilot MCP server definition.
 *
 * Kept separate from `server.ts` so tests can build a server instance and drive
 * it over an in-memory transport without the stdio entrypoint running.
 *
 * Tools:
 * - analyze_migration      Analyze SQL for safety issues
 * - suggest_fix            Get safe alternatives for a specific rule violation
 * - explain_lock           Explain what lock a DDL statement acquires
 * - list_rules             List all available safety rules
 * - check_before_apply     Pass/fail gate to call before executing DDL
 * - analyze_migration_dir  Analyze every migration file in a directory
 * - get_rule               Full documentation for one rule
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { glob, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { analyzeSQL, AnalysisError } from '../analysis/analyze.js';
import { computeVerdict, isBlocking, normalizeFailOn } from '../analysis/verdict.js';
import { allRules, staticRules } from '../rules/index.js';
import { applySeverityOverrides } from '../rules/engine.js';
import type { Rule, RuleViolation } from '../rules/engine.js';
import { loadConfigFrom, resolveRuleConfig } from '../config/load.js';
import type { MigrationPilotConfig } from '../config/load.js';
import { classifyLock } from '../locks/classify.js';
import { parseMigration } from '../parser/parse.js';
import { extractTargets } from '../parser/extract.js';
import { isFixable, autoFix } from '../fixer/fix.js';

const VERSION = '1.6.0';
const DEFAULT_PG_VERSION = 17;

/** Wrap a JSON payload in the MCP text-content envelope. */
function json(payload: unknown, isError = false) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
    ...(isError && { isError: true }),
  };
}

/** Wrap a plain error string in the MCP text-content envelope. */
function fail(text: string) {
  return { content: [{ type: 'text' as const, text }], isError: true };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * The rules that run without a database connection, minus anything the user's
 * config disables. The MCP server never opens a database connection, so the
 * rules that read the live catalog would stay silent anyway.
 */
function rulesForConfig(config: MigrationPilotConfig): Rule[] {
  return staticRules.filter(r => resolveRuleConfig(r.id, r.severity, config).enabled);
}

/** Attach the rule-level docs the CLI's JSON output attaches to each violation. */
function decorateViolations(violations: RuleViolation[], failOn: string) {
  const byId = new Map(allRules.map(r => [r.id, r]));
  return violations.map(v => {
    const rule = byId.get(v.ruleId);
    return {
      ruleId: v.ruleId,
      ruleName: v.ruleName,
      severity: v.severity,
      message: v.message,
      line: v.line,
      blocking: isBlocking(v.severity, failOn),
      ...(v.safeAlternative && { safeAlternative: v.safeAlternative }),
      ...(rule?.whyItMatters && { whyItMatters: rule.whyItMatters }),
      ...(rule?.docsUrl && { docsUrl: rule.docsUrl }),
    };
  });
}

function countBySeverity(violations: RuleViolation[]) {
  return {
    critical: violations.filter(v => v.severity === 'critical').length,
    warning: violations.filter(v => v.severity === 'warning').length,
  };
}

/** One-line human summary of a gate decision. */
function gateSummary(verdict: string, violations: RuleViolation[], failOn: string, riskLevel: string): string {
  const { critical, warning } = countBySeverity(violations);
  const blockers = [...new Set(violations.filter(v => isBlocking(v.severity, failOn)).map(v => v.ruleId))];

  if (verdict === 'pass') {
    return violations.length === 0
      ? `PASS — no violations, risk ${riskLevel}. Safe to apply.`
      : `PASS — ${critical} critical, ${warning} warning(s), risk ${riskLevel}. None blocking at failOn=${failOn}.`;
  }

  return `FAIL — ${critical} critical, ${warning} warning(s), risk ${riskLevel}. Blocked by ${blockers.join(', ')} at failOn=${failOn}. Do not apply this migration; fix the blocking violations first.`;
}

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'migrationpilot',
    version: VERSION,
  });

  server.tool(
    'analyze_migration',
    'Analyze a PostgreSQL migration SQL for safety issues. Returns violations, risk level, and lock analysis.',
    {
      sql: z.string().describe('The SQL migration to analyze'),
      pg_version: z.number().optional().default(DEFAULT_PG_VERSION).describe('Target PostgreSQL version (default: 17)'),
    },
    async ({ sql, pg_version }) => {
      try {
        const result = await analyzeSQL(sql, '<mcp>', pg_version, staticRules);

        const summary = {
          riskLevel: result.overallRisk.level,
          riskScore: result.overallRisk.score,
          violationCount: result.violations.length,
          violations: result.violations.map(v => ({
            ruleId: v.ruleId,
            ruleName: v.ruleName,
            severity: v.severity,
            message: v.message,
            line: v.line,
            safeAlternative: v.safeAlternative,
          })),
          statements: result.statements.map(s => ({
            sql: s.sql,
            lockType: s.lock.lockType,
            blocksReads: s.lock.blocksReads,
            blocksWrites: s.lock.blocksWrites,
            longHeld: s.lock.longHeld,
            riskLevel: s.risk.level,
            riskScore: s.risk.score,
          })),
        };

        return json(summary);
      } catch (err) {
        return fail(`Analysis error: ${errorMessage(err)}`);
      }
    },
  );

  server.tool(
    'suggest_fix',
    'Auto-fix safe violations in a PostgreSQL migration SQL. Returns the fixed SQL and list of changes.',
    {
      sql: z.string().describe('The SQL migration to fix'),
      pg_version: z.number().optional().default(DEFAULT_PG_VERSION).describe('Target PostgreSQL version (default: 17)'),
    },
    async ({ sql, pg_version }) => {
      try {
        const result = await analyzeSQL(sql, '<mcp>', pg_version, staticRules);

        if (result.violations.length === 0) {
          return json({ message: 'No violations found. SQL is safe.', fixedSql: sql });
        }

        const fixResult = autoFix(sql, result.violations);

        return json({
          fixedSql: fixResult.fixedSql,
          fixedCount: fixResult.fixedCount,
          unfixableViolations: fixResult.unfixable.map(v => ({
            ruleId: v.ruleId,
            message: v.message,
            safeAlternative: v.safeAlternative,
          })),
          fixableRules: staticRules.filter(r => isFixable(r.id)).map(r => r.id),
        });
      } catch (err) {
        return fail(`Fix error: ${errorMessage(err)}`);
      }
    },
  );

  server.tool(
    'explain_lock',
    'Explain what PostgreSQL lock a DDL statement acquires and its impact.',
    {
      sql: z.string().describe('A single DDL statement to analyze'),
      pg_version: z.number().optional().default(DEFAULT_PG_VERSION).describe('Target PostgreSQL version (default: 17)'),
    },
    async ({ sql, pg_version }) => {
      try {
        const parsed = await parseMigration(sql);
        if (parsed.errors.length > 0) {
          return fail(`Parse error: ${parsed.errors.map(e => e.message).join('; ')}`);
        }

        const stmt = parsed.statements[0];
        if (!stmt) {
          return fail('No statement found in the provided SQL.');
        }

        const lock = classifyLock(stmt.stmt, pg_version);
        const targets = extractTargets(stmt.stmt);

        return json({
          lockType: lock.lockType,
          blocksReads: lock.blocksReads,
          blocksWrites: lock.blocksWrites,
          longHeld: lock.longHeld,
          affectedTables: targets.map(t => ({
            table: t.tableName,
            schema: t.schemaName,
            operation: t.operation,
          })),
          impact: lock.blocksReads && lock.blocksWrites
            ? 'Blocks ALL reads and writes. High outage risk on busy tables.'
            : lock.blocksWrites
              ? 'Blocks writes (INSERT/UPDATE/DELETE). Reads continue.'
              : 'Minimal impact. Does not block reads or writes.',
        });
      } catch (err) {
        return fail(`Error: ${errorMessage(err)}`);
      }
    },
  );

  server.tool(
    'list_rules',
    'List all available MigrationPilot safety rules with descriptions.',
    {},
    async () => {
      return json(staticRules.map(r => ({
        id: r.id,
        name: r.name,
        severity: r.severity,
        description: r.description,
        autoFixable: isFixable(r.id),
        docsUrl: r.docsUrl,
      })));
    },
  );

  server.tool(
    'check_before_apply',
    'Safety gate: call this BEFORE writing or executing any PostgreSQL DDL or migration. Resolves the project\'s own MigrationPilot config (rule toggles, severity overrides, failOn threshold) exactly like the CLI, then returns a pass/fail verdict. On "fail", do not apply the migration — fix the blocking violations and check again.',
    {
      sql: z.string().describe('The exact SQL that is about to be written or executed'),
      pgVersion: z.number().optional().describe('Target PostgreSQL version. Defaults to the config\'s pgVersion, or 17.'),
      configPath: z.string().optional().describe('Path to a config file, or a directory to resolve config from. Defaults to searching upward from the working directory, exactly like the CLI.'),
    },
    async ({ sql, pgVersion, configPath }) => {
      let config: MigrationPilotConfig;
      let resolvedConfigPath: string | undefined;
      try {
        const loaded = await loadConfigFrom(configPath);
        config = loaded.config;
        resolvedConfigPath = loaded.configPath;
      } catch (err) {
        return fail(`Config error: ${errorMessage(err)}`);
      }

      const failOn = normalizeFailOn(config.failOn);
      const pg = pgVersion ?? config.pgVersion ?? DEFAULT_PG_VERSION;
      const rules = rulesForConfig(config);

      try {
        const result = await analyzeSQL(sql, '<check_before_apply>', pg, rules);
        const violations = applySeverityOverrides(result.violations, config.rules);
        const verdict = computeVerdict(failOn, violations);

        return json({
          verdict,
          failOn,
          violations: decorateViolations(violations, failOn),
          summary: gateSummary(verdict, violations, failOn, result.overallRisk.level),
          pgVersion: pg,
          configPath: resolvedConfigPath ?? null,
          riskLevel: result.overallRisk.level,
          riskScore: result.overallRisk.score,
          counts: {
            ...countBySeverity(violations),
            blocking: violations.filter(v => isBlocking(v.severity, failOn)).length,
          },
          ruleCount: rules.length,
        });
      } catch (err) {
        if (err instanceof AnalysisError) {
          // The gate could not evaluate this SQL, so it must not report "pass".
          // Note this is a parse failure, not a rule violation: PostgreSQL 18-only
          // syntax is rejected by the bundled parser and needs a human read.
          return json({
            verdict: 'fail',
            failOn,
            violations: [],
            summary: `FAIL — MigrationPilot could not parse this SQL, so the safety gate did not run. This is a parse failure, not a rule violation: check the syntax, and note that PostgreSQL 18-only syntax is not yet parseable and needs manual review. Parse errors: ${err.parseErrors.join('; ')}`,
            pgVersion: pg,
            configPath: resolvedConfigPath ?? null,
            parseErrors: err.parseErrors,
          }, true);
        }
        return fail(`Analysis error: ${errorMessage(err)}`);
      }
    },
  );

  server.tool(
    'analyze_migration_dir',
    'Analyze every migration file in a directory. Returns per-file results plus an aggregate summary. Use this to audit a whole migrations folder before a release, or to find which existing migration introduced a risky pattern.',
    {
      path: z.string().describe('Path to the migrations directory'),
      pattern: z.string().optional().describe('Glob pattern for SQL files, relative to path (default: **/*.sql, or the config\'s migrationPath)'),
      pgVersion: z.number().optional().describe('Target PostgreSQL version. Defaults to the config\'s pgVersion, or 17.'),
    },
    async ({ path, pattern, pgVersion }) => {
      const dirPath = resolve(path);

      let config: MigrationPilotConfig;
      let resolvedConfigPath: string | undefined;
      try {
        const loaded = await loadConfigFrom(dirPath);
        config = loaded.config;
        resolvedConfigPath = loaded.configPath;
      } catch (err) {
        return fail(`Directory error: ${errorMessage(err)}`);
      }

      const failOn = normalizeFailOn(config.failOn);
      const pg = pgVersion ?? config.pgVersion ?? DEFAULT_PG_VERSION;
      const globPattern = pattern ?? config.migrationPath ?? '**/*.sql';
      const rules = rulesForConfig(config);

      const files: string[] = [];
      try {
        for await (const entry of glob(resolve(dirPath, globPattern))) {
          if (config.ignore?.length) {
            const relative = entry.replace(dirPath + '/', '').replace(dirPath + '\\', '');
            if (config.ignore.some(ig => relative.includes(ig.replace(/\*/g, '')))) continue;
          }
          files.push(entry);
        }
      } catch (err) {
        return fail(`Glob error: ${errorMessage(err)}`);
      }

      const fileResults: Array<Record<string, unknown>> = [];
      const errors: Array<{ file: string; error: string }> = [];
      const allViolations: RuleViolation[] = [];
      let worstScore = 0;
      let worstLevel = 'GREEN';

      for (const file of files.sort()) {
        let sql: string;
        try {
          sql = await readFile(file, 'utf-8');
        } catch (err) {
          errors.push({ file, error: errorMessage(err) });
          continue;
        }

        try {
          const result = await analyzeSQL(sql, file, pg, rules);
          const violations = applySeverityOverrides(result.violations, config.rules);
          allViolations.push(...violations);

          if (result.overallRisk.score > worstScore) {
            worstScore = result.overallRisk.score;
            worstLevel = result.overallRisk.level;
          }

          fileResults.push({
            file,
            riskLevel: result.overallRisk.level,
            riskScore: result.overallRisk.score,
            statementCount: result.statements.length,
            ...countBySeverity(violations),
            verdict: computeVerdict(failOn, violations),
            violations: decorateViolations(violations, failOn),
          });
        } catch (err) {
          // One unparseable file must not sink the whole sweep.
          errors.push({
            file,
            error: err instanceof AnalysisError ? err.parseErrors.join('; ') : errorMessage(err),
          });
        }
      }

      const counts = countBySeverity(allViolations);
      const verdict = computeVerdict(failOn, allViolations);
      const analyzed = fileResults.length;

      return json({
        path: dirPath,
        pattern: globPattern,
        pgVersion: pg,
        configPath: resolvedConfigPath ?? null,
        failOn,
        fileCount: files.length,
        files: fileResults,
        errors,
        aggregate: {
          verdict,
          filesAnalyzed: analyzed,
          filesSkipped: errors.length,
          totalViolations: allViolations.length,
          ...counts,
          worstRiskLevel: analyzed > 0 ? worstLevel : 'GREEN',
          worstRiskScore: worstScore,
          blockingFiles: fileResults.filter(f => f.verdict === 'fail').map(f => f.file),
          summary: files.length === 0
            ? `No files matched "${globPattern}" under ${dirPath}.`
            : `${verdict === 'fail' ? 'FAIL' : 'PASS'} — ${analyzed} file(s) analyzed, ${counts.critical} critical and ${counts.warning} warning(s), worst risk ${analyzed > 0 ? worstLevel : 'GREEN'}${errors.length > 0 ? `, ${errors.length} file(s) could not be parsed` : ''}.`,
        },
      });
    },
  );

  server.tool(
    'get_rule',
    'Get the full documentation for one MigrationPilot rule: what it reports, why it matters, whether it can be auto-fixed, and how to configure it. Call this when a violation ID appears and you need the reasoning behind it before rewriting a migration.',
    {
      ruleId: z.string().describe('Rule ID, e.g. MP001 (case-insensitive)'),
      sql: z.string().optional().describe('Optional SQL to run this one rule against. When the rule fires, the response carries the exact violation message and the concrete safe alternative for that statement.'),
    },
    async ({ ruleId, sql }) => {
      const id = ruleId.trim().toUpperCase();
      const rule = allRules.find(r => r.id === id);

      if (!rule) {
        const known = allRules.map(r => r.id);
        return fail(`Unknown rule: ${ruleId}. Valid rule IDs are ${known[0]}–${known[known.length - 1]}. Call list_rules for the full catalogue.`);
      }

      const doc: Record<string, unknown> = {
        ruleId: rule.id,
        name: rule.name,
        severity: rule.severity,
        requiresDatabaseUrl: rule.requiresDatabaseUrl === true,
        message: rule.description,
        whyItMatters: rule.whyItMatters,
        docsUrl: rule.docsUrl,
        autoFixable: isFixable(rule.id),
        safeAlternative: null as string | null,
        safeAlternativeNote: 'Safe alternatives are generated per statement. Pass `sql` to this tool, or call suggest_fix, to get a concrete rewrite.',
        config: {
          disable: `rules:\n  ${rule.id}: false`,
          changeSeverity: `rules:\n  ${rule.id}:\n    severity: ${rule.severity === 'critical' ? 'warning' : 'critical'}`,
          inlineDisable: `-- migrationpilot-disable ${rule.id}`,
        },
      };

      if (rule.requiresDatabaseUrl) {
        doc.databaseUrlNote = 'This rule needs production context from a live database (the CLI\'s --database-url). It does not run over MCP.';
      }

      if (sql) {
        try {
          const result = await analyzeSQL(sql, '<get_rule>', DEFAULT_PG_VERSION, [rule]);
          const hit = result.violations.find(v => v.ruleId === rule.id);
          doc.example = hit
            ? { sql, fires: true, message: hit.message, line: hit.line }
            : { sql, fires: false, message: `${rule.id} does not fire on this SQL.` };
          if (hit?.safeAlternative) {
            doc.safeAlternative = hit.safeAlternative;
            delete doc.safeAlternativeNote;
          }
        } catch (err) {
          doc.example = { sql, fires: false, error: `Could not parse the provided SQL: ${errorMessage(err)}` };
        }
      }

      return json(doc);
    },
  );

  return server;
}
