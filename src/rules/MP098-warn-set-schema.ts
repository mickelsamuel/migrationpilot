import type { Rule, RuleContext, RuleViolation } from './engine.js';

/**
 * MP098: warn-set-schema
 *
 * SET SCHEMA moves an object to a different namespace. Anything that referred
 * to it by qualified name — application queries, views, functions, other
 * migrations, grants written against the old path — is now pointing at a
 * schema where the object no longer is.
 *
 * Unqualified references resolve through search_path, so whether they keep
 * working depends on whether the new schema happens to be on the path of the
 * role running the query. That makes the outcome differ between the migration
 * user, the application user, and whoever is debugging it at the time.
 */

const OBJECT_TYPE_LABELS: Record<string, string> = {
  OBJECT_TABLE: 'Table',
  OBJECT_VIEW: 'View',
  OBJECT_MATVIEW: 'Materialized view',
  OBJECT_SEQUENCE: 'Sequence',
  OBJECT_FUNCTION: 'Function',
  OBJECT_PROCEDURE: 'Procedure',
  OBJECT_TYPE: 'Type',
  OBJECT_DOMAIN: 'Domain',
  OBJECT_FOREIGN_TABLE: 'Foreign table',
};

export const warnSetSchema: Rule = {
  id: 'MP098',
  name: 'warn-set-schema',
  severity: 'warning',
  description: 'ALTER ... SET SCHEMA breaks every schema-qualified reference to the object and changes how unqualified ones resolve.',
  whyItMatters:
    'Moving an object between schemas is a rename in every way that matters. Queries that named it ' +
    'as old_schema.object start failing with "relation does not exist" the moment the migration ' +
    'commits, and there is no deprecation window — the old path stops working at the same instant ' +
    'the new one starts. Unqualified references are worse, because whether they still resolve ' +
    'depends on each role\'s search_path, so the migration can succeed, your psql session can look ' +
    'fine, and the application can still be broken. Views and functions that reference the object ' +
    'follow it by dependency, but the SQL your application ships does not.',
  docsUrl: 'https://migrationpilot.dev/rules/mp098',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (!('AlterObjectSchemaStmt' in stmt)) return null;

    const alterSchema = stmt.AlterObjectSchemaStmt as {
      objectType?: string;
      newschema?: string;
      relation?: { relname?: string; schemaname?: string };
      object?: unknown;
    };

    const objectName = alterSchema.relation?.relname ?? extractObjectName(alterSchema.object) ?? 'unknown';
    const oldSchema = alterSchema.relation?.schemaname;
    const newSchema = alterSchema.newschema ?? 'the new schema';
    const label = OBJECT_TYPE_LABELS[alterSchema.objectType ?? ''] ?? 'Object';
    const fromPhrase = oldSchema ? `"${oldSchema}"` : 'its current schema';

    return {
      ruleId: 'MP098',
      ruleName: 'warn-set-schema',
      severity: 'warning',
      message: `${label} "${objectName}" is being moved from ${fromPhrase} to "${newSchema}". Every schema-qualified reference to it breaks at commit, and unqualified references now resolve only for roles whose search_path includes "${newSchema}".`,
      line: ctx.line,
      safeAlternative: `-- Give callers an overlap window instead of a hard cutover. Move the
-- object, then leave a view behind at the old path:
ALTER TABLE ${oldSchema ? `${oldSchema}.` : ''}${objectName} SET SCHEMA ${newSchema};
CREATE VIEW ${oldSchema ? `${oldSchema}.` : ''}${objectName} AS
  SELECT * FROM ${newSchema}.${objectName};

-- Ship the application change, confirm nothing reads the old path, then
-- drop the compatibility view in a later migration:
-- DROP VIEW ${oldSchema ? `${oldSchema}.` : ''}${objectName};

-- Check what still references the old path before cutting over:
SELECT * FROM pg_depend WHERE refobjid = '${objectName}'::regclass;`,
    };
  },
};

/** Non-relation objects (functions, types) carry their name in `object` instead. */
function extractObjectName(object: unknown): string | null {
  if (!object || typeof object !== 'object') return null;

  const record = object as Record<string, unknown>;

  const list = record.List as { items?: Array<{ String?: { sval?: string } }> } | undefined;
  if (list?.items) {
    const parts = list.items.map(i => i.String?.sval).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1] as string;
  }

  const objWithArgs = record.ObjectWithArgs as
    | { objname?: Array<{ String?: { sval?: string } }> }
    | undefined;
  if (objWithArgs?.objname) {
    const parts = objWithArgs.objname.map(n => n.String?.sval).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1] as string;
  }

  const str = record.String as { sval?: string } | undefined;
  return str?.sval ?? null;
}
