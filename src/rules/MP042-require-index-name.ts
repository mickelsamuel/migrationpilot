import type { Rule, RuleContext, RuleViolation } from './engine.js';

export const requireIndexName: Rule = {
  id: 'MP042',
  name: 'require-index-name',
  severity: 'warning',
  description: 'CREATE INDEX without an explicit name generates auto-names that are hard to reference in future migrations and monitoring.',
  whyItMatters: 'PostgreSQL auto-generates index names like "users_email_idx" but the naming is fragile and can collide. Explicit index names make future migrations clearer (DROP INDEX, REINDEX), improve monitoring (pg_stat_user_indexes), and are required for UNIQUE ... USING INDEX patterns.',
  docsUrl: 'https://migrationpilot.dev/rules/mp042',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (!('IndexStmt' in stmt)) return null;

    const idx = stmt.IndexStmt as {
      idxname?: string;
      relation?: { relname?: string };
      accessMethod?: string;
    };

    // Has an explicit name — good
    if (idx.idxname) return null;

    const tableName = idx.relation?.relname ?? 'unknown';

    return {
      ruleId: 'MP042',
      ruleName: 'require-index-name',
      severity: 'warning',
      message: `CREATE INDEX on "${tableName}" without an explicit name. Auto-generated names are fragile and hard to reference in future migrations.`,
      line: ctx.line,
      safeAlternative: `-- Add an explicit index name:
-- CREATE INDEX idx_${tableName}_<column> ON ${tableName} (...);`,
    };
  },
};
