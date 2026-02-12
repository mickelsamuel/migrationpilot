import type { Rule, RuleContext, RuleViolation } from './engine.js';

export const noVacuumFull: Rule = {
  id: 'MP006',
  name: 'no-vacuum-full',
  severity: 'critical',
  description: 'VACUUM FULL rewrites the entire table under ACCESS EXCLUSIVE lock, blocking all reads and writes.',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (!('VacuumStmt' in stmt)) return null;

    const vacuum = stmt.VacuumStmt as {
      options?: Array<{ DefElem: { defname: string } }>;
      rels?: Array<{ VacuumRelation?: { relation?: { relname?: string } } }>;
    };

    // Check if FULL option is present in DefElem array
    const isFull = vacuum.options?.some(opt => opt.DefElem?.defname === 'full');
    if (!isFull) return null;

    const tableName = vacuum.rels?.[0]?.VacuumRelation?.relation?.relname ?? 'unknown';

    return {
      ruleId: 'MP006',
      ruleName: 'no-vacuum-full',
      severity: 'critical',
      message: `VACUUM FULL on "${tableName}" rewrites the entire table under ACCESS EXCLUSIVE lock. This blocks ALL reads and writes for the entire duration.`,
      line: ctx.line,
      safeAlternative: `-- Use pg_repack instead (no ACCESS EXCLUSIVE lock during rewrite):
-- Install: CREATE EXTENSION pg_repack;
-- Run: pg_repack --table ${tableName} --no-superuser-check`,
    };
  },
};
