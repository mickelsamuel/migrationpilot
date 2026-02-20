import type { Rule, RuleContext, RuleViolation } from './engine.js';

export const sequenceNotReset: Rule = {
  id: 'MP059',
  name: 'sequence-not-reset-after-data-migration',
  severity: 'warning',
  description: 'INSERT with explicit integer IDs without a subsequent setval() or ALTER SEQUENCE RESTART may cause duplicate key errors on the next auto-generated insert.',
  whyItMatters: 'When you seed data or migrate rows with explicit integer IDs, the sequence counter is not automatically updated. The next auto-generated INSERT picks a low ID that already exists, causing "duplicate key violates unique constraint." This is one of the most common post-migration production errors, documented extensively in Django, Rails, Supabase, and Prisma issue trackers.',
  docsUrl: 'https://migrationpilot.dev/rules/mp059',

  check(_stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    const sql = ctx.originalSql.trim();
    const sqlLower = sql.toLowerCase();

    // Only check INSERT statements
    if (!sqlLower.startsWith('insert')) return null;

    // Check if the INSERT has explicit integer IDs in VALUES
    // Pattern: INSERT INTO table (id, ...) VALUES (123, ...) or VALUES (1, ...)
    const valuesMatch = sql.match(/VALUES\s*\(\s*(\d+)\s*[,)]/i);
    if (!valuesMatch) return null;

    // Extract table name
    const tableMatch = sql.match(/INSERT\s+INTO\s+(\S+)/i);
    if (!tableMatch) return null;
    const table = tableMatch[1]!.replace(/"/g, '');

    // Check if any statement in this migration resets the sequence
    const hasSequenceReset = ctx.allStatements.some(s => {
      const stmtSql = s.originalSql.toLowerCase();
      return (stmtSql.includes('setval') && stmtSql.includes(table.toLowerCase())) ||
        (stmtSql.includes('alter sequence') && stmtSql.includes('restart'));
    });

    if (hasSequenceReset) return null;

    return {
      ruleId: 'MP059',
      ruleName: 'sequence-not-reset-after-data-migration',
      severity: 'warning',
      message: `INSERT INTO "${table}" with explicit integer IDs without resetting the sequence. The next auto-generated ID may conflict with existing rows.`,
      line: ctx.line,
      safeAlternative: `-- Reset the sequence after inserting with explicit IDs:
SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE(MAX(id), 1)) FROM ${table};`,
    };
  },
};
