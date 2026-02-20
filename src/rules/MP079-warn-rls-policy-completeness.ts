import type { Rule, RuleContext, RuleViolation } from './engine.js';

/**
 * MP079: warn-rls-policy-completeness
 *
 * When RLS is enabled and policies are created, ensure that policies
 * cover all four operations (SELECT, INSERT, UPDATE, DELETE) or use
 * ALL. Missing operation policies silently deny access for those
 * operations, which can appear as an empty table rather than an error.
 *
 * Complements MP057 (rls-without-policy) which checks for zero policies.
 * MP079 checks that existing policies are comprehensive.
 */

const RLS_OPERATIONS = ['select', 'insert', 'update', 'delete'];

export const warnRlsPolicyCompleteness: Rule = {
  id: 'MP079',
  name: 'warn-rls-policy-completeness',
  severity: 'warning',
  description: 'RLS policies should cover all operations (SELECT, INSERT, UPDATE, DELETE) to avoid silent access denial.',
  whyItMatters:
    'When RLS is enabled, any operation without a policy is silently denied — queries return ' +
    'zero rows instead of raising an error. If you create a SELECT policy but forget INSERT, ' +
    'all inserts silently fail (or error on PG 15+). Always create policies for all operations ' +
    'or use a permissive ALL policy as a baseline.',
  docsUrl: 'https://migrationpilot.dev/rules/mp079',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (!('AlterTableStmt' in stmt)) return null;

    const alter = stmt.AlterTableStmt as {
      relation?: { relname?: string };
      cmds?: Array<{
        AlterTableCmd?: { subtype?: string };
      }>;
    };

    if (!alter.cmds) return null;
    const table = alter.relation?.relname ?? 'unknown';

    const enablesRls = alter.cmds.some(cmd =>
      cmd.AlterTableCmd?.subtype === 'AT_EnableRowSecurity'
    );

    if (!enablesRls) return null;

    // Collect all CREATE POLICY statements for this table in the migration
    const coveredOps = new Set<string>();

    for (const s of ctx.allStatements) {
      const sql = s.originalSql.toLowerCase();
      if (!sql.includes('create policy') || !sql.includes(table.toLowerCase())) continue;

      // Check if it covers ALL operations
      if (sql.includes(' for all ') || /\bfor\s+all\b/.test(sql)) {
        return null; // ALL policy covers everything
      }

      for (const op of RLS_OPERATIONS) {
        if (sql.includes(` for ${op} `) || sql.includes(` for ${op};`) || new RegExp(`\\bfor\\s+${op}\\b`).test(sql)) {
          coveredOps.add(op);
        }
      }
    }

    // If no policies at all, MP057 handles that
    if (coveredOps.size === 0) return null;

    const missingOps = RLS_OPERATIONS.filter(op => !coveredOps.has(op));
    if (missingOps.length === 0) return null;

    return {
      ruleId: 'MP079',
      ruleName: 'warn-rls-policy-completeness',
      severity: 'warning',
      message: `RLS on "${table}" has policies for ${[...coveredOps].join(', ')} but missing ${missingOps.join(', ')}. Uncovered operations will be silently denied.`,
      line: ctx.line,
      safeAlternative: missingOps.map(op =>
        `CREATE POLICY ${table}_${op} ON ${table} FOR ${op.toUpperCase()} USING (true);`
      ).join('\n'),
    };
  },
};
