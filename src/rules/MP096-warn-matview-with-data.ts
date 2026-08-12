import type { Rule, RuleContext, RuleViolation } from './engine.js';

/**
 * MP096: CREATE MATERIALIZED VIEW ... WITH DATA
 *
 * WITH DATA is the default, so most CREATE MATERIALIZED VIEW statements
 * populate the view immediately — running the underlying query to completion
 * inside the migration, holding locks on every table it reads for the whole
 * build.
 *
 * WITH NO DATA creates the view unpopulated and returns instantly. The build
 * then happens in a REFRESH the migration does not have to wait for. The
 * catch worth knowing: an unpopulated matview cannot be queried until its
 * first REFRESH, and that first REFRESH cannot use CONCURRENTLY.
 */

export const warnMatviewWithData: Rule = {
  id: 'MP096',
  name: 'warn-matview-with-data',
  severity: 'warning',
  description: 'CREATE MATERIALIZED VIEW ... WITH DATA runs the full query inside the migration, holding locks on every source table.',
  whyItMatters:
    'WITH DATA is the default, so this usually happens without anyone choosing it. The migration ' +
    'then runs the view query to completion. An aggregate over a large fact table can take many ' +
    'minutes, while holding locks on every table the query reads and keeping the migration ' +
    'transaction open the entire time. Deploy tooling with a timeout gives up partway and leaves ' +
    'the schema half-applied. Creating the view WITH NO DATA returns immediately and moves the ' +
    'expensive part into a REFRESH you can schedule, retry, and run outside the deploy.',
  docsUrl: 'https://migrationpilot.dev/rules/mp096',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (!('CreateTableAsStmt' in stmt)) return null;

    const createAs = stmt.CreateTableAsStmt as {
      objtype?: string;
      into?: { rel?: { relname?: string }; skipData?: boolean };
    };

    // CREATE TABLE ... AS shares this node type; only matviews are in scope.
    if (createAs.objtype !== 'OBJECT_MATVIEW') return null;

    // skipData is set only by WITH NO DATA; its absence means WITH DATA.
    if (createAs.into?.skipData === true) return null;

    const viewName = createAs.into?.rel?.relname ?? 'unknown';

    return {
      ruleId: 'MP096',
      ruleName: 'warn-matview-with-data',
      severity: 'warning',
      message: `CREATE MATERIALIZED VIEW "${viewName}" populates immediately (WITH DATA is the default). The migration blocks until the full query completes, holding locks on every source table.`,
      line: ctx.line,
      safeAlternative: `-- Create the view empty so the migration returns straight away:
CREATE MATERIALIZED VIEW ${viewName} AS SELECT ... WITH NO DATA;

-- Populate it outside the migration. The first refresh cannot use
-- CONCURRENTLY, and the view is not queryable until it completes:
REFRESH MATERIALIZED VIEW ${viewName};

-- A unique index lets every later refresh run without blocking readers:
CREATE UNIQUE INDEX CONCURRENTLY ${viewName}_pk ON ${viewName} (<key>);
REFRESH MATERIALIZED VIEW CONCURRENTLY ${viewName};`,
    };
  },
};
