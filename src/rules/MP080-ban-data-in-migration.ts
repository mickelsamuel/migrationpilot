import type { Rule, RuleContext, RuleViolation } from './engine.js';
import { isDDL } from './helpers.js';

/**
 * MP080: ban-data-in-migration
 *
 * DDL migration files should not contain data manipulation statements
 * (INSERT, UPDATE, DELETE). Mixing DDL and DML in the same migration:
 *
 * 1. Makes rollbacks harder (data changes can't be undone with DDL rollback)
 * 2. Increases lock duration (DML + DDL in same transaction)
 * 3. Violates separation of concerns (schema changes vs data changes)
 *
 * Data migrations should be in separate files with their own rollback strategy.
 */

export const banDataInMigration: Rule = {
  id: 'MP080',
  name: 'ban-data-in-migration',
  severity: 'warning',
  description: 'Data manipulation (INSERT/UPDATE/DELETE) in a DDL migration file. Separate schema and data changes.',
  whyItMatters:
    'Mixing DDL (schema changes) and DML (data changes) in the same migration makes rollback ' +
    'harder, increases lock duration, and violates separation of concerns. If the DDL portion ' +
    'fails, the data changes may have already been applied. Data migrations should be in separate ' +
    'files with explicit rollback strategies and batching for large datasets.',
  docsUrl: 'https://migrationpilot.dev/rules/mp080',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    // Only flag DML statements that appear alongside DDL
    const isDml = 'InsertStmt' in stmt || 'UpdateStmt' in stmt || 'DeleteStmt' in stmt;
    if (!isDml) return null;

    // Check if any other statement in this migration is DDL
    const hasDdl = ctx.allStatements.some(s => isDDL(s.stmt));
    if (!hasDdl) return null;

    // Determine the DML type
    let dmlType = 'DML';
    let tableName = 'unknown';

    if ('InsertStmt' in stmt) {
      dmlType = 'INSERT';
      const insert = stmt.InsertStmt as { relation?: { relname?: string } };
      tableName = insert.relation?.relname ?? 'unknown';
    } else if ('UpdateStmt' in stmt) {
      dmlType = 'UPDATE';
      const update = stmt.UpdateStmt as { relation?: { relname?: string } };
      tableName = update.relation?.relname ?? 'unknown';
    } else if ('DeleteStmt' in stmt) {
      dmlType = 'DELETE';
      const del = stmt.DeleteStmt as { relation?: { relname?: string } };
      tableName = del.relation?.relname ?? 'unknown';
    }

    return {
      ruleId: 'MP080',
      ruleName: 'ban-data-in-migration',
      severity: 'warning',
      message: `${dmlType} on "${tableName}" in a DDL migration file. Separate schema changes and data changes into different migration files.`,
      line: ctx.line,
      safeAlternative: `-- Move data manipulation to a separate migration file:
-- migrations/003_schema_change.sql (DDL only)
-- migrations/004_data_backfill.sql  (DML only, with batching)`,
    };
  },
};
