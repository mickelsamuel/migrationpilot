import type { Rule, RuleContext, RuleViolation } from './engine.js';
import { isDDL } from './helpers.js';

/**
 * MP091: warn-privilege-drift
 *
 * GRANT and REVOKE buried inside a schema migration are how an access model
 * stops matching what anyone believes it to be. The privilege change is
 * invisible in a diff full of DDL, it is not covered by whatever review the
 * team applies to access requests, and there is no single place left that
 * describes who can read what — the answer is spread across every migration
 * ever merged.
 *
 * The same separation MP080 asks for between schema and data applies here
 * between schema and access control.
 */

export const warnPrivilegeDrift: Rule = {
  id: 'MP091',
  name: 'warn-privilege-drift',
  severity: 'warning',
  description: 'GRANT/REVOKE mixed into a DDL migration makes access-control changes invisible to review and impossible to audit in one place.',
  whyItMatters:
    'A GRANT in the middle of a schema migration is a permanent access-control change reviewed as ' +
    'though it were a schema change. Nobody can answer "who can read this table and who approved ' +
    'that" without replaying every migration in order, because that history is the only record. ' +
    'Rolling back the schema change does not roll back the privilege either — DDL rollbacks ' +
    'restore structure, not the grants that came with it. Keeping privileges in their own ' +
    'migrations gives the access model one reviewable home.',
  docsUrl: 'https://migrationpilot.dev/rules/mp091',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (!('GrantStmt' in stmt) && !('GrantRoleStmt' in stmt)) return null;

    // Only a concern when this file is also doing schema work.
    const hasDdl = ctx.allStatements.some(s => isDDL(s.stmt));
    if (!hasDdl) return null;

    // Report once per file, on the first privilege statement.
    const isFirstPrivilegeStmt = !ctx.allStatements
      .slice(0, ctx.statementIndex)
      .some(s => 'GrantStmt' in s.stmt || 'GrantRoleStmt' in s.stmt);
    if (!isFirstPrivilegeStmt) return null;

    const { verb, target } = describe(stmt);

    return {
      ruleId: 'MP091',
      ruleName: 'warn-privilege-drift',
      severity: 'warning',
      message: `${verb} on ${target} sits in a migration that also changes schema. Access-control changes reviewed as schema changes drift out of sight — move privileges into their own migration.`,
      line: ctx.line,
      safeAlternative: `-- Split the file so each change is reviewed as what it is:
-- migrations/012_add_reports_table.sql   (DDL only)
-- migrations/013_grant_reports_access.sql (GRANT/REVOKE only)`,
    };
  },
};

function describe(stmt: Record<string, unknown>): { verb: string; target: string } {
  if ('GrantRoleStmt' in stmt) {
    const grantRole = stmt.GrantRoleStmt as {
      is_grant?: boolean;
      granted_roles?: Array<{ AccessPriv?: { priv_name?: string } }>;
    };
    const roleName = grantRole.granted_roles?.[0]?.AccessPriv?.priv_name;
    return {
      verb: grantRole.is_grant === true ? 'GRANT of role membership' : 'REVOKE of role membership',
      target: roleName ? `role "${roleName}"` : 'a role',
    };
  }

  const grant = stmt.GrantStmt as {
    is_grant?: boolean;
    objects?: Array<{ RangeVar?: { relname?: string }; String?: { sval?: string } }>;
  };
  const first = grant.objects?.[0];
  const name = first?.RangeVar?.relname ?? first?.String?.sval;
  return {
    verb: grant.is_grant === true ? 'GRANT' : 'REVOKE',
    target: name ? `"${name}"` : 'the target object',
  };
}
