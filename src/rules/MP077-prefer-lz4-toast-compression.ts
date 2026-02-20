import type { Rule, RuleContext, RuleViolation } from './engine.js';

/**
 * MP077: prefer-lz4-toast-compression
 *
 * PostgreSQL 14+ supports lz4 TOAST compression, which is significantly
 * faster than the default pglz. For columns with TOAST-heavy data
 * (TEXT, JSONB, BYTEA), using lz4 reduces compression/decompression
 * overhead with minimal size tradeoff.
 *
 * Detects ALTER TABLE ALTER COLUMN SET COMPRESSION pglz and
 * SET default_toast_compression = 'pglz'.
 */

export const preferLz4ToastCompression: Rule = {
  id: 'MP077',
  name: 'prefer-lz4-toast-compression',
  severity: 'warning',
  description: 'Use lz4 TOAST compression instead of pglz on PostgreSQL 14+ for better performance.',
  whyItMatters:
    'PostgreSQL 14 introduced lz4 as an alternative TOAST compression method. lz4 is 3-5x faster ' +
    'for both compression and decompression compared to the default pglz, with only slightly worse ' +
    'compression ratios. For JSONB, TEXT, and BYTEA columns with frequent reads/writes, lz4 ' +
    'significantly reduces CPU overhead.',
  docsUrl: 'https://migrationpilot.dev/rules/mp077',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    // Only applies to PG 14+
    if (ctx.pgVersion < 14) return null;

    // Check ALTER TABLE ... ALTER COLUMN ... SET COMPRESSION pglz
    if ('AlterTableStmt' in stmt) {
      const alter = stmt.AlterTableStmt as {
        relation?: { relname?: string };
        cmds?: Array<{
          AlterTableCmd?: {
            subtype?: string;
            name?: string;
            def?: { String?: { sval?: string } };
          };
        }>;
      };

      if (!alter.cmds) return null;
      const table = alter.relation?.relname ?? 'unknown';

      for (const cmdWrapper of alter.cmds) {
        const cmd = cmdWrapper.AlterTableCmd;
        if (!cmd || cmd.subtype !== 'AT_SetCompression') continue;

        const compression = cmd.def?.String?.sval?.toLowerCase();
        if (compression !== 'pglz') continue;

        const column = cmd.name ?? 'unknown';

        return {
          ruleId: 'MP077',
          ruleName: 'prefer-lz4-toast-compression',
          severity: 'warning',
          message: `Column "${column}" on "${table}" uses pglz compression. Use lz4 on PG 14+ for 3-5x faster compression/decompression.`,
          line: ctx.line,
          safeAlternative: `ALTER TABLE ${table} ALTER COLUMN ${column} SET COMPRESSION lz4;`,
        };
      }
    }

    // Check SET default_toast_compression = 'pglz'
    if ('VariableSetStmt' in stmt) {
      const setStmt = stmt.VariableSetStmt as {
        name?: string;
        args?: Array<{ String?: { sval?: string } }>;
      };

      if (setStmt.name?.toLowerCase() === 'default_toast_compression') {
        const val = setStmt.args?.[0]?.String?.sval?.toLowerCase();
        if (val === 'pglz') {
          return {
            ruleId: 'MP077',
            ruleName: 'prefer-lz4-toast-compression',
            severity: 'warning',
            message: 'Setting default_toast_compression to pglz. Use lz4 on PG 14+ for better performance.',
            line: ctx.line,
            safeAlternative: `SET default_toast_compression = 'lz4';`,
          };
        }
      }
    }

    return null;
  },
};
