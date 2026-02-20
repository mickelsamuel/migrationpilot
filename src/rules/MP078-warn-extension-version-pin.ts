import type { Rule, RuleContext, RuleViolation } from './engine.js';

/**
 * MP078: warn-extension-version-pin
 *
 * CREATE EXTENSION without a VERSION clause installs whatever version
 * happens to be the default on the server. This makes migrations
 * non-reproducible across environments and can cause unexpected behavior
 * when servers have different default versions.
 *
 * Always pin the extension version for reproducibility.
 */

export const warnExtensionVersionPin: Rule = {
  id: 'MP078',
  name: 'warn-extension-version-pin',
  severity: 'warning',
  description: 'CREATE EXTENSION without VERSION clause. Pin the version for reproducible migrations.',
  whyItMatters:
    'Without a VERSION clause, CREATE EXTENSION installs the server\'s default version, which ' +
    'can differ between development, staging, and production environments. This makes migrations ' +
    'non-reproducible and can cause subtle behavior differences. Pinning the version ensures ' +
    'consistent behavior across all environments.',
  docsUrl: 'https://migrationpilot.dev/rules/mp078',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    const ext = stmt.CreateExtensionStmt as {
      extname?: string;
      options?: Array<{
        DefElem?: {
          defname?: string;
          arg?: { String?: { sval?: string } };
        };
      }>;
      if_not_exists?: boolean;
    } | undefined;

    if (!ext?.extname) return null;

    const extName = ext.extname;

    // Check if VERSION is specified in options
    const hasVersion = ext.options?.some(opt =>
      opt.DefElem?.defname === 'new_version'
    );

    if (hasVersion) return null;

    return {
      ruleId: 'MP078',
      ruleName: 'warn-extension-version-pin',
      severity: 'warning',
      message: `CREATE EXTENSION "${extName}" without VERSION clause. Pin the version for reproducible migrations across environments.`,
      line: ctx.line,
      safeAlternative: `CREATE EXTENSION ${ext.if_not_exists ? 'IF NOT EXISTS ' : ''}"${extName}" VERSION '1.0';`,
    };
  },
};
