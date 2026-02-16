import type { Rule, RuleContext, RuleViolation } from './engine.js';

export const requireIfNotExists: Rule = {
  id: 'MP023',
  name: 'require-if-not-exists',
  severity: 'warning',
  description: 'CREATE TABLE/INDEX without IF NOT EXISTS will fail if the object already exists, making migrations non-idempotent.',
  whyItMatters: 'Without IF NOT EXISTS, re-running a migration fails with "relation already exists". Idempotent migrations are safer for retry and rollback scenarios, and required by many deployment pipelines.',
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

      if (idx.if_not_exists) return null;

      const indexName = idx.idxname ?? 'unknown';

      let safeAlt: string;
      if (idx.unique && idx.concurrent) {
        safeAlt = ctx.originalSql.replace(/CREATE\s+UNIQUE\s+INDEX\s+CONCURRENTLY\s+/i, 'CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS ');
      } else if (idx.unique) {
        safeAlt = ctx.originalSql.replace(/CREATE\s+UNIQUE\s+INDEX\s+/i, 'CREATE UNIQUE INDEX IF NOT EXISTS ');
      } else if (idx.concurrent) {
        safeAlt = ctx.originalSql.replace(/CREATE\s+INDEX\s+CONCURRENTLY\s+/i, 'CREATE INDEX CONCURRENTLY IF NOT EXISTS ');
      } else {
        safeAlt = ctx.originalSql.replace(/CREATE\s+INDEX\s+/i, 'CREATE INDEX IF NOT EXISTS ');
      }

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
