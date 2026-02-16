import type { Rule, RuleContext, RuleViolation } from './engine.js';

export const banTruncateCascade: Rule = {
  id: 'MP036',
  name: 'ban-truncate-cascade',
  severity: 'critical',
  description: 'TRUNCATE CASCADE silently truncates all tables with foreign key references to the target. This can destroy data across many tables.',
  whyItMatters: 'TRUNCATE CASCADE removes all rows not only from the target table but from every table that references it via foreign keys, recursively. This can silently wipe data from dozens of tables. Always truncate specific tables explicitly.',
  docsUrl: 'https://migrationpilot.dev/rules/mp036',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (!('TruncateStmt' in stmt)) return null;

    const truncate = stmt.TruncateStmt as {
      relations?: Array<{ RangeVar?: { relname?: string } }>;
      behavior?: string;
    };

    if (truncate.behavior !== 'DROP_CASCADE') return null;

    const tableNames = truncate.relations
      ?.map(r => r.RangeVar?.relname)
      .filter((n): n is string => !!n) ?? [];
    const tableList = tableNames.length > 0 ? tableNames.join(', ') : 'unknown';

    return {
      ruleId: 'MP036',
      ruleName: 'ban-truncate-cascade',
      severity: 'critical',
      message: `TRUNCATE ${tableList} CASCADE silently truncates all tables with foreign key references. This can destroy data across many related tables.`,
      line: ctx.line,
      safeAlternative: `-- Truncate specific tables explicitly in dependency order:
-- TRUNCATE ${tableList};
-- Or use DELETE with WHERE clauses for safer, auditable data removal.`,
    };
  },
};
