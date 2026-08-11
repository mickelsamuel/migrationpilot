import type { Rule, RuleContext, RuleViolation } from './engine.js';

/**
 * MP099: warn-security-definer-search-path
 *
 * A SECURITY DEFINER function runs with the privileges of its owner. If it
 * does not pin search_path, the caller controls how every unqualified name
 * inside the body resolves — and the caller is the one who does not have
 * those privileges.
 *
 * The attack is direct: create a table (or function) named to shadow one the
 * body references, put it first on your own search_path, call the function,
 * and the owner's privileges execute against your object.
 *
 *   SET search_path = evil, public;
 *   SELECT admin_only_function();   -- body's "users" resolves to evil.users
 *
 * The fix is a SET search_path clause on the function itself, which pins
 * resolution for the duration of the call regardless of the caller.
 *
 * PostgreSQL accepts the unpinned form without complaint, which is why this
 * has to be caught in review.
 */

export const warnSecurityDefinerSearchPath: Rule = {
  id: 'MP099',
  name: 'warn-security-definer-search-path',
  severity: 'critical',
  description: 'SECURITY DEFINER function without a pinned search_path lets the caller control name resolution inside a privileged body.',
  whyItMatters:
    'SECURITY DEFINER runs the body with the owner\'s privileges, and search_path decides what the ' +
    'unqualified names in that body point at. Leave it unpinned and the caller supplies it: they ' +
    'create a table that shadows one the function reads, put their schema first on the path, and ' +
    'the function does privileged work against their object instead of yours. Functions owned by a ' +
    'superuser or by the schema owner turn this into privilege escalation for anyone who can call ' +
    'them. PostgreSQL accepts the function without a word, so nothing surfaces until someone goes ' +
    'looking — and by then the function is deployed and callable.',
  docsUrl: 'https://migrationpilot.dev/rules/mp099',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (!('CreateFunctionStmt' in stmt)) return null;

    const createFn = stmt.CreateFunctionStmt as {
      funcname?: Array<{ String?: { sval?: string } }>;
      is_procedure?: boolean;
      options?: Array<{
        DefElem?: {
          defname?: string;
          arg?: { Boolean?: { boolval?: boolean }; VariableSetStmt?: { name?: string } };
        };
      }>;
    };

    const options = createFn.options ?? [];

    const isSecurityDefiner = options.some(
      o => o.DefElem?.defname === 'security' && o.DefElem.arg?.Boolean?.boolval === true,
    );
    if (!isSecurityDefiner) return null;

    const pinsSearchPath = options.some(
      o => o.DefElem?.defname === 'set' && o.DefElem.arg?.VariableSetStmt?.name === 'search_path',
    );
    if (pinsSearchPath) return null;

    const fnName = (createFn.funcname ?? [])
      .map(n => n.String?.sval)
      .filter(Boolean)
      .join('.') || 'unnamed function';
    const kind = createFn.is_procedure === true ? 'Procedure' : 'Function';

    return {
      ruleId: 'MP099',
      ruleName: 'warn-security-definer-search-path',
      severity: 'critical',
      message: `${kind} "${fnName}" is SECURITY DEFINER with no SET search_path. The caller controls how unqualified names in the body resolve, so they can shadow the objects it reads and have it act on theirs with the owner's privileges.`,
      line: ctx.line,
      safeAlternative: `-- Pin search_path on the function so the caller cannot influence it:
CREATE FUNCTION ${fnName}(...) RETURNS ...
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public
AS $$ ... $$;

-- Then restrict who can call it — SECURITY DEFINER functions are
-- executable by PUBLIC by default:
REVOKE EXECUTE ON FUNCTION ${fnName} FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ${fnName} TO app_role;

-- Schema-qualifying every reference inside the body is worth doing as well;
-- the SET clause is the guarantee, qualification is the belt and braces.`,
    };
  },
};
