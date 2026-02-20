import type { Rule, RuleContext, RuleViolation } from './engine.js';

/**
 * MP073: ban-superuser-role
 *
 * Migrations should not use SUPERUSER privileges. Operations that require
 * SUPERUSER (ALTER SYSTEM, CREATE ROLE WITH SUPERUSER, LOAD) indicate
 * the migration is running with excessive privileges — a security risk
 * and incompatible with managed database services (RDS, Cloud SQL, etc.).
 */

export const banSuperuserRole: Rule = {
  id: 'MP073',
  name: 'ban-superuser-role',
  severity: 'critical',
  description: 'Migration uses superuser-only operations. Migrations should run with minimal privileges.',
  whyItMatters:
    'Running migrations as SUPERUSER is a security risk: a malicious or buggy migration can ' +
    'modify system catalogs, bypass RLS, and damage the cluster. Managed database services ' +
    '(RDS, Cloud SQL, Neon, Supabase) do not grant SUPERUSER access, so these operations will ' +
    'fail in production. Design migrations to work with the minimum required privileges.',
  docsUrl: 'https://migrationpilot.dev/rules/mp073',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    // ALTER SYSTEM (requires superuser)
    if ('AlterSystemStmt' in stmt) {
      return {
        ruleId: 'MP073',
        ruleName: 'ban-superuser-role',
        severity: 'critical',
        message: 'ALTER SYSTEM requires SUPERUSER privileges and modifies postgresql.conf. Use ALTER DATABASE ... SET for per-database settings instead.',
        line: ctx.line,
        safeAlternative: `-- Use per-database settings instead of system-wide:
ALTER DATABASE mydb SET <parameter> = '<value>';`,
      };
    }

    // CREATE ROLE ... SUPERUSER or ALTER ROLE ... SUPERUSER
    const createRole = stmt.CreateRoleStmt as {
      role?: string;
      options?: Array<{
        DefElem?: {
          defname?: string;
          arg?: { Boolean?: { boolval?: boolean }; Integer?: { ival?: number } };
        };
      }>;
    } | undefined;

    if (createRole?.role) {
      if (hasSuperuserOption(createRole.options)) {
        return {
          ruleId: 'MP073',
          ruleName: 'ban-superuser-role',
          severity: 'critical',
          message: `CREATE ROLE "${createRole.role}" WITH SUPERUSER. Migrations should not create superuser roles. Use specific GRANT statements instead.`,
          line: ctx.line,
          safeAlternative: `-- Grant only the specific privileges needed:
CREATE ROLE ${createRole.role};
GRANT CREATE ON DATABASE mydb TO ${createRole.role};`,
        };
      }
    }

    const alterRole = stmt.AlterRoleStmt as {
      role?: { rolename?: string };
      options?: Array<{
        DefElem?: {
          defname?: string;
          arg?: { Boolean?: { boolval?: boolean }; Integer?: { ival?: number } };
        };
      }>;
    } | undefined;

    if (alterRole?.role?.rolename) {
      if (hasSuperuserOption(alterRole.options)) {
        return {
          ruleId: 'MP073',
          ruleName: 'ban-superuser-role',
          severity: 'critical',
          message: `ALTER ROLE "${alterRole.role.rolename}" SUPERUSER. Migrations should not grant superuser. Use specific GRANT statements instead.`,
          line: ctx.line,
        };
      }
    }

    return null;
  },
};

function hasSuperuserOption(
  options: Array<{
    DefElem?: {
      defname?: string;
      arg?: { Boolean?: { boolval?: boolean }; Integer?: { ival?: number } };
    };
  }> | undefined
): boolean {
  if (!options) return false;
  return options.some(opt => {
    const elem = opt.DefElem;
    if (elem?.defname !== 'superuser') return false;
    // arg can be Boolean {boolval: true}, Integer {ival: 1}, or absent (which means true)
    if (!elem.arg) return true;
    if (elem.arg.Boolean?.boolval === true) return true;
    if (elem.arg.Integer?.ival === 1) return true;
    return false;
  });
}
