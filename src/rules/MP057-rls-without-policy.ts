import type { Rule, RuleContext, RuleViolation } from './engine.js';

export const rlsWithoutPolicy: Rule = {
  id: 'MP057',
  name: 'rls-enabled-without-policy',
  severity: 'critical',
  description: 'ENABLE ROW LEVEL SECURITY without a matching CREATE POLICY silently blocks all access for non-superuser roles.',
  whyItMatters: 'When RLS is enabled with zero policies, the default behavior is a complete deny — all queries from non-superuser roles return zero rows. No error is raised. SELECT * FROM table returns empty. This silently breaks applications in a way that looks like an empty table rather than a permission error. Supabase documents this as the leading cause of data exposure/lockout incidents.',
  docsUrl: 'https://migrationpilot.dev/rules/mp057',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (!('AlterTableStmt' in stmt)) return null;

    const alter = stmt.AlterTableStmt as {
      relation?: { relname?: string };
      cmds?: Array<{
        AlterTableCmd: {
          subtype: string;
        };
      }>;
    };

    if (!alter.cmds) return null;
    const table = alter.relation?.relname ?? 'unknown';

    // Check for ENABLE ROW LEVEL SECURITY
    const enablesRls = alter.cmds.some(cmd =>
      cmd.AlterTableCmd.subtype === 'AT_EnableRowSecurity'
    );

    if (!enablesRls) return null;

    // Check if any statement in this migration creates a policy for this table
    const hasPolicy = ctx.allStatements.some(s => {
      const sql = s.originalSql.toLowerCase();
      return sql.includes('create policy') && sql.includes(table.toLowerCase());
    });

    if (hasPolicy) return null;

    return {
      ruleId: 'MP057',
      ruleName: 'rls-enabled-without-policy',
      severity: 'critical',
      message: `ENABLE ROW LEVEL SECURITY on "${table}" without a matching CREATE POLICY. With no policies, all non-superuser queries return zero rows — silently breaking the application.`,
      line: ctx.line,
      safeAlternative: `-- Always create at least one policy when enabling RLS:
ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
CREATE POLICY ${table}_select ON ${table} FOR SELECT USING (true);
-- Then add restrictive policies as needed.`,
    };
  },
};
