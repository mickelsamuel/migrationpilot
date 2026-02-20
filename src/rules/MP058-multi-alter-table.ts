import type { Rule, RuleContext, RuleViolation } from './engine.js';

export const multiAlterTable: Rule = {
  id: 'MP058',
  name: 'multi-alter-table-same-table',
  severity: 'warning',
  description: 'Multiple separate ALTER TABLE statements on the same table acquire the lock multiple times. Combine them into a single statement.',
  whyItMatters: 'Each ALTER TABLE acquires ACCESS EXCLUSIVE lock independently. Multiple separate ALTER TABLE statements on the same table means multiple lock/unlock cycles, each going through the lock queue. Long-running queries must finish before each lock acquisition. Combining subcommands into a single ALTER TABLE reduces the blocking window from N separate lock cycles to one.',
  docsUrl: 'https://migrationpilot.dev/rules/mp058',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (!('AlterTableStmt' in stmt)) return null;

    const alter = stmt.AlterTableStmt as {
      relation?: { relname?: string };
    };

    const table = alter.relation?.relname ?? 'unknown';

    // Only fire on the first ALTER TABLE for this table (avoid duplicate warnings)
    for (let i = 0; i < ctx.statementIndex; i++) {
      const prev = ctx.allStatements[i];
      if (!prev) continue;
      if ('AlterTableStmt' in prev.stmt) {
        const prevAlter = prev.stmt.AlterTableStmt as { relation?: { relname?: string } };
        if (prevAlter.relation?.relname === table) {
          return null; // Already reported on the first occurrence
        }
      }
    }

    // Count ALTER TABLE statements for this table
    let count = 0;
    const lines: number[] = [];
    for (let i = 0; i < ctx.allStatements.length; i++) {
      const s = ctx.allStatements[i];
      if (!s) continue;
      if ('AlterTableStmt' in s.stmt) {
        const a = s.stmt.AlterTableStmt as { relation?: { relname?: string } };
        if (a.relation?.relname === table) {
          count++;
          // Estimate line number from statement index
          lines.push(i + 1);
        }
      }
    }

    if (count <= 1) return null;

    return {
      ruleId: 'MP058',
      ruleName: 'multi-alter-table-same-table',
      severity: 'warning',
      message: `${count} separate ALTER TABLE statements on "${table}". Each acquires ACCESS EXCLUSIVE lock independently. Combine into a single ALTER TABLE with multiple subcommands to reduce lock acquisitions from ${count} to 1.`,
      line: ctx.line,
      safeAlternative: `-- Combine into a single statement:
-- ALTER TABLE ${table}
--   ADD COLUMN ...,
--   ALTER COLUMN ...,
--   ADD CONSTRAINT ...;`,
    };
  },
};
