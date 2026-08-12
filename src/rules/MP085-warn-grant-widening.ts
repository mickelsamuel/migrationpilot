import type { Rule, RuleContext, RuleViolation } from './engine.js';

/**
 * MP085: warn-grant-widening
 *
 * Flags grants that hand out more access than a migration normally should:
 *
 * 1. GRANT ... TO PUBLIC       — every role in the cluster, including future ones
 * 2. GRANT ALL                 — the whole privilege set, not the subset needed
 * 3. GRANT ... ON ALL TABLES IN SCHEMA — blanket grant across every table at once
 *
 * In the AST an omitted `privileges` list means ALL PRIVILEGES, and PUBLIC is a
 * distinct RoleSpec type rather than a role named "public".
 */

interface GrantShape {
  is_grant?: boolean;
  targtype?: string;
  objtype?: string;
  objects?: Array<{ RangeVar?: { relname?: string }; String?: { sval?: string } }>;
  privileges?: Array<{ AccessPriv?: { priv_name?: string } }>;
  grantees?: Array<{ RoleSpec?: { roletype?: string; rolename?: string } }>;
}

export const warnGrantWidening: Rule = {
  id: 'MP085',
  name: 'warn-grant-widening',
  severity: 'warning',
  description: 'GRANT to PUBLIC, GRANT ALL, or a blanket schema-wide grant hands out more privilege than the migration needs.',
  whyItMatters:
    'Privileges granted in a migration are permanent and rarely revisited. GRANT ... TO PUBLIC ' +
    'reaches every role in the cluster, including roles created years later, so it is the one grant ' +
    'that cannot be audited by listing current users. GRANT ALL hands over TRUNCATE and REFERENCES ' +
    'alongside the read access that was actually wanted. Blanket ON ALL TABLES IN SCHEMA grants ' +
    'apply to whatever happens to exist at that moment, which makes the resulting privilege set a ' +
    'function of migration ordering rather than intent.',
  docsUrl: 'https://migrationpilot.dev/rules/mp085',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (!('GrantStmt' in stmt)) return null;

    const grant = stmt.GrantStmt as GrantShape;

    // REVOKE narrows access — only GRANT widens it.
    if (grant.is_grant !== true) return null;

    const target = describeTarget(grant);
    const toPublic = (grant.grantees ?? []).some(g => g.RoleSpec?.roletype === 'ROLESPEC_PUBLIC');
    // An omitted privileges list is how the parser represents ALL PRIVILEGES.
    const isAllPrivileges = !grant.privileges || grant.privileges.length === 0;
    const isSchemaWide = grant.targtype === 'ACL_TARGET_ALL_IN_SCHEMA';

    if (!toPublic && !isAllPrivileges && !isSchemaWide) return null;

    const reasons: string[] = [];
    if (toPublic) reasons.push('granted to PUBLIC (every role in the cluster, including future ones)');
    if (isAllPrivileges) reasons.push('grants ALL PRIVILEGES rather than the specific ones needed');
    if (isSchemaWide) reasons.push('applies to every table in the schema at once');

    const privList = isAllPrivileges
      ? 'ALL PRIVILEGES'
      : (grant.privileges ?? [])
          .map(p => p.AccessPriv?.priv_name?.toUpperCase())
          .filter(Boolean)
          .join(', ');

    return {
      ruleId: 'MP085',
      ruleName: 'warn-grant-widening',
      severity: 'warning',
      message: `GRANT ${privList} on ${target}: ${reasons.join('; ')}. Grant only the privileges the application actually uses, to a named role.`,
      line: ctx.line,
      safeAlternative: `-- Grant the specific privileges to a named role instead:
GRANT SELECT, INSERT, UPDATE ON ${target} TO app_role;

-- If PUBLIC access was inherited from an older migration, revoke it explicitly:
REVOKE ALL ON ${target} FROM PUBLIC;`,
    };
  },
};

function describeTarget(grant: GrantShape): string {
  const first = grant.objects?.[0];
  const name = first?.RangeVar?.relname ?? first?.String?.sval;
  if (!name) return 'the target object';
  if (grant.targtype === 'ACL_TARGET_ALL_IN_SCHEMA') return `ALL TABLES IN SCHEMA ${name}`;
  return name;
}
