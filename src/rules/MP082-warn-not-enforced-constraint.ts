import type { Rule, RuleContext, RuleViolation } from './engine.js';

/**
 * MP082: warn-not-enforced-constraint
 *
 * PostgreSQL 18 introduced NOT ENFORCED constraints. These exist in metadata
 * but the database does NOT actually enforce them. Warn users so they
 * understand that invalid data CAN be inserted.
 *
 * Uses regex on originalSql because libpg-query-wasm (PG16/17 based)
 * cannot parse PG18 NOT ENFORCED syntax. When the parser is upgraded,
 * this rule can be enhanced with AST-based detection.
 *
 * NOTE: If NOT ENFORCED appears in a multi-statement file, the current
 * parser may fail to parse the entire file. The analysis pipeline includes
 * a raw SQL fallback (checkRawPg18Patterns) that catches this case.
 */
export const warnNotEnforcedConstraint: Rule = {
  id: 'MP082',
  name: 'warn-not-enforced-constraint',
  severity: 'warning',
  description: 'NOT ENFORCED constraint will not enforce data integrity. Invalid data can be inserted.',
  whyItMatters:
    'PostgreSQL 18 NOT ENFORCED constraints exist only as metadata hints for the query planner. ' +
    'The database will NOT reject invalid data. This is useful for documentation or gradual migration, ' +
    'but dangerous if you expect the constraint to actually protect data integrity.',
  docsUrl: 'https://migrationpilot.dev/rules/mp082',

  check(_stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (ctx.pgVersion < 18) return null;

    const sql = ctx.originalSql;
    if (!sql.match(/NOT\s+ENFORCED/i)) return null;

    // Extract constraint name if present
    const constraintMatch = sql.match(/CONSTRAINT\s+(\w+)/i);
    const constraintName = constraintMatch ? constraintMatch[1] : 'unnamed';

    // Extract table name from ALTER TABLE or CREATE TABLE
    const tableMatch = sql.match(/(?:ALTER|CREATE)\s+TABLE\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?(\w+)/i);
    const tableName = tableMatch ? tableMatch[1] : 'unknown';

    return {
      ruleId: 'MP082',
      ruleName: 'warn-not-enforced-constraint',
      severity: 'warning',
      message: `Constraint "${constraintName}" on "${tableName}" is NOT ENFORCED — PostgreSQL will not enforce data integrity for this constraint. Invalid data can be inserted.`,
      line: ctx.line,
      safeAlternative: `-- If you need the constraint enforced, remove NOT ENFORCED:
ALTER TABLE ${tableName} ADD CONSTRAINT ${constraintName} ... ;

-- If intentionally NOT ENFORCED (for query planning hints only),
-- document why so future maintainers understand the intent:
-- NOTE: NOT ENFORCED — used for query planner hints, not data validation
ALTER TABLE ${tableName} ADD CONSTRAINT ${constraintName} ... NOT ENFORCED;`,
    };
  },
};
