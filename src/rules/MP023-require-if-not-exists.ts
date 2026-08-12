import type { Rule, RuleContext, RuleViolation } from './engine.js';

export const requireIfNotExists: Rule = {
  id: 'MP023',
  name: 'require-if-not-exists',
  severity: 'warning',
  description: 'CREATE TABLE/INDEX without IF NOT EXISTS will fail if the object already exists, making migrations non-idempotent.',
  whyItMatters: 'Without IF NOT EXISTS, re-running a migration fails with "relation already exists". Idempotent migrations are safer for retry and rollback scenarios, and required by many deployment pipelines. Concurrent index builds are excluded on purpose: there, IF NOT EXISTS matches an index a failed build left INVALID and reports success without rebuilding it, so the retry-safe form is a preceding DROP INDEX CONCURRENTLY IF EXISTS instead (MP070).',
  docsUrl: 'https://migrationpilot.dev/rules/mp023',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    // CREATE TABLE
    if ('CreateStmt' in stmt) {
      const create = stmt.CreateStmt as {
        if_not_exists?: boolean;
        relation?: { relname?: string; relpersistence?: string };
      };

      // Skip temp tables (ephemeral, don't need idempotency)
      if (create.relation?.relpersistence === 't') return null;

      if (create.if_not_exists) return null;

      const tableName = create.relation?.relname ?? 'unknown';

      return {
        ruleId: 'MP023',
        ruleName: 'require-if-not-exists',
        severity: 'warning',
        message: `CREATE TABLE "${tableName}" without IF NOT EXISTS will fail if the table already exists. Use IF NOT EXISTS for idempotent migrations.`,
        line: ctx.line,
        safeAlternative: ctx.originalSql.replace(
          /CREATE\s+TABLE\s+/i,
          'CREATE TABLE IF NOT EXISTS '
        ),
      };
    }

    // CREATE INDEX
    if ('IndexStmt' in stmt) {
      const idx = stmt.IndexStmt as {
        if_not_exists?: boolean;
        idxname?: string;
        concurrent?: boolean;
        unique?: boolean;
        relation?: { relname?: string };
      };

      // A concurrent build is the one place IF NOT EXISTS is the wrong answer.
      // When CREATE INDEX CONCURRENTLY fails it leaves an INVALID index holding
      // the name; IF NOT EXISTS then matches that name, skips the build and
      // reports success, so the migration is marked applied over an index that
      // will never answer a query — handbook MPH-012. Idempotency for these
      // comes from a preceding DROP INDEX CONCURRENTLY IF EXISTS, which is
      // MP070's job. Demanding both would be demanding the trap.
      if (idx.concurrent) return null;

      if (idx.if_not_exists) return null;

      const indexName = idx.idxname ?? 'unknown';

      const safeAlt = idx.unique
        ? ctx.originalSql.replace(/CREATE\s+UNIQUE\s+INDEX\s+/i, 'CREATE UNIQUE INDEX IF NOT EXISTS ')
        : ctx.originalSql.replace(/CREATE\s+INDEX\s+/i, 'CREATE INDEX IF NOT EXISTS ');

      return {
        ruleId: 'MP023',
        ruleName: 'require-if-not-exists',
        severity: 'warning',
        message: `CREATE INDEX "${indexName}" without IF NOT EXISTS will fail if the index already exists. Use IF NOT EXISTS for idempotent migrations.`,
        line: ctx.line,
        safeAlternative: safeAlt,
      };
    }

    return null;
  },
};
