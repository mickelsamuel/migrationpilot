import type { Rule, RuleContext, RuleViolation } from './engine.js';

/**
 * MP075: warn-toast-bloat-risk
 *
 * UPDATE statements that modify TEXT, JSONB, or BYTEA columns trigger
 * TOAST (The Oversized-Attribute Storage Technique) chunk rewrites.
 * Old TOAST chunks are not reclaimed until VACUUM runs, causing
 * significant table bloat.
 *
 * Detects UPDATE statements whose SQL contains common TOAST-column
 * modification patterns (jsonb_set, jsonb_build_object, ||, etc.)
 * or targets columns with typical TOAST-eligible names.
 */

const TOAST_FUNCTION_PATTERNS = [
  'jsonb_set', 'jsonb_build_object', 'jsonb_build_array', 'jsonb_strip_nulls',
  'jsonb_insert', 'json_build_object', 'json_build_array',
  'to_jsonb', 'to_json', 'array_to_json', 'row_to_json',
  'encode', 'decode', 'convert_to',
];

const TOAST_COLUMN_PATTERNS = [
  'metadata', 'payload', 'body', 'content', 'data', 'config',
  'settings', 'preferences', 'properties', 'attributes', 'extra',
  'details', 'description', 'notes', 'raw_data', 'json_data',
];

export const warnToastBloatRisk: Rule = {
  id: 'MP075',
  name: 'warn-toast-bloat-risk',
  severity: 'warning',
  description: 'UPDATE on TOAST-eligible columns (TEXT/JSONB/BYTEA) causes storage bloat until VACUUM runs.',
  whyItMatters:
    'When you UPDATE a row with TOAST-stored columns, PostgreSQL creates new TOAST chunks ' +
    'and marks old chunks as dead. Dead chunks are only reclaimed by VACUUM. Bulk updates on ' +
    'TOAST-heavy columns can cause tables to grow many times their logical size, degrading ' +
    'query performance and exhausting disk space.',
  docsUrl: 'https://migrationpilot.dev/rules/mp075',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (!('UpdateStmt' in stmt)) return null;

    const update = stmt.UpdateStmt as {
      relation?: { relname?: string };
    };

    const sql = ctx.originalSql.toLowerCase();
    const tableName = update.relation?.relname ?? 'unknown';

    // Check for JSONB/JSON function usage in SET clause
    const hasToastFunction = TOAST_FUNCTION_PATTERNS.some(fn => sql.includes(fn));

    // Check for common TOAST-column names in SET clause
    const hasToastColumn = TOAST_COLUMN_PATTERNS.some(col => {
      const setPattern = new RegExp(`set\\s+.*\\b${col}\\b\\s*=`, 'i');
      return setPattern.test(ctx.originalSql);
    });

    if (!hasToastFunction && !hasToastColumn) return null;

    const pattern = hasToastFunction ? 'JSONB/JSON function calls' : 'TOAST-eligible column modifications';

    return {
      ruleId: 'MP075',
      ruleName: 'warn-toast-bloat-risk',
      severity: 'warning',
      message: `UPDATE on "${tableName}" with ${pattern}. TOAST chunk rewrites cause table bloat until VACUUM runs. Run VACUUM after bulk updates.`,
      line: ctx.line,
      safeAlternative: `-- After bulk TOAST-column updates, reclaim space:
${ctx.originalSql}

-- Run VACUUM to reclaim dead TOAST chunks:
VACUUM (VERBOSE) ${tableName};`,
    };
  },
};
