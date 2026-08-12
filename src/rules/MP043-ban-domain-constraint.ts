import type { Rule, RuleContext, RuleViolation } from './engine.js';

/**
 * `AlterDomainStmt.subtype` is a bare character in the PostgreSQL grammar, not
 * one of the `AT_*` enum names `AlterTableCmd` uses, and libpg-query passes it
 * through as written. Probing the bundled parser gives:
 *
 *   C  ADD CONSTRAINT        T  SET DEFAULT / DROP DEFAULT
 *   X  DROP CONSTRAINT       O  SET NOT NULL
 *   V  VALIDATE CONSTRAINT   N  DROP NOT NULL
 *
 * Reading `T` as ADD CONSTRAINT — as this rule once did — inverts it into a
 * false positive on default changes and a false negative on the multi-table
 * scan the rule exists to catch.
 */
const ALTER_DOMAIN_ADD_CONSTRAINT = 'C';

export const banDomainConstraint: Rule = {
  id: 'MP043',
  name: 'ban-domain-constraint',
  severity: 'warning',
  description: 'Adding or modifying domain constraints validates against ALL columns using that domain, potentially scanning many tables.',
  whyItMatters: 'Domain constraints are validated against every column in every table that uses the domain type. Adding a CHECK constraint to a domain can trigger full table scans across many tables simultaneously. Use CHECK constraints on individual columns instead.',
  docsUrl: 'https://migrationpilot.dev/rules/mp043',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    // CREATE DOMAIN with CHECK
    if ('CreateDomainStmt' in stmt) {
      const domain = stmt.CreateDomainStmt as {
        domainname?: Array<{ String?: { sval: string } }>;
        constraints?: Array<{ Constraint?: { contype: string } }>;
      };

      const hasCheck = domain.constraints?.some(c => c.Constraint?.contype === 'CONSTR_CHECK');
      if (!hasCheck) return null;

      const domainName = domain.domainname
        ?.map(n => n.String?.sval)
        .filter((n): n is string => !!n)
        .join('.') ?? 'unknown';

      return {
        ruleId: 'MP043',
        ruleName: 'ban-domain-constraint',
        severity: 'warning',
        message: `CREATE DOMAIN "${domainName}" with CHECK constraint. Future columns using this domain will be validated against this constraint, and modifying it later requires scanning all tables using the domain.`,
        line: ctx.line,
        safeAlternative: `-- Consider using CHECK constraints on individual columns instead of domain constraints.
-- This gives you more control over validation and avoids cross-table scans when modifying constraints.`,
      };
    }

    // ALTER DOMAIN ADD CONSTRAINT
    if ('AlterDomainStmt' in stmt) {
      const alterDomain = stmt.AlterDomainStmt as {
        typeName?: Array<{ String?: { sval: string } }>;
        subtype?: string;
        def?: { Constraint?: { skip_validation?: boolean } };
      };

      if (alterDomain.subtype !== ALTER_DOMAIN_ADD_CONSTRAINT) return null;

      // NOT VALID is the escape hatch this rule's own safeAlternative points at:
      // the constraint applies to new writes and nothing is scanned until a
      // later VALIDATE CONSTRAINT. Warning here would flag the safe form.
      if (alterDomain.def?.Constraint?.skip_validation) return null;

      const domainName = alterDomain.typeName
        ?.map(n => n.String?.sval)
        .filter((n): n is string => !!n)
        .join('.') ?? 'unknown';

      return {
        ruleId: 'MP043',
        ruleName: 'ban-domain-constraint',
        severity: 'warning',
        message: `ALTER DOMAIN "${domainName}" ADD CONSTRAINT validates against ALL columns using this domain, potentially scanning many tables.`,
        line: ctx.line,
        safeAlternative: `-- Adding domain constraints scans all tables using the domain.
-- Use NOT VALID if supported, or add CHECK constraints on individual columns instead.`,
      };
    }

    return null;
  },
};
