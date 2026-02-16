import type { Rule, RuleContext, RuleViolation } from './engine.js';

export const banDropDatabase: Rule = {
  id: 'MP034',
  name: 'ban-drop-database',
  severity: 'critical',
  description: 'DROP DATABASE permanently destroys the entire database. This should never appear in a migration file.',
  whyItMatters: 'DROP DATABASE permanently and irreversibly destroys the entire database including all tables, data, indexes, and extensions. If this statement appears in a migration file, it almost certainly indicates an error. There is no undo.',
  docsUrl: 'https://migrationpilot.dev/rules/mp034',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (!('DropdbStmt' in stmt)) return null;

    const dropdb = stmt.DropdbStmt as {
      dbname?: string;
      missing_ok?: boolean;
    };

    const dbName = dropdb.dbname ?? 'unknown';

    return {
      ruleId: 'MP034',
      ruleName: 'ban-drop-database',
      severity: 'critical',
      message: `DROP DATABASE "${dbName}" permanently destroys the entire database. This should never appear in a migration file.`,
      line: ctx.line,
      safeAlternative: `-- DROP DATABASE should never be in a migration file.
-- If you need to reset a database, use a separate administrative script.`,
    };
  },
};
