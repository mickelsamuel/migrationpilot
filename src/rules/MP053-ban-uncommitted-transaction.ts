import type { Rule, RuleContext, RuleViolation } from './engine.js';

export const banUncommittedTransaction: Rule = {
  id: 'MP053',
  name: 'ban-uncommitted-transaction',
  severity: 'critical',
  description: 'Migration file contains BEGIN without a matching COMMIT, which will leave a dangling open transaction.',
  whyItMatters: 'A migration with BEGIN but no COMMIT will either fail (if the migration runner auto-commits) or leave an open transaction that holds locks indefinitely. Conversely, a COMMIT without a preceding BEGIN is a no-op but indicates a structural problem. Always match BEGIN with COMMIT or ROLLBACK.',
  docsUrl: 'https://migrationpilot.dev/rules/mp053',

  check(_stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    // Only fire on the last statement in the file
    if (ctx.statementIndex !== ctx.allStatements.length - 1) return null;

    // Walk through all statements to check for unmatched BEGIN/COMMIT
    let depth = 0;
    for (let i = 0; i <= ctx.statementIndex; i++) {
      const entry = ctx.allStatements[i];
      if (!entry) continue;
      const s = entry.originalSql.toLowerCase().trim();
      if (s === 'begin' || s === 'begin transaction' || s.startsWith('begin;')) {
        depth++;
      } else if (s === 'commit' || s === 'rollback' || s.startsWith('commit;') || s.startsWith('rollback;')) {
        depth--;
      }
    }

    if (depth > 0) {
      return {
        ruleId: 'MP053',
        ruleName: 'ban-uncommitted-transaction',
        severity: 'critical',
        message: 'Migration file contains BEGIN without a matching COMMIT or ROLLBACK. This will leave an open transaction that holds locks indefinitely.',
        line: ctx.line,
        safeAlternative: '-- Add COMMIT at the end of the migration:\nCOMMIT;',
      };
    }

    return null;
  },
};
