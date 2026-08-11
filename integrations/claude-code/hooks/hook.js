#!/usr/bin/env node
'use strict';

/**
 * MigrationPilot PreToolUse hook for Claude Code.
 *
 * Intercepts writes to migration SQL files and shell commands that run
 * migrations, analyzes the SQL with MigrationPilot, and blocks (exit 2) when
 * the project's own config says the migration would fail CI.
 *
 * Design rule: FAIL OPEN. If MigrationPilot is not installed, the SQL will not
 * parse, the binary times out, or anything else goes sideways, the tool call is
 * allowed through with at most a note on stderr. A guardrail that breaks the
 * user's workflow when it can't run gets uninstalled, and then it guards
 * nothing. The only path that blocks is: we ran MigrationPilot, it returned
 * valid JSON, and it reported blocking violations.
 *
 * Environment:
 *   MIGRATIONPILOT_HOOK_DISABLE=1     Turn the hook off entirely.
 *   MIGRATIONPILOT_HOOK_FAILON=...    critical | warning | never. Overrides the
 *                                     project config's failOn for this hook.
 *   MIGRATIONPILOT_BIN=...            Path to the migrationpilot binary.
 *                                     Disables the npx fallback.
 *   MIGRATIONPILOT_HOOK_PATHS=a,b     Extra path substrings treated as migration
 *                                     directories.
 *   MIGRATIONPILOT_HOOK_TIMEOUT=ms    Per-analysis timeout (default 20000).
 */

const { spawnSync } = require('node:child_process');
const { readFileSync } = require('node:fs');

const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_REPORTED_VIOLATIONS = 12;

/** Directory fragments that mean "this .sql file is a migration". */
const MIGRATION_PATH_HINTS = [
  'migration', 'migrations', 'migrate', 'db/migrate', 'alembic/versions',
  'prisma/migrations', 'supabase/migrations', 'sqitch', 'flyway', 'liquibase',
  'changelog', 'changesets', 'schema', 'ddl', 'sql/deploy', 'sql/revert',
];

/** Filenames that are migrations wherever they live (versioned conventions). */
const MIGRATION_FILE_PATTERNS = [
  /^V\d[\w.]*__/i,          // Flyway: V1__init.sql, V1.2__add_index.sql
  /^\d{3,}[-_]/,            // 001_init.sql, 20240101120000_add_index.sql
  /\.(up|down)\.sql$/i,     // golang-migrate, dbmate
  /^(up|down)\.sql$/i,      // sqlx, sqitch-style directories
];

/** Shell commands that apply migrations to a database. */
const MIGRATION_COMMAND_PATTERNS = [
  // psql only counts when it is actually executing SQL — `psql -l` and a bare
  // interactive session are not migrations and must not cost a spawn.
  /\bpsql\b(?=[^|;&]*(?:\s-f\b|\s--file\b|\s-c\b|\s--command\b|<|\.sql\b))/,
  /\bprisma\s+(migrate|db\s+(push|execute))\b/,
  /\bknex\s+migrate:/,
  /\bsequelize\s+db:migrate/,
  /\b(rails|rake)\s+db:migrate/,
  /\balembic\s+(upgrade|downgrade)\b/,
  /\bflyway\b.*\b(migrate|repair)\b/,
  /\bliquibase\b.*\b(update|updateSQL)\b/i,
  /\bgoose\b.*\b(up|up-to|redo)\b/,
  /\bdbmate\s+(up|migrate)\b/,
  /\bsqitch\s+deploy\b/,
  /\batlas\s+migrate\s+apply\b/,
  /\bmigrate\b.*-path\b.*\bup\b/,        // golang-migrate
  /\bsqlx\s+migrate\s+run\b/,
  /\bdrizzle-kit\s+(push|migrate)\b/,
  /\btypeorm\s+migration:run\b/,
  /\bmanage\.py\s+migrate\b/,            // Django
  /\bnode-pg-migrate\s+up\b/,
  /\bpgm\s+up\b/,
];

function main() {
  if (isTruthy(process.env.MIGRATIONPILOT_HOOK_DISABLE)) return allow();

  const payload = readPayload();
  if (!payload) return allow();

  const toolName = String(payload.tool_name || '');
  const toolInput = payload.tool_input || {};

  let candidates;
  try {
    candidates = collectCandidates(toolName, toolInput);
  } catch (err) {
    return allow(`MigrationPilot hook: could not inspect this ${toolName} call (${err.message}). Allowing.`);
  }

  if (!candidates || candidates.length === 0) return allow();

  // A migration runner with no SQL we can reach: advise, never block.
  const analyzable = candidates.filter(c => c.sql && c.sql.trim().length > 0);
  if (analyzable.length === 0) {
    return advise(
      'MigrationPilot did not see the SQL this command will run, so it could not check it. ' +
      'Before running it, check the migrations directly — for example `migrationpilot check ./migrations` ' +
      'or the `check_before_apply` MCP tool.',
    );
  }

  const failOn = normalizeFailOn(process.env.MIGRATIONPILOT_HOOK_FAILON);
  const blocking = [];
  const advisory = [];
  let ranAtLeastOnce = false;
  const notes = [];

  for (const candidate of analyzable) {
    const result = analyze(candidate.sql, failOn);

    if (!result.ok) {
      notes.push(`${candidate.label}: ${result.reason}`);
      continue;
    }

    ranAtLeastOnce = true;
    const violations = Array.isArray(result.report.violations) ? result.report.violations : [];
    if (violations.length === 0) continue;

    const blockers = violations.filter(v => isBlocking(v.severity, failOn, result.exitCode));
    if (blockers.length > 0) {
      blocking.push({ label: candidate.label, violations: blockers, report: result.report });
    } else {
      advisory.push({ label: candidate.label, violations, report: result.report });
    }
  }

  if (blocking.length > 0) return block(formatReport(blocking, failOn));

  if (!ranAtLeastOnce) {
    // Nothing was actually checked — say why once, then get out of the way.
    return allow(notes.length > 0
      ? `MigrationPilot hook: ${notes.join(' | ')}. Allowing.`
      : 'MigrationPilot hook: nothing to check. Allowing.');
  }

  if (advisory.length > 0) return advise(formatAdvisory(advisory));

  return allow();
}

// ---------------------------------------------------------------------------
// Hook protocol
// ---------------------------------------------------------------------------

/** Allow the tool call. Anything written to stderr here is logged, not shown. */
function allow(stderrNote) {
  if (stderrNote) process.stderr.write(`${stderrNote}\n`);
  process.exit(0);
}

/** Allow the tool call, but hand Claude the findings as context. */
function advise(context) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: context,
    },
  }));
  process.exit(0);
}

/** Block the tool call. On exit 2, stderr is what Claude is shown. */
function block(message) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

function readPayload() {
  let raw;
  try {
    raw = readFileSync(0, 'utf8');
  } catch {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// What to check
// ---------------------------------------------------------------------------

/**
 * Turn a tool call into a list of {label, sql} to analyze.
 * Returns an empty list when the call has nothing to do with migrations.
 */
function collectCandidates(toolName, toolInput) {
  if (toolName === 'Write' || toolName === 'Edit' || toolName === 'MultiEdit') {
    const filePath = toolInput.file_path || toolInput.path || toolInput.filePath;
    if (!filePath || !isMigrationSqlPath(filePath)) return [];
    const sql = resolveFileContent(toolName, toolInput, filePath);
    return sql ? [{ label: filePath, sql }] : [];
  }

  if (toolName === 'Bash' || toolName === 'BashOutput') {
    const command = toolInput.command;
    if (typeof command !== 'string' || !isMigrationCommand(command)) return [];
    return candidatesFromCommand(command);
  }

  return [];
}

/**
 * The file content as it would exist after the edit.
 *
 * Analyzing only an edit's replacement text usually yields an unparseable
 * fragment, so reconstruct the whole file where possible and fall back to the
 * fragment otherwise.
 */
function resolveFileContent(toolName, toolInput, filePath) {
  if (toolName === 'Write') {
    return firstString(toolInput.content, toolInput.file_text, toolInput.new_string);
  }

  const edits = toolName === 'MultiEdit' && Array.isArray(toolInput.edits)
    ? toolInput.edits
    : [{ old_string: toolInput.old_string, new_string: toolInput.new_string }];

  let current;
  try {
    current = readFileSync(filePath, 'utf8');
  } catch {
    current = null;
  }

  if (current !== null) {
    let applied = current;
    let allApplied = true;
    for (const edit of edits) {
      const oldStr = firstString(edit.old_string, edit.oldString);
      const newStr = firstString(edit.new_string, edit.newString, edit.content, edit.file_text) ?? '';
      if (typeof oldStr !== 'string' || oldStr.length === 0 || !applied.includes(oldStr)) {
        allApplied = false;
        break;
      }
      applied = edit.replace_all
        ? applied.split(oldStr).join(newStr)
        : applied.replace(oldStr, newStr);
    }
    if (allApplied) return applied;
  }

  // Could not reconstruct the file — check the new text on its own.
  const fragments = edits
    .map(e => firstString(e.new_string, e.newString, e.content, e.file_text))
    .filter(Boolean);
  return fragments.length > 0 ? fragments.join('\n') : null;
}

function isMigrationSqlPath(filePath) {
  const normalized = String(filePath).replace(/\\/g, '/');
  if (!/\.sql$/i.test(normalized)) return false;

  const lower = normalized.toLowerCase();
  const extra = (process.env.MIGRATIONPILOT_HOOK_PATHS || '')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

  for (const hint of [...MIGRATION_PATH_HINTS, ...extra]) {
    if (lower.includes(`/${hint}/`) || lower.includes(`${hint}/`)) return true;
  }

  const filename = normalized.slice(normalized.lastIndexOf('/') + 1);
  return MIGRATION_FILE_PATTERNS.some(re => re.test(filename));
}

function isMigrationCommand(command) {
  const extra = (process.env.MIGRATIONPILOT_HOOK_BASH_PATTERNS || '')
    .split(',').map(s => s.trim()).filter(Boolean)
    .map(s => new RegExp(s));
  return [...MIGRATION_COMMAND_PATTERNS, ...extra].some(re => re.test(command));
}

/**
 * Pull analyzable SQL out of a shell command: inline `-c "…"` statements and
 * any .sql files it reads. Returns candidates with no `sql` when a runner was
 * recognised but its SQL is out of reach, which downgrades the hook to advice.
 */
function candidatesFromCommand(command) {
  const candidates = [];
  const seen = new Set();

  for (const match of command.matchAll(/(?:^|\s)(?:-c|--command)[= ]\s*(["'])([\s\S]*?)\1/g)) {
    const sql = match[2];
    if (sql && sql.trim()) candidates.push({ label: 'inline SQL', sql });
  }

  for (const match of command.matchAll(/(?:^|[\s<="'])([^\s<>|;&"']+\.sql)\b/gi)) {
    const file = match[1];
    if (seen.has(file)) continue;
    seen.add(file);
    try {
      candidates.push({ label: file, sql: readFileSync(file, 'utf8') });
    } catch {
      // Unreadable path (relative to another cwd, generated at runtime, …).
    }
  }

  return candidates.length > 0 ? candidates : [{ label: command, sql: null }];
}

// ---------------------------------------------------------------------------
// Running MigrationPilot
// ---------------------------------------------------------------------------

/**
 * Analyze SQL. Returns {ok:true, report, exitCode} only when MigrationPilot
 * actually ran and produced valid JSON; {ok:false, reason} in every other case.
 */
function analyze(sql, failOn) {
  const explicitBin = process.env.MIGRATIONPILOT_BIN;
  const attempts = explicitBin
    ? [{ bin: explicitBin, prefix: [] }]
    : [{ bin: 'migrationpilot', prefix: [] }, { bin: 'npx', prefix: ['--no-install', 'migrationpilot'] }];

  const args = ['analyze', '--stdin', '--format', 'json', '--offline'];
  // Only override the project's own failOn when the user asked us to.
  if (process.env.MIGRATIONPILOT_HOOK_FAILON) args.push('--fail-on', failOn);

  const timeout = Number(process.env.MIGRATIONPILOT_HOOK_TIMEOUT) || DEFAULT_TIMEOUT_MS;
  let lastReason = 'migrationpilot is not installed';

  const useShell = process.platform === 'win32';

  for (const attempt of attempts) {
    // Under shell mode the argv is re-joined into a command line, so a binary
    // path with spaces ("C:\Program Files\...") has to carry its own quotes.
    const bin = useShell && /\s/.test(attempt.bin) && !attempt.bin.startsWith('"')
      ? `"${attempt.bin}"`
      : attempt.bin;

    let result;
    try {
      result = spawnSync(bin, [...attempt.prefix, ...args], {
        input: sql,
        encoding: 'utf8',
        timeout,
        shell: useShell,
        windowsHide: true,
      });
    } catch (err) {
      lastReason = `could not run ${attempt.bin} (${err.message})`;
      continue;
    }

    if (result.error) {
      lastReason = `could not run ${attempt.bin} (${result.error.message})`;
      continue;
    }

    const report = parseReport(result.stdout);
    if (report) return { ok: true, report, exitCode: result.status };

    lastReason = result.signal === 'SIGTERM'
      ? `${attempt.bin} timed out after ${timeout}ms`
      : `${attempt.bin} produced no report (${firstLine(result.stderr) || `exit ${result.status}`})`;
  }

  return { ok: false, reason: lastReason };
}

function parseReport(stdout) {
  if (typeof stdout !== 'string') return null;
  const trimmed = stdout.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && Array.isArray(parsed.violations) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Whether a violation blocks.
 *
 * With no explicit override the CLI's own exit code decides, so the project's
 * `failOn` config is what governs — 2 means a critical blocked, 1 means the
 * project set `failOn: warning` and a warning blocked.
 */
function isBlocking(severity, failOn, exitCode) {
  if (process.env.MIGRATIONPILOT_HOOK_FAILON) {
    if (failOn === 'never') return false;
    if (severity === 'critical') return true;
    return failOn === 'warning';
  }

  if (exitCode === 2) return severity === 'critical';
  if (exitCode === 1) return true;
  return false;
}

function normalizeFailOn(value) {
  return ['critical', 'warning', 'never'].includes(value) ? value : 'critical';
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function formatReport(blocking, failOn) {
  const total = blocking.reduce((sum, b) => sum + b.violations.length, 0);
  const lines = [
    `MigrationPilot blocked this change: ${total} blocking violation(s) in ${blocking.length} file(s)/statement(s).`,
    '',
  ];

  for (const entry of blocking) {
    lines.push(`${entry.label}${entry.report.riskLevel ? `  [risk: ${entry.report.riskLevel}]` : ''}`);
    for (const v of entry.violations.slice(0, MAX_REPORTED_VIOLATIONS)) {
      lines.push(`  ${v.ruleId} (${v.severity}) line ${v.line} — ${v.ruleName}`);
      lines.push(`    ${v.message}`);
      if (v.whyItMatters) lines.push(`    Why: ${v.whyItMatters}`);
      if (v.safeAlternative) {
        lines.push('    Safe alternative:');
        for (const alt of String(v.safeAlternative).split('\n')) lines.push(`      ${alt}`);
      }
      if (v.docsUrl) lines.push(`    Docs: ${v.docsUrl}`);
      lines.push('');
    }
    const hidden = entry.violations.length - MAX_REPORTED_VIOLATIONS;
    if (hidden > 0) lines.push(`  …and ${hidden} more. Run migrationpilot on the file for the full report.`);
  }

  lines.push(
    'Rewrite the migration using the safe alternatives above, then try again.',
    `(Blocking at failOn=${failOn}. To suppress one rule the project's way, add`,
    '`-- migrationpilot-disable MP0xx` above the statement, or set the rule to false in',
    '.migrationpilotrc.yml. To turn this hook off, set MIGRATIONPILOT_HOOK_DISABLE=1.)',
  );

  return lines.join('\n');
}

function formatAdvisory(advisory) {
  const lines = ['MigrationPilot found non-blocking issues in this migration:'];

  for (const entry of advisory) {
    lines.push(`${entry.label}${entry.report.riskLevel ? `  [risk: ${entry.report.riskLevel}]` : ''}`);
    for (const v of entry.violations.slice(0, MAX_REPORTED_VIOLATIONS)) {
      lines.push(`  ${v.ruleId} (${v.severity}) line ${v.line}: ${v.message}`);
      if (v.safeAlternative) lines.push(`    Safer: ${String(v.safeAlternative).split('\n')[0]}`);
    }
  }

  lines.push('These do not block. Mention them to the user rather than fixing them silently.');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string') return value;
  }
  return null;
}

function firstLine(text) {
  return typeof text === 'string' ? text.trim().split('\n')[0] : '';
}

function isTruthy(value) {
  return value !== undefined && value !== '' && value !== '0' && value.toLowerCase?.() !== 'false';
}

// Exported for tests; the hook only runs itself when Claude Code invokes it.
module.exports = {
  collectCandidates,
  resolveFileContent,
  isMigrationSqlPath,
  isMigrationCommand,
  candidatesFromCommand,
  parseReport,
  isBlocking,
  normalizeFailOn,
  formatReport,
  formatAdvisory,
};

if (require.main === module) main();
