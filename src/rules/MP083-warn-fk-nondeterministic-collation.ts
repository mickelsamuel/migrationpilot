import type { Rule, RuleContext, RuleViolation } from './engine.js';

/**
 * MP083: warn-fk-nondeterministic-collation
 *
 * PostgreSQL 18 validates that FK columns use deterministic collations.
 * Non-deterministic collations (ICU case-insensitive, etc.) can cause FK
 * lookups to match incorrect values — e.g., "abc" matching "ABC".
 * PG18 rejects such FKs at creation time.
 *
 * Detection approach:
 * 1. AST: Detect FK constraint creation (ALTER TABLE ADD CONSTRAINT FOREIGN KEY)
 * 2. Regex: Scan migration for known non-deterministic collation patterns
 * 3. Combine: If both FK and non-deterministic collation found, warn
 */

const NON_DETERMINISTIC_COLLATION_PATTERN =
  /COLLATE\s+"?(?:und-x-icu|[a-z]{2,3}(?:-[A-Z]{2})?-x-icu|[a-z_]+\.icu)"?/i;

export const warnFkNondeterministicCollation: Rule = {
  id: 'MP083',
  name: 'warn-fk-nondeterministic-collation',
  severity: 'warning',
  description: 'FK on column with non-deterministic collation may fail on PG18+ or match incorrect values.',
  whyItMatters:
    'PostgreSQL 18 now validates that foreign key columns use deterministic collations. ' +
    'Non-deterministic collations (like ICU case-insensitive) can cause FK lookups to match ' +
    'incorrect values — e.g., "abc" matching "ABC". PG18 rejects such FKs at creation time.',
  docsUrl: 'https://migrationpilot.dev/rules/mp083',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (ctx.pgVersion < 18) return null;

    // Check ALTER TABLE ADD CONSTRAINT FOREIGN KEY
    if ('AlterTableStmt' in stmt) {
      return checkAlterFK(stmt, ctx);
    }

    // Check CREATE TABLE with inline FK + COLLATE
    if ('CreateStmt' in stmt) {
      return checkCreateTableFK(ctx);
    }

    return null;
  },
};

function checkAlterFK(
  stmt: Record<string, unknown>,
  ctx: RuleContext,
): RuleViolation | null {
  const alter = stmt.AlterTableStmt as {
    relation?: { relname?: string };
    cmds?: Array<{ AlterTableCmd: { subtype: string; def?: Record<string, unknown> } }>;
  };

  if (!alter.cmds) return null;

  for (const cmd of alter.cmds) {
    if (cmd.AlterTableCmd.subtype !== 'AT_AddConstraint') continue;

    const constraint = cmd.AlterTableCmd.def?.Constraint as {
      contype?: string;
      conname?: string;
      pktable?: { relname?: string };
    } | undefined;

    if (!constraint || constraint.contype !== 'CONSTR_FOREIGN') continue;

    // Check if any preceding statement in this migration uses a non-deterministic collation
    const fullMigrationSql = ctx.allStatements.map(s => s.originalSql).join('\n');
    if (!NON_DETERMINISTIC_COLLATION_PATTERN.test(fullMigrationSql)) return null;

    const tableName = alter.relation?.relname ?? 'unknown';
    const constraintName = constraint.conname ?? 'unnamed_fk';
    const refTable = constraint.pktable?.relname ?? 'unknown';

    return {
      ruleId: 'MP083',
      ruleName: 'warn-fk-nondeterministic-collation',
      severity: 'warning',
      message: `FK "${constraintName}" on "${tableName}" → "${refTable}" — migration contains non-deterministic collation (ICU). PG18 rejects FKs with non-deterministic collations.`,
      line: ctx.line,
      safeAlternative: `-- Ensure FK columns use a deterministic collation:
-- 1. Check current collation:
--    SELECT collation_name FROM information_schema.columns
--    WHERE table_name = '${tableName}' AND column_name = '...';
-- 2. If non-deterministic, change to deterministic before adding FK:
ALTER TABLE ${tableName} ALTER COLUMN ... TYPE TEXT COLLATE "C";
-- 3. Then add the FK constraint`,
    };
  }

  return null;
}

function checkCreateTableFK(ctx: RuleContext): RuleViolation | null {
  const sql = ctx.originalSql;

  // Must have both a FK reference and a non-deterministic collation
  const hasFk = /(?:FOREIGN\s+KEY|REFERENCES)\s/i.test(sql);
  if (!hasFk) return null;

  if (!NON_DETERMINISTIC_COLLATION_PATTERN.test(sql)) return null;

  const tableMatch = sql.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i);
  const tableName = tableMatch ? tableMatch[1] : 'unknown';

  return {
    ruleId: 'MP083',
    ruleName: 'warn-fk-nondeterministic-collation',
    severity: 'warning',
    message: `CREATE TABLE "${tableName}" has FK constraint with non-deterministic collation. PG18 rejects FKs with non-deterministic collations.`,
    line: ctx.line,
    safeAlternative: `-- Use a deterministic collation for FK columns:
-- Change COLLATE "und-x-icu" to COLLATE "C" or a deterministic locale`,
  };
}
